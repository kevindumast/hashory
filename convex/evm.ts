import { action, type ActionCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { decryptSecret } from "./utils/encryption";
import { requireUserId } from "./auth";
import { rejectedDataProviderKey, requireDataProviderKey } from "./dataProviderKeys";
import { dataProviderLabel } from "../lib/data-providers";
import { etherscanLikeBaseUrl, evmChain, evmDataset, type EvmChain } from "../lib/evm-chains";
import {
  interpretEtherscanResponse,
  parseMoralisHistory,
  parseNativeTxs,
  parseTokenTxs,
  type EtherscanResponse,
  type EtherscanTokenTx,
  type EtherscanTx,
  type MoralisHistoryItem,
  type ParsedTransfers,
} from "../lib/evm-transfers";

const PAGE_SIZE = 1000;
const MAX_PAGES = 10;

const MORALIS_API_BASE = "https://deep-index.moralis.io/api/v2.2";
const MORALIS_PAGE_SIZE = 100;
// Une page coûte des crédits Moralis : au-delà, la suite est lue à la
// prochaine synchronisation, qui reprend au curseur.
const MORALIS_MAX_PAGES = 20;

interface SyncCursor {
  lastBlockNumber: number;
}

/**
 * Synchronise un wallet EVM, quelle que soit la chaîne. Le compte doit
 * appartenir à l'utilisateur et être de la chaîne attendue.
 */
export async function runEvmWalletSync(
  ctx: ActionCtx,
  integrationId: Id<"integrations">,
  expectedProvider?: string
) {
  const clerkUserId = await requireUserId(ctx);
  const integration = await ctx.runQuery(internal.integrations.getByIdInternal, {
    integrationId,
  });

  if (!integration || integration.clerkUserId !== clerkUserId) {
    throw new Error("Integration not found");
  }

  const chain = evmChain(integration.provider);
  if (!chain || (expectedProvider && integration.provider !== expectedProvider)) {
    throw new Error(
      `Cette intégration n'est pas de type ${expectedProvider ? evmChain(expectedProvider)?.label : "EVM"}`
    );
  }

  // La clé de l'utilisateur, jamais celle de l'hébergeur.
  const apiKey = await requireDataProviderKey(ctx, clerkUserId, chain.dataProvider);

  const walletAddress = decryptSecret(integration.encryptedCredentials.apiKey);
  if (!walletAddress) {
    throw new Error("Wallet address not found");
  }

  const address = walletAddress.toLowerCase();

  await ctx.runMutation(internal.integrations.updateSyncStatus, {
    integrationId,
    syncStatus: "syncing",
  });

  try {
    if (chain.dataProvider === "moralis") {
      await syncMoralisHistory(ctx, integrationId, address, apiKey, chain);
    } else {
      await syncEtherscanStream(ctx, integrationId, address, apiKey, chain, "native");
      await syncEtherscanStream(ctx, integrationId, address, apiKey, chain, "erc20");
    }

    await ctx.runMutation(internal.integrations.updateSyncStatus, {
      integrationId,
      syncStatus: "synced",
    });

    // Date de dernière réussite : c'est elle qui permet de savoir quand
    // une source doit être resynchronisée.
    await ctx.runMutation(internal.integrations.updateMetadata, {
      integrationId,
      lastSyncedAt: Date.now(),
    });
  } catch (error) {
    await ctx.runMutation(internal.integrations.updateSyncStatus, {
      integrationId,
      syncStatus: "error",
    });
    throw error;
  }
}

/** Synchronisation d'un wallet Arbitrum, Base ou BNB Smart Chain. */
export const syncEvmWallet = action({
  args: {
    integrationId: v.id("integrations"),
  },
  handler: async (ctx, args) => {
    await runEvmWalletSync(ctx, args.integrationId);
  },
});

async function readCursor(
  ctx: ActionCtx,
  integrationId: Id<"integrations">,
  dataset: string,
  scope: string
): Promise<number> {
  const state = await ctx.runQuery(api.integrations.getSyncState, {
    integrationId,
    dataset,
    scope,
  });
  return ((state?.cursor ?? null) as SyncCursor | null)?.lastBlockNumber ?? 0;
}

async function writeCursor(
  ctx: ActionCtx,
  integrationId: Id<"integrations">,
  dataset: string,
  scope: string,
  lastBlockNumber: number
) {
  await ctx.runMutation(internal.integrations.updateSyncState, {
    integrationId,
    dataset,
    scope,
    cursor: { lastBlockNumber } as SyncCursor,
  });
}

async function insertTransfers(
  ctx: ActionCtx,
  integrationId: Id<"integrations">,
  parsed: ParsedTransfers
) {
  if (parsed.deposits.length === 0 && parsed.withdrawals.length === 0) return;
  await ctx.runMutation(api.blockchainSync.bulkInsertTransactions, {
    integrationId,
    deposits: parsed.deposits,
    withdrawals: parsed.withdrawals,
  });
}

/** Un flux (natif ou jetons) d'une API « à la Etherscan ». */
async function syncEtherscanStream(
  ctx: ActionCtx,
  integrationId: Id<"integrations">,
  address: string,
  apiKey: string,
  chain: EvmChain,
  stream: "native" | "erc20"
) {
  const baseUrl = etherscanLikeBaseUrl(chain);
  if (!baseUrl) throw new Error(`Aucune API Etherscan pour ${chain.label}`);
  const label = dataProviderLabel(chain.dataProvider);

  const dataset = evmDataset(chain, stream);
  const scope = address;
  const startBlock = await readCursor(ctx, integrationId, dataset, scope);
  let newMaxBlock = startBlock;
  const actionName = stream === "native" ? "txlist" : "tokentx";

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${baseUrl}&module=account&action=${actionName}&address=${address}&startblock=${startBlock}&endblock=99999999&page=${page}&offset=${PAGE_SIZE}&sort=asc&apikey=${apiKey}`;

    const response = await fetch(url);
    if (response.status === 401 || response.status === 403) {
      throw rejectedDataProviderKey(chain.dataProvider);
    }
    if (!response.ok) {
      throw new Error(`${label} API error: ${response.statusText}`);
    }

    const data = (await response.json()) as EtherscanResponse<EtherscanTx & EtherscanTokenTx>;
    const outcome = interpretEtherscanResponse(data);

    if (outcome.kind === "empty") break;
    if (outcome.kind === "rejected_key") throw rejectedDataProviderKey(chain.dataProvider);
    if (outcome.kind === "paid_chain") {
      throw new ConvexError({
        code: "paid_chain",
        provider: chain.dataProvider,
        message: `${label} ne donne pas accès à ${chain.label} avec une clé gratuite.`,
      });
    }
    if (outcome.kind === "error") {
      throw new Error(`${label} error: ${outcome.message}`);
    }

    const parsed =
      stream === "native"
        ? parseNativeTxs(outcome.txs, address, chain)
        : parseTokenTxs(outcome.txs, address, chain);
    if (parsed.maxBlock > newMaxBlock) newMaxBlock = parsed.maxBlock;

    await insertTransfers(ctx, integrationId, parsed);

    if (outcome.txs.length < PAGE_SIZE) break;
  }

  await writeCursor(ctx, integrationId, dataset, scope, newMaxBlock);
}

interface MoralisHistoryResponse {
  cursor?: string | null;
  result?: MoralisHistoryItem[];
  message?: string;
}

/** Historique Moralis : transferts natifs et jetons en un seul flux. */
async function syncMoralisHistory(
  ctx: ActionCtx,
  integrationId: Id<"integrations">,
  address: string,
  apiKey: string,
  chain: EvmChain
) {
  const dataset = evmDataset(chain, "history");
  const scope = address;
  const startBlock = await readCursor(ctx, integrationId, dataset, scope);
  let newMaxBlock = startBlock;
  let cursor: string | null = null;

  for (let page = 0; page < MORALIS_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      chain: `0x${chain.chainId.toString(16)}`,
      order: "ASC",
      limit: String(MORALIS_PAGE_SIZE),
      from_block: String(startBlock),
    });
    if (cursor) params.set("cursor", cursor);

    const response = await fetch(`${MORALIS_API_BASE}/wallets/${address}/history?${params}`, {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
    });
    if (response.status === 401 || response.status === 403) {
      throw rejectedDataProviderKey("moralis");
    }
    if (response.status === 429) {
      throw new ConvexError({
        code: "rate_limited",
        provider: "moralis",
        message: "Moralis limite le débit de votre clé : réessayez plus tard.",
      });
    }
    if (!response.ok) {
      throw new Error(`Moralis API error: ${response.statusText}`);
    }

    const data = (await response.json()) as MoralisHistoryResponse;
    const items = Array.isArray(data.result) ? data.result : [];

    const parsed = parseMoralisHistory(items, address, chain);
    if (parsed.maxBlock > newMaxBlock) newMaxBlock = parsed.maxBlock;
    await insertTransfers(ctx, integrationId, parsed);

    cursor = data.cursor || null;
    if (!cursor || items.length === 0) break;
  }

  await writeCursor(ctx, integrationId, dataset, scope, newMaxBlock);
}
