import { action } from "./_generated/server";
import { v } from "convex/values";
import HmacSHA256 from "crypto-js/hmac-sha256";
import Base64 from "crypto-js/enc-base64";
import { decryptSecret } from "./utils/encryption";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";

const KUCOIN_BASE_URL = "https://api.kucoin.com";
const PAGE_SIZE = 500;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DELAY_MS = 300;

const DATASET_FILLS = "kucoin_fills";
const DATASET_DEPOSITS = "kucoin_deposits";
const DATASET_WITHDRAWALS = "kucoin_withdrawals";
const DATASET_CONVERTS = "kucoin_converts";

const PREFERRED_QUOTES = new Set([
  "USDT", "USDC", "USD", "DAI", "FDUSD", "TUSD", "BUSD",
  "EUR", "GBP", "BTC", "ETH", "KCS",
]);

// ─── Auth ─────────────────────────────────────────────────────────────────────

function buildHeaders(
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  method: string,
  fullPath: string,
  body = ""
) {
  const timestamp = Date.now().toString();
  const strToSign = timestamp + method.toUpperCase() + fullPath + body;
  const signature = HmacSHA256(strToSign, apiSecret).toString(Base64);
  const encPassphrase = HmacSHA256(passphrase, apiSecret).toString(Base64);
  return {
    "KC-API-KEY": apiKey,
    "KC-API-SIGN": signature,
    "KC-API-TIMESTAMP": timestamp,
    "KC-API-PASSPHRASE": encPassphrase,
    "KC-API-KEY-VERSION": "2",
    "Content-Type": "application/json",
  };
}

async function kucoinGet(
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  path: string,
  params: Record<string, string | number> = {}
): Promise<unknown> {
  const qs = new URLSearchParams();
  for (const [k, val] of Object.entries(params)) {
    qs.set(k, String(val));
  }
  const qsStr = qs.toString();
  const fullPath = qsStr ? `${path}?${qsStr}` : path;
  const headers = buildHeaders(apiKey, apiSecret, passphrase, "GET", fullPath);

  const res = await fetch(`${KUCOIN_BASE_URL}${fullPath}`, { method: "GET", headers });
  const raw = await res.text();

  if (!res.ok) {
    throw new Error(`KuCoin HTTP ${res.status} on ${path}: ${raw.slice(0, 300)}`);
  }

  let json: { code: string; msg?: string; data: unknown };
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`KuCoin parse error on ${path}: ${raw.slice(0, 200)}`);
  }

  if (json.code !== "200000") {
    throw new Error(`KuCoin API code ${json.code}: ${json.msg ?? raw.slice(0, 200)}`);
  }

  return json.data;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Types ────────────────────────────────────────────────────────────────────

type KucoinPage<T> = {
  currentPage: number;
  pageSize: number;
  totalNum: number;
  totalPage: number;
  items: T[];
};

type KucoinFill = {
  tradeId: string;
  orderId: string;
  symbol: string;
  side: "buy" | "sell";
  price: string;
  size: string;
  funds: string;
  fee: string;
  feeCurrency: string;
  liquidity: "taker" | "maker";
  createdAt: number;
  tradeType: string;
};

type KucoinDeposit = {
  address: string;
  memo?: string;
  amount: string;
  fee: string;
  currency: string;
  isInner: boolean;
  walletTxId?: string;
  status: string;
  remark?: string;
  createdAt: number;
  updatedAt: number;
};

type KucoinConvertOrder = {
  clientOrderId?: string;
  orderId: string | number;
  price: string;
  fromCurrency: string;
  toCurrency: string;
  fromCurrencySize: string;
  toCurrencySize: string;
  accountType?: string;
  orderTime: number;
  status: string;
};

type KucoinWithdrawal = {
  id: string;
  address: string;
  memo?: string;
  currency: string;
  amount: string | number;
  fee: string | number;
  walletTxId?: string;
  isInner: boolean;
  status: string;
  remark?: string;
  createdAt: number;
  updatedAt: number;
};

// ─── Fills (spot trades) ──────────────────────────────────────────────────────

async function syncFills(
  ctx: ActionCtx,
  opts: { integrationId: Id<"integrations">; apiKey: string; apiSecret: string; passphrase: string }
) {
  const { integrationId, apiKey, apiSecret, passphrase } = opts;

  const syncState = await ctx.runQuery(api.integrations.getSyncState, {
    integrationId,
    dataset: DATASET_FILLS,
    scope: "all",
  });
  const cursor = syncState?.cursor as { oldestTs?: number; latestTs?: number } | null;
  const now = Date.now();
  const DEFAULT_LOOKBACK = 3 * 365 * 24 * 60 * 60 * 1000; // 3 years

  // On first sync: sweep backward from now to 3 years ago.
  // On subsequent syncs: two passes —
  //   1. Forward from latestTs to now (new trades)
  //   2. Backward from oldestTs (older history not yet fetched)
  const latestSeen = cursor?.latestTs ?? now;
  const oldestSeen = cursor?.oldestTs ?? now;

  // Collect all windows to process
  const windows: Array<{ start: number; end: number }> = [];

  // New trades since last sync
  if (cursor) {
    let t = latestSeen;
    while (t < now) {
      windows.push({ start: t, end: Math.min(t + WEEK_MS, now) });
      t += WEEK_MS;
    }
  }

  // Older history not yet fetched (go backward from oldestSeen)
  {
    const floor = now - DEFAULT_LOOKBACK;
    let t = oldestSeen - WEEK_MS;
    while (t > floor) {
      windows.push({ start: Math.max(t, floor), end: t + WEEK_MS });
      t -= WEEK_MS;
    }
    // Include last partial window down to floor
    if (t + WEEK_MS > floor) {
      windows.push({ start: floor, end: Math.max(t + WEEK_MS, floor + 1) });
    }
  }

  type TradeBatchItem = {
    providerTradeId: string;
    providerOrderId?: string;
    tradeType: "SPOT";
    symbol: string;
    side: "BUY" | "SELL";
    quantity: number;
    price: number;
    quoteQuantity?: number;
    fee?: number;
    feeAsset?: string;
    isMaker: boolean;
    executedAt: number;
    fromAsset?: string;
    fromAmount?: number;
    toAsset?: string;
    toAmount?: number;
    raw?: unknown;
  };

  let totalFetched = 0;
  let totalInserted = 0;
  let newLatestTs = latestSeen;
  let newOldestTs = oldestSeen;

  for (const win of windows) {
    let page = 1;
    let totalPages = 1;
    const batch: TradeBatchItem[] = [];

    do {
      const data = (await kucoinGet(apiKey, apiSecret, passphrase, "/api/v1/fills", {
        tradeType: "TRADE",
        startAt: win.start,
        endAt: win.end,
        pageSize: PAGE_SIZE,
        currentPage: page,
      })) as KucoinPage<KucoinFill>;

      totalPages = data.totalPage ?? 1;
      const items = data.items ?? [];
      if (items.length > 0) console.log(`[syncFills] fenêtre ${new Date(win.start).toISOString().slice(0,10)} items=${items.length}`);
      totalFetched += items.length;

      for (const item of items) {
        if (item.createdAt > newLatestTs) newLatestTs = item.createdAt;
        if (item.createdAt < newOldestTs) newOldestTs = item.createdAt;

        const [base, quote] = item.symbol.split("-");
        const side = item.side === "buy" ? ("BUY" as const) : ("SELL" as const);
        const price = parseFloat(item.price);
        const quantity = parseFloat(item.size);
        const quoteQty = parseFloat(item.funds);
        const fee = parseFloat(item.fee);

        batch.push({
          providerTradeId: item.tradeId,
          providerOrderId: item.orderId,
          tradeType: "SPOT" as const,
          symbol: item.symbol.replace("-", ""),
          side,
          quantity,
          price,
          quoteQuantity: quoteQty,
          fee: fee > 0 ? fee : undefined,
          feeAsset: item.feeCurrency || undefined,
          isMaker: item.liquidity === "maker",
          executedAt: item.createdAt,
          fromAsset: side === "BUY" ? quote : base,
          fromAmount: side === "BUY" ? quoteQty : quantity,
          toAsset: side === "BUY" ? base : quote,
          toAmount: side === "BUY" ? quantity : quoteQty,
          raw: item,
        });
      }

      if (page >= totalPages) break;
      page++;
      await sleep(DELAY_MS);
    } while (true);

    if (batch.length > 0) {
      const result = await ctx.runMutation(api.trades.ingestBatch, {
        integrationId,
        trades: batch,
      });
      totalInserted += result.inserted;
    }

    await sleep(DELAY_MS);
  }

  await ctx.runMutation(api.integrations.updateSyncState, {
    integrationId,
    dataset: DATASET_FILLS,
    scope: "all",
    cursor: { latestTs: newLatestTs, oldestTs: newOldestTs },
  });

  return { fetched: totalFetched, inserted: totalInserted };
}

// ─── Converts (Fast Trade) ────────────────────────────────────────────────────

function resolveConvertSymbol(fromAsset: string, toAsset: string) {
  const from = fromAsset.toUpperCase();
  const to = toAsset.toUpperCase();

  // If the user paid with a quote currency, they're BUYing the other side.
  if (PREFERRED_QUOTES.has(from) && !PREFERRED_QUOTES.has(to)) {
    return { symbol: `${to}${from}`, side: "BUY" as const };
  }
  if (PREFERRED_QUOTES.has(to) && !PREFERRED_QUOTES.has(from)) {
    return { symbol: `${from}${to}`, side: "SELL" as const };
  }
  // Both quotes (e.g. USDT→USDC) or both bases: default to BUY of the destination.
  return { symbol: `${to}${from}`, side: "BUY" as const };
}

async function syncConverts(
  ctx: ActionCtx,
  opts: { integrationId: Id<"integrations">; apiKey: string; apiSecret: string; passphrase: string }
) {
  const { integrationId, apiKey, apiSecret, passphrase } = opts;

  const syncState = await ctx.runQuery(api.integrations.getSyncState, {
    integrationId,
    dataset: DATASET_CONVERTS,
    scope: "all",
  });
  const cursor = syncState?.cursor as { oldestTs?: number; latestTs?: number } | null;
  const now = Date.now();
  const DEFAULT_LOOKBACK = 365 * 24 * 60 * 60 * 1000;

  console.log("[syncConverts] cursor:", JSON.stringify(cursor));

  const latestSeen = cursor?.latestTs ?? now;
  const oldestSeen = cursor?.oldestTs ?? now;

  const windows: Array<{ start: number; end: number }> = [];

  if (cursor) {
    let t = latestSeen;
    while (t < now) {
      windows.push({ start: t, end: Math.min(t + WEEK_MS, now) });
      t += WEEK_MS;
    }
  }

  {
    const floor = now - DEFAULT_LOOKBACK;
    let t = oldestSeen - WEEK_MS;
    while (t > floor) {
      windows.push({ start: Math.max(t, floor), end: t + WEEK_MS });
      t -= WEEK_MS;
    }
    if (t + WEEK_MS > floor) {
      windows.push({ start: floor, end: Math.max(t + WEEK_MS, floor + 1) });
    }
  }

  console.log(`[syncConverts] ${windows.length} fenêtres à parcourir`);

  type TradeBatchItem = {
    providerTradeId: string;
    providerOrderId?: string;
    tradeType: "CONVERT";
    symbol: string;
    side: "BUY" | "SELL";
    quantity: number;
    price: number;
    quoteQuantity?: number;
    isMaker: boolean;
    executedAt: number;
    fromAsset?: string;
    fromAmount?: number;
    toAsset?: string;
    toAmount?: number;
    raw?: unknown;
  };

  type ConvertBatchItem = {
    providerTradeId: string;
    orderStatus: string;
    fromAsset: string;
    fromAmount: number;
    toAsset: string;
    toAmount: number;
    price: number;
    inversePrice?: number;
    executedAt: number;
    raw?: unknown;
  };

  let totalFetched = 0;
  let totalInserted = 0;
  let newLatestTs = latestSeen;
  let newOldestTs = oldestSeen;

  for (const win of windows) {
    let page = 1;
    let totalPages = 1;
    const tradesBatch: TradeBatchItem[] = [];
    const convertsBatch: ConvertBatchItem[] = [];

    do {
      let data: KucoinPage<KucoinConvertOrder>;
      try {
        console.log(`[syncConverts] fenêtre ${new Date(win.start).toISOString()} → ${new Date(win.end).toISOString()} page ${page}`);
        data = (await kucoinGet(apiKey, apiSecret, passphrase, "/api/v1/convert/order/history", {
          startAt: win.start,
          endAt: win.end,
          pageSize: 100,
          currentPage: page,
        })) as KucoinPage<KucoinConvertOrder>;
        console.log(`[syncConverts] réponse: totalPage=${data.totalPage} items=${data.items?.length ?? 0}`);
      } catch (err) {
        // KuCoin "Convert" permission not granted on this API key — skip silently
        if (err instanceof Error && err.message.includes("102425")) {
          console.log("[syncConverts] limite 1 an atteinte, arrêt du lookback");
          break;
        }
        if (err instanceof Error && err.message.includes("400007")) {
          console.log("[syncConverts] permission Convert manquante (400007), tentative via /api/v1/fills tradeType=CONVERT");
          // Fallback: converts are regular orders, try via fills endpoint
          try {
            const fallback = (await kucoinGet(apiKey, apiSecret, passphrase, "/api/v1/accounts/ledgers", {
              bizType: "CONVERT",
              startAt: win.start,
              endAt: win.end,
              pageSize: 10,
              currentPage: 1,
            })) as KucoinPage<unknown>;
            console.log(`[syncConverts] fallback ledger réponse: totalPage=${fallback.totalPage} items=${fallback.items?.length ?? 0} firstItem=${JSON.stringify(fallback.items?.[0])}`);
          } catch (fallbackErr) {
            console.log("[syncConverts] fallback ledger aussi échoué:", fallbackErr instanceof Error ? fallbackErr.message : fallbackErr);
          }
          return { fetched: 0, inserted: 0 };
        }
        throw err;
      }

      totalPages = data.totalPage ?? 1;
      const items = data.items ?? [];
      totalFetched += items.length;

      for (const item of items) {
        const status = String(item.status ?? "").toUpperCase();
        if (status !== "SUCCESS") continue;

        const fromAsset = (item.fromCurrency ?? "").toUpperCase();
        const toAsset = (item.toCurrency ?? "").toUpperCase();
        const fromAmount = parseFloat(item.fromCurrencySize);
        const toAmount = parseFloat(item.toCurrencySize);
        const orderTime = Number(item.orderTime);

        if (!fromAsset || !toAsset) continue;
        if (!Number.isFinite(fromAmount) || fromAmount <= 0) continue;
        if (!Number.isFinite(toAmount) || toAmount <= 0) continue;
        if (!Number.isFinite(orderTime) || orderTime <= 0) continue;

        if (orderTime > newLatestTs) newLatestTs = orderTime;
        if (orderTime < newOldestTs) newOldestTs = orderTime;

        const { symbol, side } = resolveConvertSymbol(fromAsset, toAsset);
        const quantity = side === "BUY" ? toAmount : fromAmount;
        const quoteQuantity = side === "BUY" ? fromAmount : toAmount;
        if (quantity <= 0) continue;
        const price = quoteQuantity / quantity;
        if (!Number.isFinite(price) || price <= 0) continue;

        const providerTradeId = `kucoin-convert:${item.orderId}`;

        tradesBatch.push({
          providerTradeId,
          providerOrderId: String(item.orderId),
          tradeType: "CONVERT",
          symbol,
          side,
          quantity,
          price,
          quoteQuantity,
          isMaker: false,
          executedAt: orderTime,
          fromAsset,
          fromAmount,
          toAsset,
          toAmount,
          raw: item,
        });

        const inversePrice = quoteQuantity > 0 ? quantity / quoteQuantity : undefined;
        convertsBatch.push({
          providerTradeId,
          orderStatus: status,
          fromAsset,
          fromAmount,
          toAsset,
          toAmount,
          price,
          inversePrice,
          executedAt: orderTime,
          raw: item,
        });
      }

      if (page >= totalPages) break;
      page++;
      await sleep(DELAY_MS);
    } while (true);

    if (tradesBatch.length > 0) {
      const result = await ctx.runMutation(api.trades.ingestBatch, {
        integrationId,
        trades: tradesBatch,
      });
      totalInserted += result.inserted;
    }
    if (convertsBatch.length > 0) {
      await ctx.runMutation(api.convertTrades.ingestBatch, {
        integrationId,
        trades: convertsBatch,
      });
    }

    await sleep(DELAY_MS);
  }

  await ctx.runMutation(api.integrations.updateSyncState, {
    integrationId,
    dataset: DATASET_CONVERTS,
    scope: "all",
    cursor: { latestTs: newLatestTs, oldestTs: newOldestTs },
  });

  console.log(`[syncConverts] terminé: fetched=${totalFetched} inserted=${totalInserted}`);
  return { fetched: totalFetched, inserted: totalInserted };
}

// ─── Deposits ─────────────────────────────────────────────────────────────────

async function syncDeposits(
  ctx: ActionCtx,
  opts: { integrationId: Id<"integrations">; apiKey: string; apiSecret: string; passphrase: string }
) {
  const { integrationId, apiKey, apiSecret, passphrase } = opts;

  const syncState = await ctx.runQuery(api.integrations.getSyncState, {
    integrationId,
    dataset: DATASET_DEPOSITS,
    scope: "all",
  });
  const cursor = syncState?.cursor as { lastCreatedAt?: number } | null;
  let fromTs = cursor?.lastCreatedAt ?? Date.now() - 3 * 365 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  let totalFetched = 0;
  let totalInserted = 0;
  let latestTs = fromTs;
  let earliest: number | null = null;

  while (fromTs < now) {
    const toTs = Math.min(fromTs + WEEK_MS, now);
    let page = 1;
    let totalPages = 1;

    do {
      const data = (await kucoinGet(apiKey, apiSecret, passphrase, "/api/v1/deposits", {
        startAt: fromTs,
        endAt: toTs,
        pageSize: 100,
        currentPage: page,
      })) as KucoinPage<KucoinDeposit>;

      totalPages = data.totalPage ?? 1;
      const items = data.items ?? [];
      totalFetched += items.length;

      for (const item of items) {
        if (item.createdAt > latestTs) latestTs = item.createdAt;
        if (earliest === null || item.createdAt < earliest) earliest = item.createdAt;

        const depositId = item.walletTxId
          ? `kucoin-${item.walletTxId}`
          : `kucoin-dep-${item.currency}-${item.createdAt}`;

        await ctx.runMutation(api.deposits.insert, {
          integrationId,
          deposit: {
            depositId,
            txId: item.walletTxId,
            coin: item.currency,
            amount: parseFloat(item.amount),
            status: item.status,
            address: item.address || undefined,
            insertTime: item.createdAt,
            confirmedTime: item.updatedAt || undefined,
            raw: item,
            createdAt: Date.now(),
          },
        });
        totalInserted++;
      }

      if (page >= totalPages) break;
      page++;
      await sleep(DELAY_MS);
    } while (true);

    fromTs = toTs;
    await sleep(DELAY_MS);
  }

  await ctx.runMutation(api.integrations.updateSyncState, {
    integrationId,
    dataset: DATASET_DEPOSITS,
    scope: "all",
    cursor: { lastCreatedAt: latestTs },
  });

  return { fetched: totalFetched, inserted: totalInserted, earliest };
}

// ─── Withdrawals ──────────────────────────────────────────────────────────────

async function syncWithdrawals(
  ctx: ActionCtx,
  opts: { integrationId: Id<"integrations">; apiKey: string; apiSecret: string; passphrase: string }
) {
  const { integrationId, apiKey, apiSecret, passphrase } = opts;

  const syncState = await ctx.runQuery(api.integrations.getSyncState, {
    integrationId,
    dataset: DATASET_WITHDRAWALS,
    scope: "all",
  });
  const cursor = syncState?.cursor as { lastCreatedAt?: number } | null;
  let fromTs = cursor?.lastCreatedAt ?? Date.now() - 3 * 365 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  let totalFetched = 0;
  let totalInserted = 0;
  let latestTs = fromTs;
  let earliest: number | null = null;

  while (fromTs < now) {
    const toTs = Math.min(fromTs + WEEK_MS, now);
    let page = 1;
    let totalPages = 1;

    do {
      const data = (await kucoinGet(apiKey, apiSecret, passphrase, "/api/v1/withdrawals", {
        startAt: fromTs,
        endAt: toTs,
        pageSize: 100,
        currentPage: page,
      })) as KucoinPage<KucoinWithdrawal>;

      totalPages = data.totalPage ?? 1;
      const items = data.items ?? [];
      totalFetched += items.length;

      for (const item of items) {
        if (item.createdAt > latestTs) latestTs = item.createdAt;
        if (earliest === null || item.createdAt < earliest) earliest = item.createdAt;

        await ctx.runMutation(api.withdrawals.insert, {
          integrationId,
          withdrawal: {
            withdrawId: item.id,
            txId: item.walletTxId,
            coin: item.currency,
            amount: parseFloat(String(item.amount)),
            fee: parseFloat(String(item.fee)),
            address: item.address || undefined,
            status: item.status,
            applyTime: item.createdAt,
            updateTime: item.updatedAt || undefined,
            raw: item,
            createdAt: Date.now(),
          },
        });
        totalInserted++;
      }

      if (page >= totalPages) break;
      page++;
      await sleep(DELAY_MS);
    } while (true);

    fromTs = toTs;
    await sleep(DELAY_MS);
  }

  await ctx.runMutation(api.integrations.updateSyncState, {
    integrationId,
    dataset: DATASET_WITHDRAWALS,
    scope: "all",
    cursor: { lastCreatedAt: latestTs },
  });

  return { fetched: totalFetched, inserted: totalInserted, earliest };
}

// ─── syncAccount ──────────────────────────────────────────────────────────────

export const syncAccount = action({
  args: {
    integrationId: v.id("integrations"),
  },
  handler: async (ctx, args) => {
    const integration = (await ctx.runQuery(api.integrations.getById, {
      integrationId: args.integrationId,
    })) as {
      provider: string;
      clerkUserId: string;
      encryptedCredentials: { apiKey: string; apiSecret: string; passphrase?: string };
    } | null;

    if (!integration) throw new Error("Intégration introuvable.");
    if (integration.provider !== "kucoin") throw new Error("Cette intégration n'est pas de type KuCoin.");

    const { apiKey, apiSecret, passphrase: encPassphrase } = integration.encryptedCredentials;
    if (!encPassphrase) throw new Error("Passphrase manquante pour cette intégration KuCoin.");

    const decryptedKey = decryptSecret(apiKey);
    const decryptedSecret = decryptSecret(apiSecret);
    const decryptedPassphrase = decryptSecret(encPassphrase);

    await ctx.runMutation(api.integrations.updateSyncStatus, {
      integrationId: args.integrationId,
      syncStatus: "syncing",
    });

    try {
      const creds = {
        integrationId: args.integrationId,
        apiKey: decryptedKey,
        apiSecret: decryptedSecret,
        passphrase: decryptedPassphrase,
      };

      const deposits = await syncDeposits(ctx, creds);
      await sleep(DELAY_MS);
      const withdrawals = await syncWithdrawals(ctx, creds);
      await sleep(DELAY_MS);
      const fills = await syncFills(ctx, creds);
      await sleep(DELAY_MS);
      const converts = await syncConverts(ctx, creds);

      const candidates = [deposits.earliest, withdrawals.earliest].filter(
        (val): val is number => val !== null
      );
      const accountCreatedAt = candidates.length > 0 ? Math.min(...candidates) : null;

      await ctx.runMutation(api.integrations.updateMetadata, {
        integrationId: args.integrationId,
        accountCreatedAt: accountCreatedAt ?? undefined,
        lastSyncedAt: Date.now(),
      });

      await ctx.runMutation(api.integrations.updateSyncStatus, {
        integrationId: args.integrationId,
        syncStatus: "synced",
      });

      return { deposits, withdrawals, fills, converts, accountCreatedAt };
    } catch (error) {
      await ctx.runMutation(api.integrations.updateSyncStatus, {
        integrationId: args.integrationId,
        syncStatus: "error",
      });
      throw error;
    }
  },
});

export const syncConvertsOnly = action({
  args: {
    integrationId: v.id("integrations"),
  },
  handler: async (ctx, args) => {
    const integration = (await ctx.runQuery(api.integrations.getById, {
      integrationId: args.integrationId,
    })) as {
      provider: string;
      clerkUserId: string;
      encryptedCredentials: { apiKey: string; apiSecret: string; passphrase?: string };
    } | null;

    if (!integration) throw new Error("Intégration introuvable.");
    if (integration.provider !== "kucoin") throw new Error("Cette intégration n'est pas de type KuCoin.");

    const { apiKey, apiSecret, passphrase: encPassphrase } = integration.encryptedCredentials;
    if (!encPassphrase) throw new Error("Passphrase manquante pour cette intégration KuCoin.");

    const decryptedKey = decryptSecret(apiKey);
    const decryptedSecret = decryptSecret(apiSecret);
    const decryptedPassphrase = decryptSecret(encPassphrase);

    await ctx.runMutation(api.integrations.updateSyncStatus, {
      integrationId: args.integrationId,
      syncStatus: "syncing",
    });

    try {
      const converts = await syncConverts(ctx, {
        integrationId: args.integrationId,
        apiKey: decryptedKey,
        apiSecret: decryptedSecret,
        passphrase: decryptedPassphrase,
      });

      await ctx.runMutation(api.integrations.updateSyncStatus, {
        integrationId: args.integrationId,
        syncStatus: "synced",
      });

      return converts;
    } catch (error) {
      await ctx.runMutation(api.integrations.updateSyncStatus, {
        integrationId: args.integrationId,
        syncStatus: "error",
      });
      throw error;
    }
  },
});
