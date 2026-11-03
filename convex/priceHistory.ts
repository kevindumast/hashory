import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { optionalUserId } from "./auth";

const DAY_MS = 86_400_000;

// CoinGecko fallback ids, used when neither Binance nor KuCoin has a USDT pair.
const GECKO_IDS: Record<string, string> = {
  KAS: "kaspa",
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  DOT: "polkadot",
  MATIC: "matic-network",
  AVAX: "avalanche-2",
  TRX: "tron",
  LINK: "chainlink",
  LTC: "litecoin",
  TON: "the-open-network",
  TAO: "bittensor",
};

const STABLECOINS = new Set(["USDT", "USDC", "BUSD", "FDUSD", "TUSD", "DAI", "USD"]);

// Upper bound on rows read per call. The dashboard never needs more: the
// per-platform history caps itself at 12,000 symbol-days. Anything above is
// abuse, paid from the database quota that every user shares.
const MAX_ROWS_PER_QUERY = 12_000;

function startOfUtcDay(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// ─── Query: read range for the dashboard ───────────────────────────────

export const getRange = query({
  args: {
    symbol: v.string(),
    fromDay: v.number(),
    toDay: v.number(),
  },
  handler: async (ctx, { symbol, fromDay, toDay }) => {
    const clerkId = await optionalUserId(ctx);
    if (!clerkId) return [];
    const upper = symbol.toUpperCase();
    return await ctx.db
      .query("tokenPriceHistory")
      .withIndex("by_symbol_day", (q) =>
        q.eq("symbol", upper).gte("dayUtc", fromDay).lte("dayUtc", toDay)
      )
      .take(MAX_ROWS_PER_QUERY);
  },
});

export const getRangeMulti = query({
  args: {
    symbols: v.array(v.string()),
    fromDay: v.number(),
    toDay: v.number(),
  },
  handler: async (ctx, { symbols, fromDay, toDay }) => {
    const result: Record<string, { dayUtc: number; closeUsd: number }[]> = {};
    const clerkId = await optionalUserId(ctx);
    if (!clerkId) return result;

    // One budget for the whole call, so repeating a symbol buys nothing.
    let budget = MAX_ROWS_PER_QUERY;
    for (const symbol of symbols) {
      if (budget <= 0) break;
      const upper = symbol.toUpperCase();
      const rows = await ctx.db
        .query("tokenPriceHistory")
        .withIndex("by_symbol_day", (q) =>
          q.eq("symbol", upper).gte("dayUtc", fromDay).lte("dayUtc", toDay)
        )
        .take(budget);
      budget -= rows.length;
      result[upper] = rows
        .map((r) => ({ dayUtc: r.dayUtc, closeUsd: r.closeUsd }))
        .sort((a, b) => a.dayUtc - b.dayUtc);
    }
    return result;
  },
});

// ─── Internal helpers ─────────────────────────────────────────────────

export const getLatestDay = internalQuery({
  args: { symbol: v.string() },
  handler: async (ctx, { symbol }) => {
    const latest = await ctx.db
      .query("tokenPriceHistory")
      .withIndex("by_symbol_day", (q) => q.eq("symbol", symbol.toUpperCase()))
      .order("desc")
      .first();
    return latest?.dayUtc ?? null;
  },
});

export const insertBatch = internalMutation({
  args: {
    symbol: v.string(),
    source: v.union(v.literal("binance"), v.literal("kucoin"), v.literal("coingecko"), v.literal("manual")),
    points: v.array(v.object({ dayUtc: v.number(), closeUsd: v.number() })),
  },
  handler: async (ctx, { symbol, source, points }) => {
    const upper = symbol.toUpperCase();
    const now = Date.now();
    let inserted = 0;

    for (const point of points) {
      if (!Number.isFinite(point.closeUsd) || point.closeUsd <= 0) continue;
      const existing = await ctx.db
        .query("tokenPriceHistory")
        .withIndex("by_symbol_day", (q) => q.eq("symbol", upper).eq("dayUtc", point.dayUtc))
        .unique();
      if (existing) {
        if (Math.abs(existing.closeUsd - point.closeUsd) > 1e-9) {
          await ctx.db.patch(existing._id, { closeUsd: point.closeUsd, source, updatedAt: now });
        }
        continue;
      }
      await ctx.db.insert("tokenPriceHistory", {
        symbol: upper,
        dayUtc: point.dayUtc,
        closeUsd: point.closeUsd,
        source,
        updatedAt: now,
      });
      inserted += 1;
    }

    return { inserted };
  },
});

// ─── External fetchers ────────────────────────────────────────────────

async function fetchBinanceDaily(
  symbol: string,
  startMs: number,
  endMs: number
): Promise<{ dayUtc: number; closeUsd: number }[]> {
  // Binance klines: 1d candles, USDT pair, max 1000 per call
  const out: { dayUtc: number; closeUsd: number }[] = [];
  const pair = `${symbol}USDT`;
  let cursor = startMs;

  while (cursor <= endMs) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=1d&startTime=${cursor}&endTime=${endMs}&limit=1000`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      // 400 = unknown symbol — silently bail so caller can try CoinGecko
      if (res.status === 400) return [];
      throw new Error(`Binance klines ${pair} failed: ${res.status}`);
    }
    const data = (await res.json()) as Array<[number, string, string, string, string, string, number, ...unknown[]]>;
    if (!Array.isArray(data) || data.length === 0) break;

    for (const candle of data) {
      const openTime = candle[0];
      const close = Number(candle[4]);
      if (!Number.isFinite(close) || close <= 0) continue;
      out.push({ dayUtc: startOfUtcDay(openTime), closeUsd: close });
    }

    const lastClose = data[data.length - 1][6]; // closeTime
    if (data.length < 1000) break;
    cursor = lastClose + 1;
  }

  return out;
}

/**
 * KuCoin cote des actifs absents de Binance (KAS, notamment), avec tout
 * l'historique et sans clé. Les bougies arrivent de la plus récente à la plus
 * ancienne, 1 500 au plus par appel : on avance donc par fenêtres.
 */
async function fetchKucoinDaily(
  symbol: string,
  startMs: number,
  endMs: number
): Promise<{ dayUtc: number; closeUsd: number }[]> {
  const WINDOW_MS = 1_500 * DAY_MS;
  const byDay = new Map<number, number>();
  const pair = `${symbol}-USDT`;

  for (let from = startMs; from <= endMs; from += WINDOW_MS) {
    const to = Math.min(from + WINDOW_MS - 1, endMs + DAY_MS - 1);
    const url = `https://api.kucoin.com/api/v1/market/candles?type=1day&symbol=${pair}&startAt=${Math.floor(from / 1000)}&endAt=${Math.floor(to / 1000)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`KuCoin candles ${pair} failed: ${res.status}`);
    const body = (await res.json()) as { code?: string; data?: string[][] };
    // Paire inconnue : KuCoin répond 200 avec un code d'erreur.
    if (body.code !== "200000" || !Array.isArray(body.data)) return [];

    for (const candle of body.data) {
      const close = Number(candle[2]);
      if (!Number.isFinite(close) || close <= 0) continue;
      byDay.set(startOfUtcDay(Number(candle[0]) * 1000), close);
    }
  }

  return Array.from(byDay.entries())
    .filter(([dayUtc]) => dayUtc >= startMs && dayUtc <= endMs)
    .sort(([a], [b]) => a - b)
    .map(([dayUtc, closeUsd]) => ({ dayUtc, closeUsd }));
}

async function fetchCoingeckoDaily(
  symbol: string,
  startMs: number,
  endMs: number
): Promise<{ dayUtc: number; closeUsd: number }[]> {
  const id = GECKO_IDS[symbol.toUpperCase()];
  if (!id) return [];

  // L'API publique refuse (401) toute plage qui remonte à plus de 365 jours :
  // on se contente de la dernière année plutôt que de ne rien obtenir.
  const fromSec = Math.floor(Math.max(startMs, endMs - 364 * DAY_MS) / 1000);
  const toSec = Math.floor(endMs / 1000);
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart/range?vs_currency=usd&from=${fromSec}&to=${toSec}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { prices?: Array<[number, number]> };
  if (!data.prices) return [];

  // CoinGecko returns hourly/daily depending on range; collapse to one close per UTC day (last seen wins)
  const byDay = new Map<number, number>();
  for (const [ts, price] of data.prices) {
    if (!Number.isFinite(price) || price <= 0) continue;
    byDay.set(startOfUtcDay(ts), price);
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => a - b)
    .map(([dayUtc, closeUsd]) => ({ dayUtc, closeUsd }));
}

// ─── Public action: backfill one symbol incrementally ─────────────────

export const backfillSymbol = internalAction({
  args: {
    symbol: v.string(),
    fromTs: v.number(),
  },
  handler: async (ctx, { symbol, fromTs }): Promise<{ symbol: string; inserted: number; source: string | null }> => {
    const upper = symbol.toUpperCase();

    // Stablecoins are pegged at $1 — no need to fetch, store one synthetic point.
    if (STABLECOINS.has(upper)) {
      const today = startOfUtcDay(Date.now());
      await ctx.runMutation(internal.priceHistory.insertBatch, {
        symbol: upper,
        source: "manual",
        points: [{ dayUtc: today, closeUsd: 1 }],
      });
      return { symbol: upper, inserted: 0, source: "manual" };
    }

    const latestDay = await ctx.runQuery(internal.priceHistory.getLatestDay, { symbol: upper });
    const startDay = latestDay !== null ? latestDay + DAY_MS : startOfUtcDay(fromTs);
    const endDay = startOfUtcDay(Date.now());

    if (startDay > endDay) {
      return { symbol: upper, inserted: 0, source: null };
    }

    // 1. Try Binance first
    let points: { dayUtc: number; closeUsd: number }[] = [];
    let source: "binance" | "kucoin" | "coingecko" = "binance";
    try {
      points = await fetchBinanceDaily(upper, startDay, endDay);
    } catch (err) {
      console.warn(`[priceHistory] Binance failed for ${upper}:`, err);
    }

    // 2. KuCoin, pour les actifs que Binance ne cote pas
    if (points.length === 0) {
      try {
        points = await fetchKucoinDaily(upper, startDay, endDay);
        source = "kucoin";
      } catch (err) {
        console.warn(`[priceHistory] KuCoin failed for ${upper}:`, err);
      }
    }

    // 3. CoinGecko en dernier recours
    if (points.length === 0) {
      try {
        points = await fetchCoingeckoDaily(upper, startDay, endDay);
        source = "coingecko";
      } catch (err) {
        console.warn(`[priceHistory] CoinGecko failed for ${upper}:`, err);
      }
    }

    if (points.length === 0) {
      console.warn(`[priceHistory] No data for ${upper} from ${new Date(startDay).toISOString()}`);
      return { symbol: upper, inserted: 0, source: null };
    }

    // Convex mutations are bounded; chunk inserts (≤ 500 per call).
    const CHUNK = 500;
    let totalInserted = 0;
    for (let i = 0; i < points.length; i += CHUNK) {
      const slice = points.slice(i, i + CHUNK);
      const { inserted } = await ctx.runMutation(internal.priceHistory.insertBatch, {
        symbol: upper,
        source,
        points: slice,
      });
      totalInserted += inserted;
    }

    console.log(`[priceHistory] ${upper}: ${totalInserted} new days from ${source}`);
    return { symbol: upper, inserted: totalInserted, source };
  },
});

// Backfills many symbols at once (e.g. all tokens of a portfolio + BTC for the benchmark).
// Internal: run it from the Convex dashboard or with `npx convex run`.
export const backfillSymbols = internalAction({
  args: {
    symbols: v.array(v.string()),
    fromTs: v.number(),
  },
  handler: async (ctx, { symbols, fromTs }): Promise<{ symbol: string; inserted: number; source: string | null }[]> => {
    // BTC is always required (benchmark line)
    const set = new Set(symbols.map((s) => s.toUpperCase()));
    set.add("BTC");

    const results: { symbol: string; inserted: number; source: string | null }[] = [];
    for (const symbol of set) {
      const r = await ctx.runAction(internal.priceHistory.backfillSymbol, { symbol, fromTs });
      results.push(r);
    }
    return results;
  },
});
