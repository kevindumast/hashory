import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { decryptSecret } from "./utils/encryption";
import { requireUserId } from "./auth";
import { rejectedDataProviderKey, requireDataProviderKey } from "./dataProviderKeys";

const HELIUS_API_BASE = "https://api.helius.xyz/v0";
const LAMPORTS_PER_SOL = 1_000_000_000;
const PAGE_SIZE = 100;

interface HeliusNativeTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  amount: number;
}

interface HeliusTokenTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  mint: string;
  tokenAmount: number;
  tokenStandard?: string;
}

interface HeliusTx {
  signature: string;
  timestamp: number;
  fee: number;
  nativeTransfers: HeliusNativeTransfer[];
  tokenTransfers: HeliusTokenTransfer[];
}

interface SyncCursor {
  lastSignature: string | null;
}

const HELIUS_RPC_URL = "https://mainnet.helius-rpc.com";
/** Plafond de l'API DAS pour un appel getAssetBatch. */
const ASSET_BATCH_SIZE = 1000;

/**
 * Mints courants, résolus sans appel réseau. Le wSOL reste distinct du SOL
 * natif : ses transferts doublent souvent les mouvements natifs du même
 * échange, les fondre ensemble compterait deux fois le même SOL.
 */
const KNOWN_MINTS: Record<string, string> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
  So11111111111111111111111111111111111111112: "WSOL",
  BZLbGTNCSFfoth2GYDtwr7e4imWzpR5jqcUuGEwr646K: "IO",
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: "JUP",
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: "BONK",
};

/**
 * Symboles qu'un jeton inconnu n'a pas le droit de revendiquer. N'importe qui
 * peut créer un mint nommé « USDC » et l'envoyer à un wallet : sans ce garde,
 * ce jeton de spam serait valorisé au cours du vrai.
 */
const PROTECTED_SYMBOLS = new Set([
  ...Object.values(KNOWN_MINTS),
  "SOL", "BTC", "ETH", "WBTC", "WETH", "DAI", "PYUSD", "USDE", "EURC", "USDS",
]);

const VALID_SYMBOL_RE = /^[A-Z0-9.]{1,15}$/;

/** Repli historique : les 8 premiers caractères du mint. */
function fallbackSymbol(mint: string): string {
  return mint.slice(0, 8);
}

interface HeliusAsset {
  id: string;
  content?: { metadata?: { symbol?: string } };
  token_info?: { symbol?: string };
}

/**
 * Complète `cache` avec le ticker de chaque mint, lu dans les métadonnées du
 * jeton (API DAS de Helius). Un échec réseau ne bloque pas la synchro : le
 * mint garde alors son repli tronqué.
 */
async function resolveMintSymbols(apiKey: string, mints: string[], cache: Map<string, string>) {
  const unknown = [...new Set(mints)].filter((mint) => !cache.has(mint));
  const toFetch: string[] = [];
  for (const mint of unknown) {
    const known = KNOWN_MINTS[mint];
    if (known) cache.set(mint, known);
    else toFetch.push(mint);
  }

  for (let i = 0; i < toFetch.length; i += ASSET_BATCH_SIZE) {
    const ids = toFetch.slice(i, i + ASSET_BATCH_SIZE);
    let assets: Array<HeliusAsset | null> = [];
    try {
      const response = await fetch(`${HELIUS_RPC_URL}/?api-key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "hashory", method: "getAssetBatch", params: { ids } }),
      });
      if (response.ok) {
        const body = (await response.json()) as { result?: Array<HeliusAsset | null> };
        assets = Array.isArray(body.result) ? body.result : [];
      }
    } catch {
      // Repli tronqué pour ce lot.
    }

    const byMint = new Map<string, HeliusAsset>();
    for (const asset of assets) {
      if (asset?.id) byMint.set(asset.id, asset);
    }

    for (const mint of ids) {
      const asset = byMint.get(mint);
      const raw = asset?.token_info?.symbol || asset?.content?.metadata?.symbol || "";
      const symbol = raw.trim().toUpperCase();
      const usable = VALID_SYMBOL_RE.test(symbol) && !PROTECTED_SYMBOLS.has(symbol);
      cache.set(mint, usable ? symbol : fallbackSymbol(mint));
    }
  }
}

export const syncSolanaWallet = action({
  args: {
    integrationId: v.id("integrations"),
  },
  handler: async (ctx, args) => {
    const clerkUserId = await requireUserId(ctx);
    const integration = await ctx.runQuery(internal.integrations.getByIdInternal, {
      integrationId: args.integrationId,
    });

    if (!integration || integration.clerkUserId !== clerkUserId) {
      throw new Error("Integration not found");
    }

    if (integration.provider !== "solana") {
      throw new Error("Cette intégration n'est pas de type Solana");
    }

    // La clé de l'utilisateur, jamais celle de l'hébergeur.
    const apiKey = await requireDataProviderKey(ctx, clerkUserId, "helius");

    const walletAddress = decryptSecret(integration.encryptedCredentials.apiKey);
    if (!walletAddress) {
      throw new Error("Wallet address not found");
    }

    await ctx.runMutation(internal.integrations.updateSyncStatus, {
      integrationId: args.integrationId,
      syncStatus: "syncing",
    });

    try {
      const dataset = "solana_transactions";
      const scope = walletAddress;

      const state = await ctx.runQuery(api.integrations.getSyncState, {
        integrationId: args.integrationId,
        dataset,
        scope,
      });

      const previousCursor = (state?.cursor ?? null) as SyncCursor | null;
      let beforeSignature: string | null = null;
      let newFirstSignature: string | null = previousCursor?.lastSignature ?? null;
      let hasMore = true;
      let isFirstPage = true;
      // Ticker de chaque mint, résolu une fois pour toute la synchro.
      const mintSymbols = new Map<string, string>();

      while (hasMore) {
        let url = `${HELIUS_API_BASE}/addresses/${walletAddress}/transactions?api-key=${apiKey}&limit=${PAGE_SIZE}`;
        if (beforeSignature) {
          url += `&before=${beforeSignature}`;
        }

        const response = await fetch(url);
        if (response.status === 401 || response.status === 403) {
          throw rejectedDataProviderKey("helius");
        }
        if (!response.ok) {
          // Le corps dit pourquoi (adresse refusée, curseur inconnu…) ; le
          // statut seul ne permettait pas de diagnostiquer.
          const detail = (await response.text().catch(() => "")).slice(0, 300);
          throw new Error(`Helius API error: ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ""}`);
        }

        const txs = (await response.json()) as HeliusTx[];

        if (!Array.isArray(txs) || txs.length === 0) {
          hasMore = false;
          break;
        }

        if (isFirstPage) {
          newFirstSignature = txs[0].signature;
          isFirstPage = false;
        }

        let reachedKnown = false;

        await resolveMintSymbols(
          apiKey,
          txs.flatMap((tx) => (tx.tokenTransfers ?? []).map((transfer) => transfer.mint)),
          mintSymbols,
        );

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
          if (previousCursor?.lastSignature && tx.signature === previousCursor.lastSignature) {
            reachedKnown = true;
            break;
          }

          const timestamp = tx.timestamp * 1000;
          const feeSol = tx.fee / LAMPORTS_PER_SOL;

          for (const transfer of tx.nativeTransfers) {
            const amount = transfer.amount / LAMPORTS_PER_SOL;
            if (amount <= 0) continue;

            if (transfer.toUserAccount === walletAddress && transfer.fromUserAccount !== walletAddress) {
              deposits.push({
                depositId: `${tx.signature}-sol-${transfer.fromUserAccount.slice(0, 8)}-in`,
                coin: "SOL",
                amount,
                network: "solana",
                status: "CONFIRMED",
                insertTime: timestamp,
                txId: tx.signature,
              });
            } else if (transfer.fromUserAccount === walletAddress && transfer.toUserAccount !== walletAddress) {
              withdrawals.push({
                withdrawId: `${tx.signature}-sol-${transfer.toUserAccount.slice(0, 8)}-out`,
                coin: "SOL",
                amount,
                network: "solana",
                status: "CONFIRMED",
                applyTime: timestamp,
                txId: tx.signature,
                fee: feeSol,
              });
            }
          }

          for (const transfer of tx.tokenTransfers) {
            const amount = transfer.tokenAmount;
            if (amount <= 0) continue;
            const symbol = mintSymbols.get(transfer.mint) ?? fallbackSymbol(transfer.mint);

            if (transfer.toUserAccount === walletAddress && transfer.fromUserAccount !== walletAddress) {
              deposits.push({
                depositId: `${tx.signature}-spl-${transfer.mint.slice(0, 8)}-in`,
                coin: symbol,
                amount,
                network: "solana",
                status: "CONFIRMED",
                insertTime: timestamp,
                txId: tx.signature,
              });
            } else if (transfer.fromUserAccount === walletAddress && transfer.toUserAccount !== walletAddress) {
              withdrawals.push({
                withdrawId: `${tx.signature}-spl-${transfer.mint.slice(0, 8)}-out`,
                coin: symbol,
                amount,
                network: "solana",
                status: "CONFIRMED",
                applyTime: timestamp,
                txId: tx.signature,
                fee: 0,
              });
            }
          }
        }

        if (deposits.length > 0 || withdrawals.length > 0) {
          await ctx.runMutation(api.blockchainSync.bulkInsertTransactions, {
            integrationId: args.integrationId,
            deposits,
            withdrawals,
          });
        }

        if (reachedKnown || txs.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          beforeSignature = txs[txs.length - 1].signature;
        }
      }

      await ctx.runMutation(internal.integrations.updateSyncState, {
        integrationId: args.integrationId,
        dataset,
        scope,
        cursor: { lastSignature: newFirstSignature } as SyncCursor,
      });

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
  },
});
