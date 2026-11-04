import { action, type ActionCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { decryptSecret } from "./utils/encryption";
import { requireUserId } from "./auth";
import { rejectedDataProviderKey, requireDataProviderKey } from "./dataProviderKeys";
import { dataProviderLabel } from "../lib/data-providers";
import { dexFromAddress } from "../lib/dex";
import {
  alchemyRpcUrl,
  etherscanLikeBaseUrl,
  evmChain,
  evmDataset,
  type EvmChain,
} from "../lib/evm-chains";
import {
  alchemyBlocksMissingTimestamp,
  alchemyOutgoingNativeHashes,
  feeFromReceipt,
  interpretEtherscanResponse,
  parseAlchemyTransfers,
  parseInternalTxs,
  parseNativeTxs,
  parseTokenTxs,
  type AlchemyTransfer,
  type EtherscanInternalTx,
  type EtherscanResponse,
  type EtherscanTokenTx,
  type EtherscanTx,
  type ParsedTransfers,
} from "../lib/evm-transfers";

const PAGE_SIZE = 1000;
const MAX_PAGES = 10;

// Une page Alchemy compte jusqu'à 1 000 transferts. Au-delà de ce nombre
// de pages, la suite est lue à la prochaine synchronisation, qui reprend au
// curseur.
const ALCHEMY_MAX_PAGES = 10;
// Taille des lots JSON-RPC (horodatages de blocs, reçus de transaction).
const ALCHEMY_BATCH_SIZE = 100;

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
    if (chain.dataProvider === "alchemy") {
      await syncAlchemyTransfers(ctx, integrationId, address, apiKey, chain, "in");
      await syncAlchemyTransfers(ctx, integrationId, address, apiKey, chain, "out");
    } else {
      await syncEtherscanStream(ctx, integrationId, address, apiKey, chain, "native");
      await syncEtherscanStream(ctx, integrationId, address, apiKey, chain, "erc20");
      // Secondaire : un indexeur qui ne le sert pas ne bloque pas la synchro.
      await syncEtherscanStream(ctx, integrationId, address, apiKey, chain, "internal").catch((error) =>
        console.warn(`[evm] transferts internes ${chain.label} non lus`, error)
      );
    }

    // Quel DEX derrière chaque swap : jamais bloquant pour la synchro.
    await identifyEvmSwaps(ctx, integrationId, apiKey, chain).catch((error) =>
      console.warn(`[evm] DEX non identifiés sur ${chain.label}`, error)
    );

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

/** Synchronisation d'un wallet EVM du référentiel (Arbitrum, Base, BSC, Polygon, OP, Avalanche, Linea…). */
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
  stream: "native" | "erc20" | "internal"
) {
  const baseUrl = etherscanLikeBaseUrl(chain);
  if (!baseUrl) throw new Error(`Aucune API Etherscan pour ${chain.label}`);
  const label = dataProviderLabel(chain.dataProvider);

  const dataset = evmDataset(chain, stream);
  const scope = address;
  const startBlock = await readCursor(ctx, integrationId, dataset, scope);
  let newMaxBlock = startBlock;
  const actionName = stream === "native" ? "txlist" : stream === "internal" ? "txlistinternal" : "tokentx";

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${baseUrl}&module=account&action=${actionName}&address=${address}&startblock=${startBlock}&endblock=99999999&page=${page}&offset=${PAGE_SIZE}&sort=asc&apikey=${apiKey}`;

    const response = await fetch(url);
    if (response.status === 401 || response.status === 403) {
      throw rejectedDataProviderKey(chain.dataProvider);
    }
    if (!response.ok) {
      throw new Error(`${label} API error: ${response.statusText}`);
    }

    const data = (await response.json()) as EtherscanResponse<EtherscanTx & EtherscanTokenTx & EtherscanInternalTx>;
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
        : stream === "internal"
          ? parseInternalTxs(outcome.txs, address, chain)
          : parseTokenTxs(outcome.txs, address, chain);
    if (parsed.maxBlock > newMaxBlock) newMaxBlock = parsed.maxBlock;

    await insertTransfers(ctx, integrationId, parsed);

    if (outcome.txs.length < PAGE_SIZE) break;
  }

  await writeCursor(ctx, integrationId, dataset, scope, newMaxBlock);
}

type JsonRpcResponse<T> = {
  id?: number | string | null;
  result?: T;
  error?: { code?: number; message?: string };
};

/** Appel JSON-RPC Alchemy, unitaire ou par lot, avec ses erreurs traduites. */
async function alchemyRpc<T>(url: string, body: unknown, chainLabel = "ce réseau"): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });

  if (response.status === 401) throw rejectedDataProviderKey("alchemy");
  if (response.status === 403) {
    const text = await response.text();
    // Une app Alchemy n'ouvre que les réseaux cochés dans son tableau de bord.
    if (/not enabled|network/i.test(text)) {
      throw new ConvexError({
        code: "network_not_enabled",
        provider: "alchemy",
        message:
          `Votre app Alchemy n'a pas accès à ${chainLabel} : activez ce réseau dans le tableau de bord Alchemy.`,
      });
    }
    throw rejectedDataProviderKey("alchemy");
  }
  if (response.status === 429) {
    throw new ConvexError({
      code: "rate_limited",
      provider: "alchemy",
      message: "Alchemy limite le débit de votre clé : réessayez plus tard.",
    });
  }
  if (!response.ok) {
    throw new Error(`Alchemy API error: ${response.statusText}`);
  }
  return (await response.json()) as T;
}

/** Résultat d'un appel unitaire, ou l'erreur JSON-RPC qu'il porte. */
function rpcResult<T>(payload: JsonRpcResponse<T>): T {
  if (payload.error) {
    if (/must be authenticated|invalid api key/i.test(payload.error.message ?? "")) {
      throw rejectedDataProviderKey("alchemy");
    }
    throw new Error(`Alchemy error: ${payload.error.message ?? "réponse invalide"}`);
  }
  return payload.result as T;
}

/** Appels identiques par lots, résultats rendus dans l'ordre des paramètres. */
async function alchemyBatch<T>(url: string, method: string, paramsList: unknown[][]): Promise<T[]> {
  const results: T[] = [];
  for (let start = 0; start < paramsList.length; start += ALCHEMY_BATCH_SIZE) {
    const chunk = paramsList.slice(start, start + ALCHEMY_BATCH_SIZE);
    const payload = await alchemyRpc<JsonRpcResponse<T>[]>(
      url,
      chunk.map((params, index) => ({ jsonrpc: "2.0", id: index, method, params }))
    );
    const byId = new Map(payload.map((item) => [Number(item.id), item]));
    chunk.forEach((_, index) => {
      const item = byId.get(index);
      if (!item) throw new Error(`Alchemy error: réponse manquante pour ${method}`);
      results.push(rpcResult(item));
    });
  }
  return results;
}

/**
 * Transferts reçus (`in`) ou envoyés (`out`) par l'adresse. Alchemy filtre
 * sur un seul côté du transfert à la fois : chaque sens a son curseur.
 */
async function syncAlchemyTransfers(
  ctx: ActionCtx,
  integrationId: Id<"integrations">,
  address: string,
  apiKey: string,
  chain: EvmChain,
  direction: "in" | "out"
) {
  const url = alchemyRpcUrl(chain, apiKey);
  if (!url) throw new Error(`Aucune API Alchemy pour ${chain.label}`);

  const dataset = evmDataset(chain, direction);
  const scope = address;
  const startBlock = await readCursor(ctx, integrationId, dataset, scope);
  let newMaxBlock = startBlock;
  let pageKey: string | undefined;

  for (let page = 0; page < ALCHEMY_MAX_PAGES; page++) {
    const payload = await alchemyRpc<
      JsonRpcResponse<{ transfers?: AlchemyTransfer[]; pageKey?: string }>
    >(url, {
      jsonrpc: "2.0",
      id: 1,
      method: "alchemy_getAssetTransfers",
      params: [
        {
          fromBlock: `0x${startBlock.toString(16)}`,
          toBlock: "latest",
          [direction === "in" ? "toAddress" : "fromAddress"]: address,
          category: ["external", "erc20"],
          order: "asc",
          excludeZeroValue: true,
          maxCount: "0x3e8",
          ...(pageKey ? { pageKey } : {}),
        },
      ],
    }, chain.label);
    const result = rpcResult(payload);
    const transfers = result?.transfers ?? [];

    // Alchemy ne date pas les transferts sur BSC : on lit les blocs.
    const blocks = alchemyBlocksMissingTimestamp(transfers);
    const blockRows = await alchemyBatch<{ timestamp: string } | null>(
      url,
      "eth_getBlockByNumber",
      blocks.map((block) => [block, false])
    );
    const blockTimes = new Map<string, number>();
    blocks.forEach((block, index) => {
      const row = blockRows[index];
      if (row?.timestamp) blockTimes.set(block, parseInt(row.timestamp, 16) * 1000);
    });

    // Ni les frais : on lit le reçu des envois natifs.
    const hashes = alchemyOutgoingNativeHashes(transfers, address);
    const receipts = await alchemyBatch<{ gasUsed: string; effectiveGasPrice: string } | null>(
      url,
      "eth_getTransactionReceipt",
      hashes.map((hash) => [hash])
    );
    const fees = new Map<string, number>();
    hashes.forEach((hash, index) => {
      const receipt = receipts[index];
      if (receipt?.gasUsed && receipt.effectiveGasPrice) fees.set(hash, feeFromReceipt(receipt));
    });

    const parsed = parseAlchemyTransfers(transfers, address, chain, { blockTimes, fees });
    if (parsed.maxBlock > newMaxBlock) newMaxBlock = parsed.maxBlock;
    await insertTransfers(ctx, integrationId, parsed);

    pageKey = result?.pageKey || undefined;
    if (!pageKey || transfers.length === 0) break;
  }

  await writeCursor(ctx, integrationId, dataset, scope, newMaxBlock);
}

/** Swaps traités par synchronisation : l'historique se complète par lots. */
const SWAP_LOOKUPS_PER_SYNC = 60;

/**
 * Nomme le DEX des swaps du wallet : le contrat que la transaction appelle
 * (le champ `to` de la transaction, pas celui des transferts) est comparé
 * aux routeurs connus. Un contrat inconnu est noté tel quel, pour être
 * montré à l'utilisateur.
 */
async function identifyEvmSwaps(ctx: ActionCtx, integrationId: Id<"integrations">, apiKey: string, chain: EvmChain) {
  const hashes: string[] = await ctx.runQuery(internal.blockchainSync.swapHashesToIdentify, {
    integrationId,
    limit: SWAP_LOOKUPS_PER_SYNC,
  });
  if (hashes.length === 0) return;

  const contracts = new Map<string, string | null>();
  const rpcUrl = alchemyRpcUrl(chain, apiKey);
  if (chain.dataProvider === "alchemy" && rpcUrl) {
    const rows = await alchemyBatch<{ to: string | null } | null>(
      rpcUrl,
      "eth_getTransactionByHash",
      hashes.map((hash) => [hash])
    );
    hashes.forEach((hash, index) => contracts.set(hash, rows[index]?.to ?? null));
  } else {
    const baseUrl = etherscanLikeBaseUrl(chain);
    if (!baseUrl) return;
    for (const hash of hashes) {
      const response = await fetch(
        `${baseUrl}&module=proxy&action=eth_getTransactionByHash&txhash=${hash}&apikey=${apiKey}`
      );
      if (!response.ok) break;
      const data = (await response.json()) as { result?: { to?: string | null } | string | null };
      // Une limite de débit se lit dans le texte de `result` : on reprendra plus tard.
      if (typeof data.result === "string") break;
      contracts.set(hash, data.result?.to ?? null);
      // Offre gratuite : quelques appels par seconde au plus.
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  const items = [...contracts].map(([txId, contract]) => ({
    txId,
    protocol: dexFromAddress(chain.id, contract) ?? "",
    ...(contract ? { contract: contract.toLowerCase() } : {}),
  }));
  await ctx.runMutation(internal.blockchainSync.setSwapProtocols, { integrationId, items });
}
