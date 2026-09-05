import { action } from "./_generated/server";
import { v } from "convex/values";
import HmacSHA512 from "crypto-js/hmac-sha512";
import SHA256 from "crypto-js/sha256";
import Base64 from "crypto-js/enc-base64";
import Utf8 from "crypto-js/enc-utf8";
import { decryptSecret } from "./utils/encryption";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";

const KRAKEN_BASE_URL = "https://api.kraken.com";
const PAGE_SIZE = 50; // Kraken renvoie 50 entrées par page, sans possibilité d'augmenter.
const DELAY_MS = 1_500; // Le compteur d'appels privés se reconstitue lentement.
const MAX_PAGES = 100;

const DATASET_TRADES = "kraken_trades";
const DATASET_LEDGERS = "kraken_ledgers";
const SCOPE = "default";

/** Contreparties : leur présence d'un côté du couple en fixe le sens. */
const QUOTE_ASSETS = new Set(["EUR", "USD", "GBP", "CHF", "USDT", "USDC", "DAI", "USDG", "PYUSD"]);

/* ─── Authentification ─────────────────────────────────────────────────────
   Kraken signe chaque appel privé ainsi :

     API-Sign = base64( HMAC-SHA512( chemin + SHA256(nonce + corps),
                                     base64_decode(secret) ) )

   Le nonce doit croître strictement d'un appel à l'autre : on prend la
   microseconde courante, ce qui laisse une marge confortable même en cas
   d'appels rapprochés.
   ────────────────────────────────────────────────────────────────────────── */

function sign(path: string, postData: string, nonce: string, apiSecret: string): string {
  const hashed = SHA256(nonce + postData);
  // Le message signé est la concaténation des octets du chemin et du condensé.
  const message = Utf8.parse(path).concat(hashed);
  const key = Base64.parse(apiSecret);
  return HmacSHA512(message, key).toString(Base64);
}

type KrakenResponse<T> = { error?: string[]; result?: T };

async function privatePost<T>(
  apiKey: string,
  apiSecret: string,
  method: string,
  params: Record<string, string | number> = {}
): Promise<T> {
  const path = `/0/private/${method}`;
  const nonce = String(Date.now() * 1000);

  const body = new URLSearchParams({ nonce });
  for (const [key, value] of Object.entries(params)) {
    body.set(key, String(value));
  }
  const postData = body.toString();

  const response = await fetch(`${KRAKEN_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "API-Key": apiKey,
      "API-Sign": sign(path, postData, nonce, apiSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: postData,
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`Kraken a répondu ${response.status} sur ${method}.`);
  }

  const payload = (await response.json()) as KrakenResponse<T>;

  if (payload.error && payload.error.length > 0) {
    // Les messages Kraken sont de la forme « EAPI:Invalid key ».
    throw new Error(`Kraken : ${payload.error.join(", ")}`);
  }
  if (!payload.result) {
    throw new Error(`Kraken n'a rien renvoyé sur ${method}.`);
  }

  return payload.result;
}

/* ─── Normalisation des actifs ─────────────────────────────────────────────
   Kraken conserve une nomenclature historique : les cryptos sont préfixées
   d'un X et les monnaies d'un Z lorsque le code fait quatre caractères, et
   le bitcoin s'y nomme XBT.
   ────────────────────────────────────────────────────────────────────────── */

const ASSET_ALIASES: Record<string, string> = {
  XBT: "BTC",
  XDG: "DOGE",
};

export function normalizeAsset(raw: string): string {
  let asset = raw.toUpperCase().trim();

  // Kraken suffixe certaines lignes de rendement : XBT.S, ETH.M…
  const dotIndex = asset.indexOf(".");
  if (dotIndex > 0) asset = asset.slice(0, dotIndex);

  // Les codes à quatre caractères portent un préfixe de classe.
  if (asset.length === 4 && (asset.startsWith("X") || asset.startsWith("Z"))) {
    asset = asset.slice(1);
  }

  return ASSET_ALIASES[asset] ?? asset;
}

type PairInfo = { base: string; quote: string };

/**
 * Table des paires, depuis l'endpoint public.
 *
 * Découper « XXBTZEUR » à l'aveugle est une source d'erreurs : la longueur
 * des codes varie. Kraken publie la décomposition, autant s'en servir.
 */
async function fetchPairMap(): Promise<Map<string, PairInfo>> {
  const map = new Map<string, PairInfo>();

  const response = await fetch(`${KRAKEN_BASE_URL}/0/public/AssetPairs`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return map;

  const payload = (await response.json()) as KrakenResponse<
    Record<string, { base?: string; quote?: string; altname?: string }>
  >;

  for (const [name, info] of Object.entries(payload.result ?? {})) {
    if (!info.base || !info.quote) continue;
    const entry = { base: normalizeAsset(info.base), quote: normalizeAsset(info.quote) };
    map.set(name, entry);
    if (info.altname) map.set(info.altname, entry);
  }

  return map;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* ─── Types de réponse ─────────────────────────────────────────────────── */

type KrakenTrade = {
  ordertxid?: string;
  pair: string;
  time: number; // secondes, avec décimales
  type: "buy" | "sell";
  price: string;
  cost: string;
  fee: string;
  vol: string;
};

type KrakenLedger = {
  refid?: string;
  time: number;
  type: string;
  asset: string;
  amount: string;
  fee: string;
};

/* ─── Synchronisation ──────────────────────────────────────────────────── */

async function syncTrades(
  ctx: ActionCtx,
  integrationId: Id<"integrations">,
  apiKey: string,
  apiSecret: string,
  pairs: Map<string, PairInfo>
): Promise<number> {
  const state = await ctx.runQuery(api.integrations.getSyncState, {
    integrationId,
    dataset: DATASET_TRADES,
    scope: SCOPE,
  });
  const cursor = state?.cursor as { latestTs?: number } | null;

  // Reprise incrémentale : on ne redemande que ce qui suit la dernière
  // opération connue. Une seconde de recouvrement évite de perdre une
  // transaction enregistrée dans la même seconde que la précédente.
  const start = cursor?.latestTs ? Math.floor(cursor.latestTs / 1000) - 1 : undefined;

  let offset = 0;
  let latestTs = cursor?.latestTs ?? 0;
  let imported = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await privatePost<{ trades: Record<string, KrakenTrade>; count: number }>(
      apiKey,
      apiSecret,
      "TradesHistory",
      start !== undefined ? { ofs: offset, start } : { ofs: offset }
    );

    const entries = Object.entries(result.trades ?? {});
    if (entries.length === 0) break;

    const batch = entries.map(([txid, trade]) => {
      const pair = pairs.get(trade.pair);
      const base = pair?.base ?? normalizeAsset(trade.pair);
      const quote = pair?.quote ?? "USD";
      const executedAt = Math.round(trade.time * 1000);
      if (executedAt > latestTs) latestTs = executedAt;

      return {
        providerTradeId: txid,
        providerOrderId: trade.ordertxid,
        tradeType: "SPOT" as const,
        symbol: `${base}${quote}`,
        side: trade.type === "buy" ? ("BUY" as const) : ("SELL" as const),
        quantity: Number(trade.vol),
        price: Number(trade.price),
        quoteQuantity: Number(trade.cost),
        fee: Number(trade.fee),
        // Les frais Kraken sont prélevés dans la devise de cotation.
        feeAsset: quote,
        isMaker: false,
        executedAt,
        raw: trade,
      };
    });

    await ctx.runMutation(internal.trades.ingestBatch, { integrationId, trades: batch });
    imported += batch.length;

    if (entries.length < PAGE_SIZE) break;
    offset += entries.length;
    await wait(DELAY_MS);
  }

  if (latestTs > 0) {
    await ctx.runMutation(internal.integrations.updateSyncState, {
      integrationId,
      dataset: DATASET_TRADES,
      scope: SCOPE,
      cursor: { latestTs },
    });
  }

  return imported;
}

async function syncLedgers(
  ctx: ActionCtx,
  integrationId: Id<"integrations">,
  apiKey: string,
  apiSecret: string
): Promise<{ deposits: number; withdrawals: number; converts: number }> {
  const state = await ctx.runQuery(api.integrations.getSyncState, {
    integrationId,
    dataset: DATASET_LEDGERS,
    scope: SCOPE,
  });
  const cursor = state?.cursor as { latestTs?: number } | null;
  const start = cursor?.latestTs ? Math.floor(cursor.latestTs / 1000) - 1 : undefined;

  let offset = 0;
  let latestTs = cursor?.latestTs ?? 0;
  let deposits = 0;
  let withdrawals = 0;

  // Une conversion Kraken n'apparaît pas dans TradesHistory : elle produit
  // deux écritures, « spend » pour l'actif cédé et « receive » pour l'actif
  // obtenu, réunies par un même refid. On les rassemble avant de les
  // convertir en opération, car rien ne garantit qu'elles tombent sur la
  // même page.
  const swapLegs = new Map<
    string,
    { spend?: { asset: string; amount: number }; receive?: { asset: string; amount: number }; timestamp: number }
  >();

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await privatePost<{ ledger: Record<string, KrakenLedger>; count: number }>(
      apiKey,
      apiSecret,
      "Ledgers",
      start !== undefined ? { ofs: offset, start } : { ofs: offset }
    );

    const entries = Object.entries(result.ledger ?? {});
    if (entries.length === 0) break;

    for (const [ledgerId, entry] of entries) {
      const timestamp = Math.round(entry.time * 1000);
      if (timestamp > latestTs) latestTs = timestamp;

      const amount = Number(entry.amount);
      const asset = normalizeAsset(entry.asset);

      if (entry.type === "deposit" && amount > 0) {
        await ctx.runMutation(internal.deposits.insert, {
          integrationId,
          deposit: {
            depositId: ledgerId,
            coin: asset,
            amount,
            network: "kraken",
            status: "CONFIRMED",
            insertTime: timestamp,
            txId: entry.refid,
            createdAt: timestamp,
          },
        });
        deposits += 1;
      } else if (entry.type === "withdrawal" && amount < 0) {
        await ctx.runMutation(internal.withdrawals.insert, {
          integrationId,
          withdrawal: {
            withdrawId: ledgerId,
            coin: asset,
            amount: Math.abs(amount),
            network: "kraken",
            status: "CONFIRMED",
            applyTime: timestamp,
            txId: entry.refid,
            fee: Number(entry.fee) || 0,
            createdAt: timestamp,
          },
        });
        withdrawals += 1;
      } else if (entry.type === "spend" || entry.type === "receive") {
        const reference = entry.refid ?? ledgerId;
        const leg = swapLegs.get(reference) ?? { timestamp };
        leg.timestamp = Math.max(leg.timestamp, timestamp);
        if (entry.type === "spend") {
          leg.spend = { asset, amount: Math.abs(amount) };
        } else {
          leg.receive = { asset, amount: Math.abs(amount) };
        }
        swapLegs.set(reference, leg);
      }
    }

    if (entries.length < PAGE_SIZE) break;
    offset += entries.length;
    await wait(DELAY_MS);
  }

  if (latestTs > 0) {
    await ctx.runMutation(internal.integrations.updateSyncState, {
      integrationId,
      dataset: DATASET_LEDGERS,
      scope: SCOPE,
      cursor: { latestTs },
    });
  }

  // Seuls les couples complets décrivent une conversion exploitable.
  const converts = Array.from(swapLegs.entries()).flatMap(([reference, leg]) => {
    if (!leg.spend || !leg.receive) return [];
    if (leg.spend.amount <= 0 || leg.receive.amount <= 0) return [];

    const from = leg.spend;
    const to = leg.receive;

    // La contrepartie sert de cotation ; à défaut, l'actif reçu fait office
    // de base, comme pour les conversions crypto contre crypto.
    const toIsQuote = QUOTE_ASSETS.has(to.asset);
    const side = toIsQuote ? ("SELL" as const) : ("BUY" as const);
    const base = toIsQuote ? from.asset : to.asset;
    const quote = toIsQuote ? to.asset : from.asset;
    const quantity = toIsQuote ? from.amount : to.amount;
    const quoteQuantity = toIsQuote ? to.amount : from.amount;

    return [
      {
        providerTradeId: `convert:${reference}`,
        tradeType: "CONVERT" as const,
        symbol: `${base}${quote}`,
        side,
        quantity,
        price: quantity > 0 ? quoteQuantity / quantity : 0,
        quoteQuantity,
        isMaker: false,
        executedAt: leg.timestamp,
        fromAsset: from.asset,
        fromAmount: from.amount,
        toAsset: to.asset,
        toAmount: to.amount,
      },
    ];
  });

  if (converts.length > 0) {
    await ctx.runMutation(internal.trades.ingestBatch, { integrationId, trades: converts });
  }

  return { deposits, withdrawals, converts: converts.length };
}

/**
 * Synchronise un compte Kraken : opérations, dépôts et retraits.
 *
 * La reprise est incrémentale — chaque jeu de données garde la date de sa
 * dernière entrée connue et ne redemande que la suite. Un appel répété ne
 * relit donc pas tout l'historique.
 */
export const syncAccount = action({
  args: { integrationId: v.id("integrations") },
  handler: async (
    ctx,
    args
  ): Promise<{ trades: number; deposits: number; withdrawals: number; converts: number }> => {
    const integration = await ctx.runQuery(internal.integrations.getByIdInternal, {
      integrationId: args.integrationId,
    });

    if (!integration) {
      throw new Error("Intégration introuvable.");
    }
    if (integration.provider !== "kraken") {
      throw new Error("Cette intégration n'est pas un compte Kraken.");
    }

    const apiKey = decryptSecret(integration.encryptedCredentials.apiKey);
    const apiSecret = decryptSecret(integration.encryptedCredentials.apiSecret);

    await ctx.runMutation(internal.integrations.updateSyncStatus, {
      integrationId: args.integrationId,
      syncStatus: "syncing",
    });

    try {
      const pairs = await fetchPairMap();

      const trades = await syncTrades(ctx, args.integrationId, apiKey, apiSecret, pairs);
      await wait(DELAY_MS);
      const { deposits, withdrawals, converts } = await syncLedgers(
        ctx,
        args.integrationId,
        apiKey,
        apiSecret
      );

      await ctx.runMutation(internal.integrations.updateSyncStatus, {
        integrationId: args.integrationId,
        syncStatus: "synced",
      });
      await ctx.runMutation(internal.integrations.updateMetadata, {
        integrationId: args.integrationId,
        lastSyncedAt: Date.now(),
      });

      return { trades, deposits, withdrawals, converts };
    } catch (error) {
      await ctx.runMutation(internal.integrations.updateSyncStatus, {
        integrationId: args.integrationId,
        syncStatus: "error",
      });
      throw error;
    }
  },
});
