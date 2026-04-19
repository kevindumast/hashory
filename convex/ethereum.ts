import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { decryptSecret } from "./utils/encryption";

const ETHERSCAN_API_BASE = "https://api.etherscan.io/v2/api?chainid=1";
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

export const syncEthereumWallet = action({
  args: {
    integrationId: v.id("integrations"),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.runQuery(api.integrations.getById, {
      integrationId: args.integrationId,
    });

    if (!integration) {
      throw new Error("Integration not found");
    }

    if (integration.provider !== "ethereum") {
      throw new Error("Cette intégration n'est pas de type Ethereum");
    }

    const apiKey = process.env.ETHERSCAN_API_KEY;
    if (!apiKey) {
      throw new Error("ETHERSCAN_API_KEY not configured in Convex environment");
    }

    const walletAddress = decryptSecret(integration.encryptedCredentials.apiKey);
    if (!walletAddress) {
      throw new Error("Wallet address not found");
    }

    const address = walletAddress.toLowerCase();

    await ctx.runMutation(api.integrations.updateSyncStatus, {
      integrationId: args.integrationId,
      syncStatus: "syncing",
    });

    try {
      await syncNativeEth(ctx, args.integrationId, address, apiKey);
      await syncErc20(ctx, args.integrationId, address, apiKey);

      await ctx.runMutation(api.integrations.updateSyncStatus, {
        integrationId: args.integrationId,
        syncStatus: "synced",
      });
    } catch (error) {
      await ctx.runMutation(api.integrations.updateSyncStatus, {
        integrationId: args.integrationId,
        syncStatus: "error",
      });
      throw error;
    }
  },
});

async function syncNativeEth(
  ctx: any,
  integrationId: any,
  address: string,
  apiKey: string
) {
  const dataset = "ethereum_native";
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
    const url = `${ETHERSCAN_API_BASE}&module=account&action=txlist&address=${address}&startblock=${startBlock}&endblock=99999999&page=${page}&offset=${PAGE_SIZE}&sort=asc&apikey=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Etherscan API error: ${response.statusText}`);
    }

    const data = (await response.json()) as EtherscanResponse<EtherscanTx>;

    if (data.status !== "1") {
      if (data.message === "No transactions found") break;
      const detail = typeof data.result === "string" ? data.result : "";
      throw new Error(`Etherscan error: ${data.message} ${detail}`.trim());
    }

    const txs = Array.isArray(data.result) ? data.result : [];

    for (const tx of txs) {
      const blockNumber = parseInt(tx.blockNumber, 10);
      if (blockNumber > newMaxBlock) newMaxBlock = blockNumber;

      if (tx.isError === "1") continue;

      const value = BigInt(tx.value);
      if (value === BigInt(0)) continue;

      const timeStamp = parseInt(tx.timeStamp, 10) * 1000;
      const amountEth = Number(value) / 1e18;
      const from = tx.from.toLowerCase();
      const to = tx.to.toLowerCase();

      if (to === address && from !== address) {
        await ctx.runMutation(api.kaspa.insertDeposit, {
          integrationId,
          depositId: `${tx.hash}-eth-in`,
          coin: "ETH",
          amount: amountEth,
          network: "ethereum",
          status: "CONFIRMED",
          insertTime: timeStamp,
          txId: tx.hash,
        });
      } else if (from === address) {
        const gasFee = Number(BigInt(tx.gasUsed) * BigInt(tx.gasPrice)) / 1e18;
        await ctx.runMutation(api.kaspa.insertWithdrawal, {
          integrationId,
          withdrawId: `${tx.hash}-eth-out`,
          coin: "ETH",
          amount: amountEth,
          network: "ethereum",
          status: "CONFIRMED",
          applyTime: timeStamp,
          txId: tx.hash,
          fee: gasFee,
        });
      }
    }

    if (txs.length < PAGE_SIZE || page >= MAX_PAGES) {
      hasMore = false;
    } else {
      page++;
    }
  }

  await ctx.runMutation(api.integrations.updateSyncState, {
    integrationId,
    dataset,
    scope,
    cursor: { lastBlockNumber: newMaxBlock } as SyncCursor,
  });
}

async function syncErc20(
  ctx: any,
  integrationId: any,
  address: string,
  apiKey: string
) {
  const dataset = "ethereum_erc20";
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
    const url = `${ETHERSCAN_API_BASE}&module=account&action=tokentx&address=${address}&startblock=${startBlock}&endblock=99999999&page=${page}&offset=${PAGE_SIZE}&sort=asc&apikey=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Etherscan API error: ${response.statusText}`);
    }

    const data = (await response.json()) as EtherscanResponse<EtherscanTokenTx>;

    if (data.status !== "1") {
      if (data.message === "No transactions found") break;
      const detail = typeof data.result === "string" ? data.result : "";
      throw new Error(`Etherscan error: ${data.message} ${detail}`.trim());
    }

    const txs = Array.isArray(data.result) ? data.result : [];

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
        await ctx.runMutation(api.kaspa.insertDeposit, {
          integrationId,
          depositId: `${tx.hash}-${contract}-in`,
          coin: symbol,
          amount,
          network: "ethereum",
          status: "CONFIRMED",
          insertTime: timeStamp,
          txId: tx.hash,
        });
      } else if (from === address) {
        await ctx.runMutation(api.kaspa.insertWithdrawal, {
          integrationId,
          withdrawId: `${tx.hash}-${contract}-out`,
          coin: symbol,
          amount,
          network: "ethereum",
          status: "CONFIRMED",
          applyTime: timeStamp,
          txId: tx.hash,
          fee: 0,
        });
      }
    }

    if (txs.length < PAGE_SIZE || page >= MAX_PAGES) {
      hasMore = false;
    } else {
      page++;
    }
  }

  await ctx.runMutation(api.integrations.updateSyncState, {
    integrationId,
    dataset,
    scope,
    cursor: { lastBlockNumber: newMaxBlock } as SyncCursor,
  });
}
