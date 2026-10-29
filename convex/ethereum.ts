import { action, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { decryptSecret } from "./utils/encryption";
import { requireUserId } from "./auth";
import { rejectedDataProviderKey, requireDataProviderKey } from "./dataProviderKeys";

/**
 * Chaînes compatibles EVM lues par l'API Etherscan V2 : une seule clé
 * Etherscan couvre toutes les chaînes, seul le `chainid` change. Le jeton
 * natif, lui, diffère — de l'ETH sur Arbitrum, du BNB sur BSC.
 */
type EvmChain = {
  provider: "ethereum" | "bsc" | "arbitrum";
  label: string;
  chainId: number;
  nativeSymbol: string;
};

const EVM_CHAINS = {
  ethereum: { provider: "ethereum", label: "Ethereum", chainId: 1, nativeSymbol: "ETH" },
  bsc: { provider: "bsc", label: "BNB Smart Chain", chainId: 56, nativeSymbol: "BNB" },
  arbitrum: { provider: "arbitrum", label: "Arbitrum One", chainId: 42161, nativeSymbol: "ETH" },
} as const satisfies Record<string, EvmChain>;

const ETHERSCAN_API_BASE = "https://api.etherscan.io/v2/api";
const PAGE_SIZE = 1000;
const MAX_PAGES = 10;

interface EtherscanTx {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  gasUsed: string;
  gasPrice: string;
  isError: string;
}

interface EtherscanTokenTx {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenSymbol: string;
  tokenDecimal: string;
  contractAddress: string;
}

interface EtherscanResponse<T> {
  status: string;
  message: string;
  result: T[] | string;
}

interface SyncCursor {
  lastBlockNumber: number;
}

const walletArgs = { integrationId: v.id("integrations") };

export const syncEthereumWallet = action({
  args: walletArgs,
  handler: (ctx, args) => syncEvmWallet(ctx, EVM_CHAINS.ethereum, args),
});

export const syncBscWallet = action({
  args: walletArgs,
  handler: (ctx, args) => syncEvmWallet(ctx, EVM_CHAINS.bsc, args),
});

export const syncArbitrumWallet = action({
  args: walletArgs,
  handler: (ctx, args) => syncEvmWallet(ctx, EVM_CHAINS.arbitrum, args),
});

async function syncEvmWallet(
  ctx: ActionCtx,
  chain: EvmChain,
  args: { integrationId: Id<"integrations"> }
) {
  const clerkUserId = await requireUserId(ctx);
  const integration = await ctx.runQuery(internal.integrations.getByIdInternal, {
    integrationId: args.integrationId,
  });

  if (!integration || integration.clerkUserId !== clerkUserId) {
    throw new Error("Integration not found");
  }

  if (integration.provider !== chain.provider) {
    throw new Error(`Cette intégration n'est pas de type ${chain.label}`);
  }

  // La clé de l'utilisateur, jamais celle de l'hébergeur.
  const apiKey = await requireDataProviderKey(ctx, clerkUserId, "etherscan");

  const walletAddress = decryptSecret(integration.encryptedCredentials.apiKey);
  if (!walletAddress) {
    throw new Error("Wallet address not found");
  }

  const address = walletAddress.toLowerCase();

  await ctx.runMutation(internal.integrations.updateSyncStatus, {
    integrationId: args.integrationId,
    syncStatus: "syncing",
  });

  try {
    await syncNativeTransfers(ctx, chain, args.integrationId, address, apiKey);
    await syncTokenTransfers(ctx, chain, args.integrationId, address, apiKey);

    await ctx.runMutation(internal.integrations.updateSyncStatus, {
      integrationId: args.integrationId,
      syncStatus: "synced",
    });

    // Date de dernière réussite : c'est elle qui permet de savoir quand
    // une source doit être resynchronisée.
    await ctx.runMutation(internal.integrations.updateMetadata, {
      integrationId: args.integrationId,
      lastSyncedAt: Date.now(),
    });
  } catch (error) {
    await ctx.runMutation(internal.integrations.updateSyncStatus, {
      integrationId: args.integrationId,
      syncStatus: "error",
    });
    throw error;
  }
}

/**
 * Erreur métier tirée d'une réponse Etherscan en échec, ou null si la
 * réponse dit seulement qu'il n'y a rien à lire.
 */
function etherscanError(chain: EvmChain, data: EtherscanResponse<unknown>): Error | null {
  if (data.message === "No transactions found") return null;
  const detail = typeof data.result === "string" ? data.result : "";
  // Etherscan répond 200 même à une clé refusée : seul le détail le dit.
  if (/invalid api key/i.test(detail)) {
    return rejectedDataProviderKey("etherscan");
  }
  // L'offre gratuite d'Etherscan ne couvre pas toutes les chaînes.
  if (/not supported for this chain|upgrade your api plan/i.test(detail)) {
    return new Error(
      `Votre offre Etherscan ne donne pas accès à ${chain.label} : une offre payante est nécessaire pour cette chaîne.`
    );
  }
  return new Error(`Etherscan error: ${data.message} ${detail}`.trim());
}

async function syncNativeTransfers(
  ctx: any,
  chain: EvmChain,
  integrationId: any,
  address: string,
  apiKey: string
) {
  const dataset = `${chain.provider}_native`;
  const scope = address;

  const state = await ctx.runQuery(api.integrations.getSyncState, {
    integrationId,
    dataset,
    scope,
  });

  const previousCursor = (state?.cursor ?? null) as SyncCursor | null;
  const startBlock = previousCursor?.lastBlockNumber ?? 0;
  let newMaxBlock = previousCursor?.lastBlockNumber ?? 0;

  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${ETHERSCAN_API_BASE}?chainid=${chain.chainId}&module=account&action=txlist&address=${address}&startblock=${startBlock}&endblock=99999999&page=${page}&offset=${PAGE_SIZE}&sort=asc&apikey=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Etherscan API error: ${response.statusText}`);
    }

    const data = (await response.json()) as EtherscanResponse<EtherscanTx>;

    if (data.status !== "1") {
      const error = etherscanError(chain, data);
      if (!error) break;
      throw error;
    }

    const txs = Array.isArray(data.result) ? data.result : [];

    const deposits: Array<{
      depositId: string;
      coin: string;
      amount: number;
      network: string;
      status: string;
      insertTime: number;
      txId: string;
    }> = [];
    const withdrawals: Array<{
      withdrawId: string;
      coin: string;
      amount: number;
      network: string;
      status: string;
      applyTime: number;
      txId: string;
      fee: number;
    }> = [];

    for (const tx of txs) {
      const blockNumber = parseInt(tx.blockNumber, 10);
      if (blockNumber > newMaxBlock) newMaxBlock = blockNumber;

      if (tx.isError === "1") continue;

      const value = BigInt(tx.value);
      if (value === BigInt(0)) continue;

      const timeStamp = parseInt(tx.timeStamp, 10) * 1000;
      const amountNative = Number(value) / 1e18;
      const from = tx.from.toLowerCase();
      const to = tx.to.toLowerCase();

      if (to === address && from !== address) {
        deposits.push({
          depositId: `${tx.hash}-${chain.nativeSymbol.toLowerCase()}-in`,
          coin: chain.nativeSymbol,
          amount: amountNative,
          network: chain.provider,
          status: "CONFIRMED",
          insertTime: timeStamp,
          txId: tx.hash,
        });
      } else if (from === address) {
        const gasFee = Number(BigInt(tx.gasUsed) * BigInt(tx.gasPrice)) / 1e18;
        withdrawals.push({
          withdrawId: `${tx.hash}-${chain.nativeSymbol.toLowerCase()}-out`,
          coin: chain.nativeSymbol,
          amount: amountNative,
          network: chain.provider,
          status: "CONFIRMED",
          applyTime: timeStamp,
          txId: tx.hash,
          fee: gasFee,
        });
      }
    }

    if (deposits.length > 0 || withdrawals.length > 0) {
      await ctx.runMutation(api.blockchainSync.bulkInsertTransactions, {
        integrationId,
        deposits,
        withdrawals,
      });
    }

    if (txs.length < PAGE_SIZE || page >= MAX_PAGES) {
      hasMore = false;
    } else {
      page++;
    }
  }

  await ctx.runMutation(internal.integrations.updateSyncState, {
    integrationId,
    dataset,
    scope,
    cursor: { lastBlockNumber: newMaxBlock } as SyncCursor,
  });
}

async function syncTokenTransfers(
  ctx: any,
  chain: EvmChain,
  integrationId: any,
  address: string,
  apiKey: string
) {
  const dataset = `${chain.provider}_erc20`;
  const scope = address;

  const state = await ctx.runQuery(api.integrations.getSyncState, {
    integrationId,
    dataset,
    scope,
  });

  const previousCursor = (state?.cursor ?? null) as SyncCursor | null;
  const startBlock = previousCursor?.lastBlockNumber ?? 0;
  let newMaxBlock = previousCursor?.lastBlockNumber ?? 0;

  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${ETHERSCAN_API_BASE}?chainid=${chain.chainId}&module=account&action=tokentx&address=${address}&startblock=${startBlock}&endblock=99999999&page=${page}&offset=${PAGE_SIZE}&sort=asc&apikey=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Etherscan API error: ${response.statusText}`);
    }

    const data = (await response.json()) as EtherscanResponse<EtherscanTokenTx>;

    if (data.status !== "1") {
      const error = etherscanError(chain, data);
      if (!error) break;
      throw error;
    }

    const txs = Array.isArray(data.result) ? data.result : [];

    const deposits: Array<{
      depositId: string;
      coin: string;
      amount: number;
      network: string;
      status: string;
      insertTime: number;
      txId: string;
    }> = [];
    const withdrawals: Array<{
      withdrawId: string;
      coin: string;
      amount: number;
      network: string;
      status: string;
      applyTime: number;
      txId: string;
      fee: number;
    }> = [];

    for (const tx of txs) {
      const blockNumber = parseInt(tx.blockNumber, 10);
      if (blockNumber > newMaxBlock) newMaxBlock = blockNumber;

      const decimals = parseInt(tx.tokenDecimal, 10);
      if (Number.isNaN(decimals)) continue;

      const value = BigInt(tx.value);
      if (value === BigInt(0)) continue;

      const timeStamp = parseInt(tx.timeStamp, 10) * 1000;
      const amount = Number(value) / 10 ** decimals;
      const from = tx.from.toLowerCase();
      const to = tx.to.toLowerCase();
      const contract = tx.contractAddress.toLowerCase();
      const symbol = tx.tokenSymbol || contract.slice(0, 8);

      if (to === address && from !== address) {
        deposits.push({
          depositId: `${tx.hash}-${contract}-in`,
          coin: symbol,
          amount,
          network: chain.provider,
          status: "CONFIRMED",
          insertTime: timeStamp,
          txId: tx.hash,
        });
      } else if (from === address) {
        withdrawals.push({
          withdrawId: `${tx.hash}-${contract}-out`,
          coin: symbol,
          amount,
          network: chain.provider,
          status: "CONFIRMED",
          applyTime: timeStamp,
          txId: tx.hash,
          fee: 0,
        });
      }
    }

    if (deposits.length > 0 || withdrawals.length > 0) {
      await ctx.runMutation(api.blockchainSync.bulkInsertTransactions, {
        integrationId,
        deposits,
        withdrawals,
      });
    }

    if (txs.length < PAGE_SIZE || page >= MAX_PAGES) {
      hasMore = false;
    } else {
      page++;
    }
  }

  await ctx.runMutation(internal.integrations.updateSyncState, {
    integrationId,
    dataset,
    scope,
    cursor: { lastBlockNumber: newMaxBlock } as SyncCursor,
  });
}
