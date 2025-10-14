import { action } from "./_generated/server";
import { v } from "convex/values";
import HmacSHA256 from "crypto-js/hmac-sha256";
import { decryptSecret } from "./utils/encryption";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";

const DATASET_SPOT_TRADES = "spot_trades";
const DATASET_CONVERT_TRADES = "convert_trades";
const DATASET_DEPOSITS = "capital_deposits";
const DATASET_WITHDRAWALS = "capital_withdrawals";

const DEFAULT_BASE_URL = "https://api.binance.com";
const SAPI_BASE_URL = "https://api.binance.com/sapi";
const MAX_LIMIT = 1000;
const MAX_CONVERT_LIMIT = 100;
const RECEIPT_WINDOW_MS = 60_000;
const PREFERRED_QUOTES = new Set([
  "USDT",
  "BUSD",
  "USDC",
  "BTC",
  "ETH",
  "BNB",
  "EUR",
  "GBP",
  "TRY",
  "AUD",
  "CAD",
  "BRL",
]);

const DEFAULT_SYMBOLS = [
  // Top spot market pairs
  "BTCUSDT",
  "BTCUSDC",
  "BTCBUSD",
  "BTCEUR",
  "BTCGBP",
  "BTCAUD",
  "BTCBRL",
  "BTCTRY",
  "ETHUSDT",
  "ETHUSDC",
  "ETHBUSD",
  "ETHBTC",
  "ETHEUR",
  "ETHGBP",
  "ETHAUD",
  "ETHTRY",
  "BNBUSDT",
  "BNBUSDC",
  "BNBBUSD",
  "BNBBTC",
  "BNBETH",
  "BNBEUR",
  "BNBGBP",
  "BNBTRY",
  "BNBAUD",
  "BNBBRL",
  "XRPUSDT",
  "XRPUSDC",
  "XRPBTC",
  "XRPBUSD",
  "ADAUSDT",
  "ADAUSDC",
  "ADABTC",
  "ADABUSD",
  "DOGEUSDT",
  "DOGEUSDC",
  "DOGEBTC",
  "DOGEBUSD",
  "MATICUSDT",
  "MATICUSDC",
  "MATICBTC",
  "MATICBUSD",
  "AVAXUSDT",
  "AVAXUSDC",
  "AVAXBTC",
  "AVAXBUSD",
  "DOTUSDT",
  "DOTUSDC",
  "DOTBTC",
  "DOTBUSD",
  "LINKUSDT",
  "LINKUSDC",
  "LINKBTC",
  "LINKBUSD",
  "LTCUSDT",
  "LTCUSDC",
  "LTCBTC",
  "LTCBUSD",
  "SOLUSDT",
  "SOLUSDC",
  "SOLBTC",
  "SOLBUSD",
  "SOLTRY",
  "SOLBNB",
  "ARBUSDT",
  "ARBUSDC",
  "OPUSDT",
  "OPUSDC",
  "INJUSDT",
  "INJUSDC",
  "RENDERUSDT",
  "RENDERUSDC",
  "TAOUSDT",
  "TAOUSDC",
  "FETUSDT",
  "FETUSDC",
];

const HISTORY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_HISTORY_ITERATIONS = 200;
const MAX_EMPTY_WINDOWS = 5;

type IntegrationRecord = {
  clerkUserId: string;
  encryptedCredentials: {
    apiKey: string;
    apiSecret: string;
  };
  provider: string;
};

type BinanceTrade = {
  symbol: string;
  id: number;
  orderId: number;
  price: string;
  qty: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  isBuyer: boolean;
  isMaker: boolean;
  isBestMatch: boolean;
};

type BinanceExchangeSymbol = {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
};

type BinanceExchangeInfo = {
  symbols: BinanceExchangeSymbol[];
};

type BinanceConvertTrade = {
  orderId: string;
  quoteId?: string;
  orderStatus: string;
  orderType?: string;
  walletType?: string;
  fromAsset: string;
  fromAmount: string;
  toAsset: string;
  toAmount: string;
  fee?: string;
  feeAsset?: string;
  price?: string;
  inversePrice?: string;
  createTime: number;
  updateTime: number;
};

type BinanceConvertTradeFlowResponse = {
  list?: BinanceConvertTrade[];
  total?: number;
};

type NormalizedConvertTrade = {
  payload: {
    providerTradeId: string;
    symbol: string;
    side: "BUY" | "SELL";
    quantity: number;
    price: number;
    quoteQuantity: number;
    fee?: number;
    feeAsset?: string;
    isMaker: boolean;
    executedAt: number;
    raw: unknown;
  };
  updateTime: number;
};

type BinanceBalance = {
  asset: string;
  free: string;
  locked: string;
};

type BinanceAccount = {
  balances: BinanceBalance[];
};

type DepositRecord = {
  id: string;
  txId?: string | null;
  coin: string;
  amount: string;
  network?: string | null;
  address?: string | null;
  addressTag?: string | null;
  status: number;
  insertTime: number;
  confirmTimes?: string | null;
  transferType?: number;
};

type WithdrawalRecord = {
  id: string;
  txId?: string | null;
  coin: string;
  amount: string;
  network?: string | null;
  address?: string | null;
  addressTag?: string | null;
  fee: string;
  status: number | string;
  applyTime: number | string;
  updateTime?: number | string | null;
  info?: string | null;
  transferType?: number;
};

type SymbolMeta = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
};

type SyncCursor = {
  lastTradeId: number | null;
  lastTradeTime: number | null;
};

type DepositCursor = {
  initialized: boolean;
  lastInsertTime: number | null;
  earliestInsertTime: number | null;
};

type WithdrawalCursor = {
  initialized: boolean;
  lastApplyTime: number | null;
  earliestApplyTime: number | null;
};

type ConvertCursor = {
  initialized: boolean;
  lastUpdateTime: number | null;
  earliestUpdateTime: number | null;
};

type SyncResult = {
  symbol: string;
  fetched: number;
  inserted: number;
  earliest?: number | null;
  latest?: number | null;
};

type DepositSyncResult = {
  fetched: number;
  inserted: number;
  earliest?: number | null;
  latest?: number | null;
};

type WithdrawalSyncResult = {
  fetched: number;
  inserted: number;
  earliest?: number | null;
  latest?: number | null;
};

type ConvertSyncResult = {
  fetched: number;
  inserted: number;
  earliest?: number | null;
  latest?: number | null;
};

export const syncAccount = action({
  args: {
    integrationId: v.id("integrations"),
    options: v.optional(
      v.object({
        symbols: v.optional(v.array(v.string())),
        startTime: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const integration = (await ctx.runQuery(api.integrations.getById, {
      integrationId: args.integrationId,
    })) as (IntegrationRecord & { encryptedCredentials: { apiKey: string; apiSecret: string } }) | null;

    if (!integration) {
      throw new Error("Intégration introuvable.");
    }
    if (integration.provider !== "binance") {
      throw new Error("Cette intégration n'est pas de type Binance.");
    }

    const { apiKey, apiSecret } = integration.encryptedCredentials;
    const decryptedKey = decryptSecret(apiKey);
    const decryptedSecret = decryptSecret(apiSecret);

    const detection = await detectSymbols(ctx, {
      integrationId: args.integrationId,
      clerkUserId: integration.clerkUserId,
      apiKey: decryptedKey,
      apiSecret: decryptedSecret,
      explicitSymbols: args.options?.symbols ?? [],
    });

    const trades = await syncSpotTrades(ctx, {
      integrationId: args.integrationId,
      apiKey: decryptedKey,
      apiSecret: decryptedSecret,
      symbols: detection.symbols,
      startTime: args.options?.startTime ?? null,
    });

    const convertTrades = await syncConvertTrades(ctx, {
      integrationId: args.integrationId,
      apiKey: decryptedKey,
      apiSecret: decryptedSecret,
    });

    const deposits = await syncDeposits(ctx, {
      integrationId: args.integrationId,
      apiKey: decryptedKey,
      apiSecret: decryptedSecret,
    });

    const withdrawals = await syncWithdrawals(ctx, {
      integrationId: args.integrationId,
      apiKey: decryptedKey,
      apiSecret: decryptedSecret,
    });

    const accountCreationFromApi = await fetchAccountCreationTime(decryptedKey, decryptedSecret);
    const earliestActivityCandidates = [
      trades.earliest ?? null,
      convertTrades.earliest ?? null,
      deposits.earliest ?? null,
      withdrawals.earliest ?? null,
    ].filter((value): value is number => value !== null && Number.isFinite(value));
    const inferredCreation =
      earliestActivityCandidates.length > 0 ? Math.min(...earliestActivityCandidates) : null;
    const accountCreatedAt = accountCreationFromApi ?? inferredCreation ?? null;

    await ctx.runMutation(api.integrations.updateMetadata, {
      integrationId: args.integrationId,
      accountCreatedAt: accountCreatedAt ?? undefined,
      lastSyncedAt: Date.now(),
    });

    return {
      symbols: detection.symbols,
      trades,
      convertTrades,
      deposits,
      withdrawals,
      accountCreatedAt,
    };
  },
});

async function detectSymbols(
  ctx: ActionCtx,
  params: {
    integrationId: Id<"integrations">;
    clerkUserId: string;
    apiKey: string;
    apiSecret: string;
    explicitSymbols: string[];
  }
) {
  const exchangeInfo = await fetchExchangeInfo();
  const symbolCatalog = new Map<string, SymbolMeta>();
  const baseIndex = new Map<string, Set<string>>();
  const quoteIndex = new Map<string, Set<string>>();

  for (const entry of exchangeInfo) {
    const symbol = entry.symbol.toUpperCase();
    const base = entry.baseAsset.toUpperCase();
    const quote = entry.quoteAsset.toUpperCase();
    symbolCatalog.set(symbol, {
      symbol,
      baseAsset: base,
      quoteAsset: quote,
    });
    const baseSet = baseIndex.get(base) ?? new Set<string>();
    baseSet.add(symbol);
    baseIndex.set(base, baseSet);
    const quoteSet = quoteIndex.get(quote) ?? new Set<string>();
    quoteSet.add(symbol);
    quoteIndex.set(quote, quoteSet);
  }

  const balances = await fetchAccountBalances(params.apiKey, params.apiSecret);

  const existingScopes = await ctx.runQuery(api.integrations.listSyncScopes, {
    clerkId: params.clerkUserId,
    dataset: DATASET_SPOT_TRADES,
  });

  const predefined = new Set(
    existingScopes.filter((scope) => scope.integrationId === params.integrationId).map((scope) => scope.scope)
  );

  params.explicitSymbols.forEach((symbol) => predefined.add(symbol.toUpperCase()));

  const symbols = deriveSymbolsToSync({
    balances,
    baseIndex,
    quoteIndex,
    symbolCatalog,
    predefinedSymbols: predefined,
  });

  const symbolSet = new Set(symbols.map((symbol) => symbol.toUpperCase()));

  DEFAULT_SYMBOLS.forEach((symbol) => {
    const upper = symbol.toUpperCase();
    if (symbolCatalog.has(upper)) {
      symbolSet.add(upper);
    }
  });

  const mergedSymbols = Array.from(symbolSet);

  return {
    symbols: mergedSymbols,
  };
}

async function syncSpotTrades(
  ctx: ActionCtx,
  params: {
    integrationId: Id<"integrations">;
    apiKey: string;
    apiSecret: string;
    symbols: string[];
    startTime: number | null;
  }
) {
  let totalFetched = 0;
  let totalInserted = 0;
  const details: SyncResult[] = [];
  let overallEarliest: number | null = null;
  let overallLatest: number | null = null;

  for (const symbol of params.symbols) {
    const result = await syncSymbolTrades(ctx, {
      integrationId: params.integrationId,
      symbol,
      apiKey: params.apiKey,
      apiSecret: params.apiSecret,
      startTime: params.startTime,
    });
    if (result.fetched === 0 && result.inserted === 0) {
      continue;
    }
    totalFetched += result.fetched;
    totalInserted += result.inserted;
    if (result.earliest !== undefined && result.earliest !== null) {
      overallEarliest = overallEarliest === null ? result.earliest : Math.min(overallEarliest, result.earliest);
    }
    if (result.latest !== undefined && result.latest !== null) {
      overallLatest = overallLatest === null ? result.latest : Math.max(overallLatest, result.latest);
    }
    details.push(result);
  }

  return {
    fetched: totalFetched,
    inserted: totalInserted,
    details,
    earliest: overallEarliest,
    latest: overallLatest,
  };
}

async function syncConvertTrades(
  ctx: ActionCtx,
  params: {
    integrationId: Id<"integrations">;
    apiKey: string;
    apiSecret: string;
  }
): Promise<ConvertSyncResult> {
  const cursor = await loadConvertCursor(ctx, params.integrationId);

  const exchangeInfo = await fetchExchangeInfo();
  const symbolCatalog = new Map<string, SymbolMeta>();
  for (const entry of exchangeInfo) {
    symbolCatalog.set(entry.symbol.toUpperCase(), entry);
  }

  let totalFetched = 0;
  let totalInserted = 0;
  let earliest = cursor.earliestUpdateTime ?? null;
  let latest = cursor.lastUpdateTime ?? null;

  if (!cursor.initialized) {
    const backfill = await backfillConvertTrades(ctx, params, Date.now(), symbolCatalog);
    totalFetched += backfill.fetched;
    totalInserted += backfill.inserted;
    const backfillEarliest = backfill.earliest ?? null;
    if (backfillEarliest !== null) {
      earliest = earliest === null ? backfillEarliest : Math.min(earliest, backfillEarliest);
    }
    const backfillLatest = backfill.latest ?? null;
    if (backfillLatest !== null) {
      latest = latest === null ? backfillLatest : Math.max(latest, backfillLatest);
    }
  }

  const incremental = await syncConvertTradesForward(ctx, params, latest, symbolCatalog);
  totalFetched += incremental.fetched;
  totalInserted += incremental.inserted;

  const incrementalEarliest = incremental.earliest ?? null;
  if (incrementalEarliest !== null) {
    earliest = earliest === null ? incrementalEarliest : Math.min(earliest, incrementalEarliest);
  }
  const incrementalLatest = incremental.latest ?? null;
  if (incrementalLatest !== null) {
    latest = latest === null ? incrementalLatest : Math.max(latest, incrementalLatest);
  }

  const finalLatest = latest ?? cursor.lastUpdateTime ?? null;
  const finalEarliest = earliest ?? cursor.earliestUpdateTime ?? null;

  await saveConvertCursor(ctx, params.integrationId, {
    initialized: true,
    lastUpdateTime: finalLatest,
    earliestUpdateTime: finalEarliest,
  });

  return {
    fetched: totalFetched,
    inserted: totalInserted,
    earliest: finalEarliest,
    latest: finalLatest,
  };
}

async function backfillConvertTrades(
  ctx: ActionCtx,
  params: {
    integrationId: Id<"integrations">;
    apiKey: string;
    apiSecret: string;
  },
  startingEndTime: number,
  symbolCatalog: Map<string, SymbolMeta>
): Promise<ConvertSyncResult> {
  let endTime = startingEndTime;
  let fetched = 0;
  let inserted = 0;
  let earliest: number | null = null;
  let latest: number | null = null;
  let iterations = 0;
  let emptyWindows = 0;

  while (endTime > 0 && iterations < MAX_HISTORY_ITERATIONS) {
    const windowStart = Math.max(0, endTime - HISTORY_WINDOW_MS);
    const batch = await fetchConvertTrades(params.apiKey, params.apiSecret, windowStart, endTime);
    iterations += 1;

    if (!Array.isArray(batch) || batch.length === 0) {
      emptyWindows += 1;
      if (windowStart === 0 && emptyWindows >= MAX_EMPTY_WINDOWS) {
        break;
      }
      if (windowStart === 0) {
        break;
      }
      endTime = windowStart - 1;
      continue;
    }

    emptyWindows = 0;

    const normalized = batch
      .map((trade) => normalizeConvertTrade(trade, symbolCatalog))
      .filter((trade): trade is NormalizedConvertTrade => trade !== null)
      .sort((a, b) => a.updateTime - b.updateTime);

    if (normalized.length === 0) {
      if (windowStart === 0) {
        break;
      }
      endTime = windowStart - 1;
      continue;
    }

    fetched += normalized.length;

    const payload = normalized.map((trade) => trade.payload);
    const result = await ctx.runMutation(api.trades.ingestBatch, {
      integrationId: params.integrationId,
      trades: payload,
    });
    inserted += result.inserted;

    const windowEarliest = normalized[0].updateTime;
    const windowLatest = normalized[normalized.length - 1].updateTime;
    earliest = earliest === null ? windowEarliest : Math.min(earliest, windowEarliest);
    latest = latest === null ? windowLatest : Math.max(latest, windowLatest);

    if (windowStart === 0) {
      break;
    }
    endTime = windowStart - 1;
  }

  return {
    fetched,
    inserted,
    earliest,
    latest,
  };
}

async function syncConvertTradesForward(
  ctx: ActionCtx,
  params: {
    integrationId: Id<"integrations">;
    apiKey: string;
    apiSecret: string;
  },
  since: number | null,
  symbolCatalog: Map<string, SymbolMeta>
): Promise<ConvertSyncResult> {
  const now = Date.now();
  let windowStart = since !== null ? Math.max(0, since - 1) : Math.max(0, now - HISTORY_WINDOW_MS);
  let fetched = 0;
  let inserted = 0;
  let earliest: number | null = null;
  let latest: number | null = since ?? null;
  let iterations = 0;

  while (windowStart <= now && iterations < MAX_HISTORY_ITERATIONS) {
    const windowEnd = Math.min(windowStart + HISTORY_WINDOW_MS, now);
    const batch = await fetchConvertTrades(params.apiKey, params.apiSecret, windowStart, windowEnd);
    iterations += 1;

    if (!Array.isArray(batch) || batch.length === 0) {
      if (windowEnd >= now) {
        break;
      }
      windowStart = windowEnd + 1;
      continue;
    }

    const normalized = batch
      .map((trade) => normalizeConvertTrade(trade, symbolCatalog))
      .filter((trade): trade is NormalizedConvertTrade => trade !== null)
      .sort((a, b) => a.updateTime - b.updateTime);

    if (normalized.length === 0) {
      if (windowEnd >= now) {
        break;
      }
      windowStart = windowEnd + 1;
      continue;
    }

    const payload = normalized.map((trade) => trade.payload);
    const result = await ctx.runMutation(api.trades.ingestBatch, {
      integrationId: params.integrationId,
      trades: payload,
    });

    fetched += normalized.length;
    inserted += result.inserted;

    const windowEarliest = normalized[0].updateTime;
    const windowLatest = normalized[normalized.length - 1].updateTime;
    earliest = earliest === null ? windowEarliest : Math.min(earliest, windowEarliest);
    latest = latest === null ? windowLatest : Math.max(latest, windowLatest);

    if (windowEnd >= now && windowLatest >= now) {
      break;
    }

    windowStart = windowLatest + 1;
  }

  return {
    fetched,
    inserted,
    earliest,
    latest,
  };
}

async function fetchConvertTrades(
  apiKey: string,
  apiSecret: string,
  startTime: number | null,
  endTime: number | null = null
) {
  const params: Record<string, string> = {
    recvWindow: RECEIPT_WINDOW_MS.toString(),
    limit: MAX_CONVERT_LIMIT.toString(),
  };
  if (startTime !== null && startTime !== undefined) {
    params.startTime = Math.max(0, startTime).toString();
  }
  if (endTime !== null && endTime !== undefined) {
    params.endTime = Math.max(0, endTime).toString();
  }

  const response = await signedGet(
    apiKey,
    apiSecret,
    "/sapi/v1/convert/tradeFlow",
    params,
    SAPI_BASE_URL
  );

  if (Array.isArray(response)) {
    return response as BinanceConvertTrade[];
  }

  if (response && typeof response === "object" && Array.isArray((response as BinanceConvertTradeFlowResponse).list)) {
    return (response as BinanceConvertTradeFlowResponse).list ?? [];
  }

  return [];
}

async function syncDeposits(
  ctx: ActionCtx,
  params: {
    integrationId: Id<"integrations">;
    apiKey: string;
    apiSecret: string;
  }
): Promise<DepositSyncResult> {
  const cursor = await loadDepositCursor(ctx, params.integrationId);
  let totalFetched = 0;
  let totalInserted = 0;
  let earliest = cursor.earliestInsertTime ?? null;
  let latest = cursor.lastInsertTime ?? null;

  if (!cursor.initialized) {
    const backfill = await backfillDeposits(ctx, params, Date.now());
    totalFetched += backfill.fetched;
    totalInserted += backfill.inserted;
    const backfillEarliest = backfill.earliest ?? null;
    if (backfillEarliest !== null) {
      const candidate = backfillEarliest;
      if (earliest === null) {
        earliest = candidate;
      } else {
        earliest = Math.min(earliest, candidate);
      }
    }
    const backfillLatest = backfill.latest ?? null;
    if (backfillLatest !== null) {
      const candidate = backfillLatest;
      if (latest === null) {
        latest = candidate;
      } else {
        latest = Math.max(latest, candidate);
      }
    }
  }

  const incremental = await syncDepositsForward(ctx, params, latest);
  totalFetched += incremental.fetched;
  totalInserted += incremental.inserted;
  const incrementalEarliest = incremental.earliest ?? null;
  if (incrementalEarliest !== null) {
    const candidate = incrementalEarliest;
    if (earliest === null) {
      earliest = candidate;
    } else {
      earliest = Math.min(earliest, candidate);
    }
  }
  const incrementalLatest = incremental.latest ?? null;
  if (incrementalLatest !== null) {
    const candidate = incrementalLatest;
    if (latest === null) {
      latest = candidate;
    } else {
      latest = Math.max(latest, candidate);
    }
  }

  const finalLatest = latest ?? cursor.lastInsertTime ?? null;
  const finalEarliest = earliest ?? cursor.earliestInsertTime ?? null;

  await saveDepositCursor(ctx, params.integrationId, {
    initialized: true,
    lastInsertTime: finalLatest,
    earliestInsertTime: finalEarliest,
  });

  return {
    fetched: totalFetched,
    inserted: totalInserted,
    earliest: finalEarliest,
    latest: finalLatest,
  };
}

async function backfillDeposits(
  ctx: ActionCtx,
  params: {
    integrationId: Id<"integrations">;
    apiKey: string;
    apiSecret: string;
  },
  startingEndTime: number
): Promise<DepositSyncResult> {
  let endTime = startingEndTime;
  let fetched = 0;
  let inserted = 0;
  let earliest: number | null = null;
  let latest: number | null = null;
  let iterations = 0;
  let emptyWindows = 0;
  const now = Date.now();

  while (endTime > 0 && iterations < MAX_HISTORY_ITERATIONS) {
    const windowStart = Math.max(0, endTime - HISTORY_WINDOW_MS);
    const batch = await fetchDeposits(params.apiKey, params.apiSecret, windowStart, endTime);
    iterations += 1;

    if (!Array.isArray(batch) || batch.length === 0) {
      emptyWindows += 1;
      if (windowStart === 0 && emptyWindows >= MAX_EMPTY_WINDOWS) {
        break;
      }
      if (windowStart === 0) {
        break;
      }
      endTime = windowStart - 1;
      continue;
    }

    emptyWindows = 0;

    const normalized = batch
      .map((deposit) => ({
        ...deposit,
        insertTime: Number(deposit.insertTime ?? 0),
      }))
      .filter((deposit) => deposit.insertTime > 0 && deposit.insertTime <= endTime)
      .sort((a, b) => a.insertTime - b.insertTime);

    if (normalized.length === 0) {
      if (windowStart === 0) {
        break;
      }
      endTime = windowStart - 1;
      continue;
    }

    fetched += normalized.length;

    for (const deposit of normalized) {
      const existing = await ctx.runQuery(api.deposits.getByDepositId, {
        integrationId: params.integrationId,
        depositId: deposit.id,
      });
      if (!existing) {
        await ctx.runMutation(api.deposits.insert, {
          integrationId: params.integrationId,
          deposit: {
            depositId: deposit.id,
            txId: deposit.txId ?? undefined,
            coin: deposit.coin.toUpperCase(),
            amount: Number(deposit.amount),
            network: deposit.network ?? undefined,
            status: String(deposit.status),
            address: deposit.address ?? undefined,
            addressTag: deposit.addressTag ?? undefined,
            insertTime: deposit.insertTime,
            confirmedTime: undefined,
            raw: deposit,
            createdAt: now,
          },
        });
        inserted += 1;
      }
      if (earliest === null) {
        earliest = deposit.insertTime;
      } else {
        earliest = Math.min(earliest, deposit.insertTime);
      }
      if (latest === null) {
        latest = deposit.insertTime;
      } else {
        latest = Math.max(latest, deposit.insertTime);
      }
    }

    const nextEnd = normalized[0].insertTime > 0 ? normalized[0].insertTime - 1 : windowStart - 1;
    if (nextEnd === endTime) {
      break;
    }
    endTime = nextEnd;
  }

  return {
    fetched,
    inserted,
    earliest,
    latest,
  };
}

async function syncDepositsForward(
  ctx: ActionCtx,
  params: {
    integrationId: Id<"integrations">;
    apiKey: string;
    apiSecret: string;
  },
  lastInsertTime: number | null
): Promise<DepositSyncResult> {
  let fetched = 0;
  let inserted = 0;
  let earliest: number | null = null;
  let latest: number | null = lastInsertTime;
  let iterations = 0;
  const now = Date.now();
  let pointer = lastInsertTime !== null ? lastInsertTime + 1 : null;

  while (iterations < MAX_HISTORY_ITERATIONS) {
    const batch = await fetchDeposits(params.apiKey, params.apiSecret, pointer, null);
    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }
    iterations += 1;

    const normalized = batch
      .map((deposit) => ({
        ...deposit,
        insertTime: Number(deposit.insertTime ?? 0),
      }))
      .filter((deposit) => deposit.insertTime > (lastInsertTime ?? 0))
      .sort((a, b) => a.insertTime - b.insertTime);

    if (normalized.length === 0) {
      break;
    }

    fetched += normalized.length;

    for (const deposit of normalized) {
      const existing = await ctx.runQuery(api.deposits.getByDepositId, {
        integrationId: params.integrationId,
        depositId: deposit.id,
      });
      if (!existing) {
        await ctx.runMutation(api.deposits.insert, {
          integrationId: params.integrationId,
          deposit: {
            depositId: deposit.id,
            txId: deposit.txId ?? undefined,
            coin: deposit.coin.toUpperCase(),
            amount: Number(deposit.amount),
            network: deposit.network ?? undefined,
            status: String(deposit.status),
            address: deposit.address ?? undefined,
            addressTag: deposit.addressTag ?? undefined,
            insertTime: deposit.insertTime,
            confirmedTime: undefined,
            raw: deposit,
            createdAt: now,
          },
        });
        inserted += 1;
      }
      if (earliest === null) {
        earliest = deposit.insertTime;
      } else {
        earliest = Math.min(earliest, deposit.insertTime);
      }
      if (latest === null) {
        latest = deposit.insertTime;
      } else {
        latest = Math.max(latest, deposit.insertTime);
      }
      lastInsertTime = Math.max(lastInsertTime ?? 0, deposit.insertTime);
    }

    if (normalized.length < MAX_LIMIT) {
      break;
    }
    pointer = (lastInsertTime ?? 0) + 1;
  }

  return {
    fetched,
    inserted,
    earliest,
    latest,
  };
}

async function syncWithdrawals(
  ctx: ActionCtx,
  params: {
    integrationId: Id<"integrations">;
    apiKey: string;
    apiSecret: string;
  }
): Promise<WithdrawalSyncResult> {
  const cursor = await loadWithdrawalCursor(ctx, params.integrationId);
  let totalFetched = 0;
  let totalInserted = 0;
  let earliest = cursor.earliestApplyTime ?? null;
  let latest = cursor.lastApplyTime ?? null;

  if (!cursor.initialized) {
    const backfill = await backfillWithdrawals(ctx, params, Date.now());
    totalFetched += backfill.fetched;
    totalInserted += backfill.inserted;
    const backfillEarliest = backfill.earliest ?? null;
    if (backfillEarliest !== null) {
      const candidate = backfillEarliest;
      if (earliest === null) {
        earliest = candidate;
      } else {
        earliest = Math.min(earliest, candidate);
      }
    }
    const backfillLatest = backfill.latest ?? null;
    if (backfillLatest !== null) {
      const candidate = backfillLatest;
      if (latest === null) {
        latest = candidate;
      } else {
        latest = Math.max(latest, candidate);
      }
    }
  }

  const incremental = await syncWithdrawalsForward(ctx, params, latest);
  totalFetched += incremental.fetched;
  totalInserted += incremental.inserted;
  const incrementalEarliest = incremental.earliest ?? null;
  if (incrementalEarliest !== null) {
    const candidate = incrementalEarliest;
    if (earliest === null) {
      earliest = candidate;
    } else {
      earliest = Math.min(earliest, candidate);
    }
  }
  const incrementalLatest = incremental.latest ?? null;
  if (incrementalLatest !== null) {
    const candidate = incrementalLatest;
    if (latest === null) {
      latest = candidate;
    } else {
      latest = Math.max(latest, candidate);
    }
  }

  const finalLatest = latest ?? cursor.lastApplyTime ?? null;
  const finalEarliest = earliest ?? cursor.earliestApplyTime ?? null;

  await saveWithdrawalCursor(ctx, params.integrationId, {
    initialized: true,
    lastApplyTime: finalLatest,
    earliestApplyTime: finalEarliest,
  });

  return {
    fetched: totalFetched,
    inserted: totalInserted,
    earliest: finalEarliest,
    latest: finalLatest,
  };
}

async function backfillWithdrawals(
  ctx: ActionCtx,
  params: {
    integrationId: Id<"integrations">;
    apiKey: string;
    apiSecret: string;
  },
  startingEndTime: number
): Promise<WithdrawalSyncResult> {
  let endTime = startingEndTime;
  let fetched = 0;
  let inserted = 0;
  let earliest: number | null = null;
  let latest: number | null = null;
  let iterations = 0;
  let emptyWindows = 0;
  const now = Date.now();

  while (endTime > 0 && iterations < MAX_HISTORY_ITERATIONS) {
    const windowStart = Math.max(0, endTime - HISTORY_WINDOW_MS);
    const batch = await fetchWithdrawals(params.apiKey, params.apiSecret, windowStart, endTime);
    iterations += 1;

    if (!Array.isArray(batch) || batch.length === 0) {
      emptyWindows += 1;
      if (windowStart === 0 && emptyWindows >= MAX_EMPTY_WINDOWS) {
        break;
      }
      if (windowStart === 0) {
        break;
      }
      endTime = windowStart - 1;
      continue;
    }

    emptyWindows = 0;

    const normalized = batch
      .map((withdrawal) => ({
        ...withdrawal,
        applyTime: resolveNumber(withdrawal.applyTime),
      }))
      .filter((withdrawal) => withdrawal.applyTime > 0 && withdrawal.applyTime <= endTime)
      .sort((a, b) => a.applyTime - b.applyTime);

    if (normalized.length === 0) {
      if (windowStart === 0) {
        break;
      }
      endTime = windowStart - 1;
      continue;
    }

    fetched += normalized.length;

    for (const withdrawal of normalized) {
      const existing = await ctx.runQuery(api.withdrawals.getByWithdrawId, {
        integrationId: params.integrationId,
        withdrawId: withdrawal.id,
      });
      if (!existing) {
        await ctx.runMutation(api.withdrawals.insert, {
          integrationId: params.integrationId,
          withdrawal: {
            withdrawId: withdrawal.id,
            txId: withdrawal.txId ?? undefined,
            coin: withdrawal.coin.toUpperCase(),
            amount: Number(withdrawal.amount),
            network: withdrawal.network ?? undefined,
            address: withdrawal.address ?? undefined,
            addressTag: withdrawal.addressTag ?? undefined,
            fee: Number(withdrawal.fee),
            status: String(withdrawal.status),
            applyTime: withdrawal.applyTime,
            updateTime: withdrawal.updateTime ? resolveNumber(withdrawal.updateTime) : undefined,
            raw: withdrawal,
            createdAt: now,
          },
        });
        inserted += 1;
      }
      if (earliest === null) {
        earliest = withdrawal.applyTime;
      } else {
        earliest = Math.min(earliest, withdrawal.applyTime);
      }
      if (latest === null) {
        latest = withdrawal.applyTime;
      } else {
        latest = Math.max(latest, withdrawal.applyTime);
      }
    }

    const nextEnd = normalized[0].applyTime > 0 ? normalized[0].applyTime - 1 : windowStart - 1;
    if (nextEnd === endTime) {
      break;
    }
    endTime = nextEnd;
  }

  return {
    fetched,
    inserted,
    earliest,
    latest,
  };
}

async function syncWithdrawalsForward(
  ctx: ActionCtx,
  params: {
    integrationId: Id<"integrations">;
    apiKey: string;
    apiSecret: string;
  },
  lastApplyTime: number | null
): Promise<WithdrawalSyncResult> {
  let fetched = 0;
  let inserted = 0;
  let earliest: number | null = null;
  let latest: number | null = lastApplyTime;
  let iterations = 0;
  const now = Date.now();
  let pointer = lastApplyTime !== null ? lastApplyTime + 1 : null;

  while (iterations < MAX_HISTORY_ITERATIONS) {
    const batch = await fetchWithdrawals(params.apiKey, params.apiSecret, pointer, null);
    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }
    iterations += 1;

    const normalized = batch
      .map((withdrawal) => ({
        ...withdrawal,
        applyTime: resolveNumber(withdrawal.applyTime),
      }))
      .filter((withdrawal) => withdrawal.applyTime > (lastApplyTime ?? 0))
      .sort((a, b) => a.applyTime - b.applyTime);

    if (normalized.length === 0) {
      break;
    }

    fetched += normalized.length;

    for (const withdrawal of normalized) {
      const existing = await ctx.runQuery(api.withdrawals.getByWithdrawId, {
        integrationId: params.integrationId,
        withdrawId: withdrawal.id,
      });
      if (!existing) {
        await ctx.runMutation(api.withdrawals.insert, {
          integrationId: params.integrationId,
          withdrawal: {
            withdrawId: withdrawal.id,
            txId: withdrawal.txId ?? undefined,
            coin: withdrawal.coin.toUpperCase(),
            amount: Number(withdrawal.amount),
            network: withdrawal.network ?? undefined,
            address: withdrawal.address ?? undefined,
            addressTag: withdrawal.addressTag ?? undefined,
            fee: Number(withdrawal.fee),
            status: String(withdrawal.status),
            applyTime: withdrawal.applyTime,
            updateTime: withdrawal.updateTime ? resolveNumber(withdrawal.updateTime) : undefined,
            raw: withdrawal,
            createdAt: now,
          },
        });
        inserted += 1;
      }
      if (earliest === null) {
        earliest = withdrawal.applyTime;
      } else {
        earliest = Math.min(earliest, withdrawal.applyTime);
      }
      if (latest === null) {
        latest = withdrawal.applyTime;
      } else {
        latest = Math.max(latest, withdrawal.applyTime);
      }
      lastApplyTime = Math.max(lastApplyTime ?? 0, withdrawal.applyTime);
    }

    if (normalized.length < MAX_LIMIT) {
      break;
    }
    pointer = (lastApplyTime ?? 0) + 1;
  }

  return {
    fetched,
    inserted,
    earliest,
    latest,
  };
}

async function fetchAccountCreationTime(apiKey: string, apiSecret: string): Promise<number | null> {
  try {
    const response = await signedGet(apiKey, apiSecret, "/sapi/v1/account/apiRestrictions", {}, SAPI_BASE_URL);
    if (response && typeof response === "object" && response !== null && "createTime" in response) {
      const value = (response as Record<string, unknown>).createTime;
      const parsed = parseOptionalNumber(value);
      if (parsed !== null && parsed > 0) {
        return parsed;
      }
    }
  } catch (error) {
    // ignore - we'll fall back to earliest activity
  }
  return null;
}

async function fetchExchangeInfo(): Promise<SymbolMeta[]> {
  const response = await fetch(`${DEFAULT_BASE_URL}/api/v3/exchangeInfo`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Impossible de récupérer les paires Binance : ${errorText}`);
  }
  const payload = (await response.json()) as BinanceExchangeInfo;
  if (!payload || !Array.isArray(payload.symbols)) {
    return [];
  }
  return payload.symbols.map((entry) => ({
    symbol: entry.symbol.toUpperCase(),
    baseAsset: entry.baseAsset.toUpperCase(),
    quoteAsset: entry.quoteAsset.toUpperCase(),
  }));
}

async function fetchAccountBalances(apiKey: string, apiSecret: string): Promise<BinanceBalance[]> {
  const response = await signedGet(apiKey, apiSecret, "/api/v3/account", {});
  const account = response as BinanceAccount;
  if (!account || !Array.isArray(account.balances)) {
    return [];
  }
  return account.balances;
}

function deriveSymbolsToSync(params: {
  balances: BinanceBalance[];
  baseIndex: Map<string, Set<string>>;
  quoteIndex: Map<string, Set<string>>;
  symbolCatalog: Map<string, SymbolMeta>;
  predefinedSymbols: Set<string>;
}) {
  const { balances, baseIndex, quoteIndex, symbolCatalog, predefinedSymbols } = params;
  const assetsWithBalance = new Set<string>();

  for (const balance of balances) {
    const asset = balance.asset.toUpperCase();
    const free = Number(balance.free);
    const locked = Number(balance.locked);
    if (Number.isFinite(free) && Number.isFinite(locked) && free + locked > 0) {
      assetsWithBalance.add(asset);
    }
  }

  PREFERRED_QUOTES.forEach((quote) => assetsWithBalance.add(quote));

  const symbolSet = new Set<string>();

  predefinedSymbols.forEach((symbol) => {
    const resolved = symbol.toUpperCase();
    if (symbolCatalog.has(resolved)) {
      symbolSet.add(resolved);
    }
  });

  const considerAsset = (asset: string, relatedIndex: Map<string, Set<string>>) => {
    const related = relatedIndex.get(asset);
    if (!related) {
      return;
    }
    for (const symbol of related) {
      const meta = symbolCatalog.get(symbol);
      if (!meta) {
        continue;
      }
      const base = meta.baseAsset;
      const quote = meta.quoteAsset;
      const quoteMatches = PREFERRED_QUOTES.has(quote) || assetsWithBalance.has(quote);
      const baseMatches = PREFERRED_QUOTES.has(base) || assetsWithBalance.has(base);
      if (assetsWithBalance.has(base) && quoteMatches) {
        symbolSet.add(symbol);
      } else if (assetsWithBalance.has(quote) && baseMatches) {
        symbolSet.add(symbol);
      }
    }
  };

  assetsWithBalance.forEach((asset) => {
    considerAsset(asset, baseIndex);
    considerAsset(asset, quoteIndex);
  });

  return Array.from(symbolSet);
}

async function syncSymbolTrades(
  ctx: ActionCtx,
  params: {
    integrationId: Id<"integrations">;
    symbol: string;
    apiKey: string;
    apiSecret: string;
    startTime: number | null;
  }
): Promise<SyncResult> {
  const scope = params.symbol.toUpperCase();
  const syncState = await ctx.runQuery(api.integrations.getSyncState, {
    integrationId: params.integrationId,
    dataset: DATASET_SPOT_TRADES,
    scope,
  });

  let cursor: SyncCursor = {
    lastTradeId: null,
    lastTradeTime: null,
  };

  if (syncState?.cursor && typeof syncState.cursor === "object") {
    const rawCursor = syncState.cursor as Record<string, unknown>;
    cursor = {
      lastTradeId:
        typeof rawCursor.lastTradeId === "number"
          ? rawCursor.lastTradeId
          : typeof rawCursor.lastTradeId === "string"
          ? Number(rawCursor.lastTradeId)
          : null,
      lastTradeTime:
        typeof rawCursor.lastTradeTime === "number"
          ? rawCursor.lastTradeTime
          : typeof rawCursor.lastTradeTime === "string"
          ? Number(rawCursor.lastTradeTime)
          : null,
    };
  }

  if (params.startTime && (!cursor.lastTradeTime || params.startTime < cursor.lastTradeTime)) {
    cursor.lastTradeTime = params.startTime;
    cursor.lastTradeId = null;
  }

  let fetched = 0;
  let inserted = 0;
  let earliestTrade: number | null = null;
  let latestTrade: number | null = cursor.lastTradeTime ?? null;
  let lastTradeId = cursor.lastTradeId;
  let lastTradeTime = cursor.lastTradeTime;
  let iterations = 0;

  while (true) {
    const paramsMap: Record<string, string> = {
      symbol: scope,
      limit: MAX_LIMIT.toString(),
      recvWindow: RECEIPT_WINDOW_MS.toString(),
    };

    if (lastTradeId !== null) {
      paramsMap.fromId = (lastTradeId + 1).toString();
    } else if (lastTradeTime !== null) {
      paramsMap.startTime = lastTradeTime.toString();
    } else {
      paramsMap.startTime = "0";
    }

    const trades = (await signedGet(params.apiKey, params.apiSecret, "/api/v3/myTrades", paramsMap)) as BinanceTrade[];

    if (!Array.isArray(trades) || trades.length === 0) {
      break;
    }

    fetched += trades.length;

    const formattedTrades = trades.map((trade) => {
      const side: "BUY" | "SELL" = trade.isBuyer ? "BUY" : "SELL";
      return {
        providerTradeId: trade.id.toString(),
        symbol: trade.symbol.toUpperCase(),
        side,
        quantity: Number(trade.qty),
        price: Number(trade.price),
        quoteQuantity: Number(trade.quoteQty),
        fee: Number(trade.commission),
        feeAsset: trade.commissionAsset ?? undefined,
        isMaker: Boolean(trade.isMaker),
        executedAt: Number(trade.time),
        raw: trade,
      };
    });

    formattedTrades.forEach((trade) => {
      earliestTrade = earliestTrade === null ? trade.executedAt : Math.min(earliestTrade, trade.executedAt);
      latestTrade = latestTrade === null ? trade.executedAt : Math.max(latestTrade, trade.executedAt);
    });

    const result = await ctx.runMutation(api.trades.ingestBatch, {
      integrationId: params.integrationId,
      trades: formattedTrades,
    });

    inserted += result.inserted;

    const lastTrade = trades[trades.length - 1];
    lastTradeId = lastTrade.id;
    lastTradeTime = lastTrade.time;
    latestTrade = latestTrade === null ? Number(lastTrade.time) : Math.max(latestTrade, Number(lastTrade.time));

    iterations += 1;
    if (trades.length < MAX_LIMIT || iterations > 1_000) {
      break;
    }
  }

  if (lastTradeTime === null) {
    lastTradeTime = Date.now();
  }

  await ctx.runMutation(api.integrations.updateSyncState, {
    integrationId: params.integrationId,
    dataset: DATASET_SPOT_TRADES,
    scope,
    cursor: {
      lastTradeId,
      lastTradeTime,
    },
  });

  if (latestTrade === null) {
    latestTrade = lastTradeTime ?? null;
  }

  return {
    symbol: scope,
    fetched,
    inserted,
    earliest: earliestTrade,
    latest: latestTrade,
  };
}

async function fetchDeposits(
  apiKey: string,
  apiSecret: string,
  startTime: number | null,
  endTime: number | null = null
) {
  const params: Record<string, string> = {
    recvWindow: RECEIPT_WINDOW_MS.toString(),
    limit: MAX_LIMIT.toString(),
  };
  if (startTime !== null && startTime !== undefined) {
    params.startTime = Math.max(0, startTime).toString();
  }
  if (endTime !== null && endTime !== undefined) {
    params.endTime = Math.max(0, endTime).toString();
  }
  const response = await signedGet(apiKey, apiSecret, "/sapi/v1/capital/deposit/hisrec", params, SAPI_BASE_URL);
  if (!Array.isArray(response)) {
    console.log("Binance deposits window", {
      startTime,
      endTime,
      count: "non-array",
    });
    return [];
  }
  console.log("Binance deposits window", {
    startTime,
    endTime,
    count: response.length,
  });
  return response as DepositRecord[];
}

async function fetchWithdrawals(
  apiKey: string,
  apiSecret: string,
  startTime: number | null,
  endTime: number | null = null
) {
  const params: Record<string, string> = {
    recvWindow: RECEIPT_WINDOW_MS.toString(),
    limit: MAX_LIMIT.toString(),
  };
  if (startTime !== null && startTime !== undefined) {
    params.startTime = Math.max(0, startTime).toString();
  }
  if (endTime !== null && endTime !== undefined) {
    params.endTime = Math.max(0, endTime).toString();
  }
  const response = await signedGet(apiKey, apiSecret, "/sapi/v1/capital/withdraw/history", params, SAPI_BASE_URL);
  if (!Array.isArray(response)) {
    console.log("Binance withdrawals window", {
      startTime,
      endTime,
      count: "non-array",
    });
    return [];
  }
  console.log("Binance withdrawals window", {
    startTime,
    endTime,
    count: response.length,
  });
  return response as WithdrawalRecord[];
}

async function loadConvertCursor(ctx: ActionCtx, integrationId: Id<"integrations">): Promise<ConvertCursor> {
  const state = await ctx.runQuery(api.integrations.getSyncState, {
    integrationId,
    dataset: DATASET_CONVERT_TRADES,
    scope: "default",
  });

  if (!state?.cursor) {
    return {
      initialized: false,
      lastUpdateTime: null,
      earliestUpdateTime: null,
    };
  }

  const cursor = state.cursor as Record<string, unknown>;
  return {
    initialized: Boolean(cursor.initialized),
    lastUpdateTime: parseOptionalNumber(cursor.lastUpdateTime),
    earliestUpdateTime: parseOptionalNumber(cursor.earliestUpdateTime),
  };
}

async function saveConvertCursor(ctx: ActionCtx, integrationId: Id<"integrations">, cursor: ConvertCursor) {
  await ctx.runMutation(api.integrations.updateSyncState, {
    integrationId,
    dataset: DATASET_CONVERT_TRADES,
    scope: "default",
    cursor: {
      initialized: cursor.initialized,
      lastUpdateTime: cursor.lastUpdateTime,
      earliestUpdateTime: cursor.earliestUpdateTime,
    },
  });
}

async function loadDepositCursor(ctx: ActionCtx, integrationId: Id<"integrations">): Promise<DepositCursor> {
  const state = await ctx.runQuery(api.integrations.getSyncState, {
    integrationId,
    dataset: DATASET_DEPOSITS,
    scope: "default",
  });
  if (!state?.cursor) {
    return {
      initialized: false,
      lastInsertTime: null,
      earliestInsertTime: null,
    };
  }
  const cursor = state.cursor as Record<string, unknown>;
  return {
    initialized: Boolean(cursor.initialized),
    lastInsertTime: parseOptionalNumber(cursor.lastInsertTime),
    earliestInsertTime: parseOptionalNumber(cursor.earliestInsertTime),
  };
}

async function saveDepositCursor(ctx: ActionCtx, integrationId: Id<"integrations">, cursor: DepositCursor) {
  await ctx.runMutation(api.integrations.updateSyncState, {
    integrationId,
    dataset: DATASET_DEPOSITS,
    scope: "default",
    cursor: {
      initialized: cursor.initialized,
      lastInsertTime: cursor.lastInsertTime,
      earliestInsertTime: cursor.earliestInsertTime,
    },
  });
}

async function loadWithdrawalCursor(ctx: ActionCtx, integrationId: Id<"integrations">): Promise<WithdrawalCursor> {
  const state = await ctx.runQuery(api.integrations.getSyncState, {
    integrationId,
    dataset: DATASET_WITHDRAWALS,
    scope: "default",
  });
  if (!state?.cursor) {
    return {
      initialized: false,
      lastApplyTime: null,
      earliestApplyTime: null,
    };
  }
  const cursor = state.cursor as Record<string, unknown>;
  return {
    initialized: Boolean(cursor.initialized),
    lastApplyTime: parseOptionalNumber(cursor.lastApplyTime),
    earliestApplyTime: parseOptionalNumber(cursor.earliestApplyTime),
  };
}

async function saveWithdrawalCursor(ctx: ActionCtx, integrationId: Id<"integrations">, cursor: WithdrawalCursor) {
  await ctx.runMutation(api.integrations.updateSyncState, {
    integrationId,
    dataset: DATASET_WITHDRAWALS,
    scope: "default",
    cursor: {
      initialized: cursor.initialized,
      lastApplyTime: cursor.lastApplyTime,
      earliestApplyTime: cursor.earliestApplyTime,
    },
  });
}

function normalizeConvertTrade(
  trade: BinanceConvertTrade,
  symbolCatalog: Map<string, SymbolMeta>
): NormalizedConvertTrade | null {
  const status = String(trade.orderStatus ?? "").toUpperCase();
  if (status !== "SUCCESS") {
    return null;
  }

  const fromAsset = (trade.fromAsset ?? "").toUpperCase();
  const toAsset = (trade.toAsset ?? "").toUpperCase();
  if (!fromAsset || !toAsset) {
    return null;
  }

  const fromAmount = resolveNumber(trade.fromAmount ?? 0);
  const toAmount = resolveNumber(trade.toAmount ?? 0);
  if (fromAmount <= 0 || toAmount <= 0) {
    return null;
  }

  const updateTimestamp = resolveNumber(trade.updateTime ?? trade.createTime ?? 0);
  const executedAt = updateTimestamp > 0 ? updateTimestamp : resolveNumber(trade.createTime ?? 0);
  if (executedAt <= 0) {
    return null;
  }

  const { symbol, side } = resolveConvertSymbol(symbolCatalog, fromAsset, toAsset);

  const quantity = side === "BUY" ? toAmount : fromAmount;
  const quoteQuantity = side === "BUY" ? fromAmount : toAmount;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }
  if (!Number.isFinite(quoteQuantity) || quoteQuantity < 0) {
    return null;
  }

  const price = quantity !== 0 ? quoteQuantity / quantity : 0;
  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  const feeValue = resolveNumber(trade.fee ?? 0);
  const fee = feeValue > 0 ? feeValue : undefined;
  const feeAsset = trade.feeAsset ? trade.feeAsset.toUpperCase() : undefined;

  const providerTradeId =
    trade.orderId && String(trade.orderId).trim().length > 0
      ? `convert:${trade.orderId}`
      : trade.quoteId && String(trade.quoteId).trim().length > 0
      ? `convert:${trade.quoteId}`
      : null;

  if (!providerTradeId) {
    return null;
  }

  return {
    payload: {
      providerTradeId,
      symbol,
      side,
      quantity,
      price,
      quoteQuantity,
      fee,
      feeAsset,
      isMaker: false,
      executedAt,
      raw: {
        source: "binance_convert",
        trade,
      },
    },
    updateTime: executedAt,
  };
}

function resolveConvertSymbol(symbolCatalog: Map<string, SymbolMeta>, fromAsset: string, toAsset: string) {
  const upperFrom = fromAsset.toUpperCase();
  const upperTo = toAsset.toUpperCase();
  const forwardSymbol = `${upperTo}${upperFrom}`;
  const reverseSymbol = `${upperFrom}${upperTo}`;

  if (symbolCatalog.has(forwardSymbol)) {
    return { symbol: forwardSymbol, side: "BUY" as const };
  }
  if (symbolCatalog.has(reverseSymbol)) {
    return { symbol: reverseSymbol, side: "SELL" as const };
  }

  if (PREFERRED_QUOTES.has(upperFrom) || !PREFERRED_QUOTES.has(upperTo)) {
    return { symbol: forwardSymbol, side: "BUY" as const };
  }

  return { symbol: reverseSymbol, side: "SELL" as const };
}

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function resolveNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === "number") {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function signedGet(
  apiKey: string,
  apiSecret: string,
  path: string,
  params: Record<string, string | number>,
  baseUrl = DEFAULT_BASE_URL
) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, String(value));
  }
  searchParams.set("timestamp", Date.now().toString());
  const signature = HmacSHA256(searchParams.toString(), apiSecret).toString();
  searchParams.set("signature", signature);

  const response = await fetch(`${baseUrl}${path}?${searchParams.toString()}`, {
    method: "GET",
    headers: {
      "X-MBX-APIKEY": apiKey,
    },
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`Binance API error ${response.status}: ${raw}`);
  }

  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Binance API parse error for ${path}: ${(error as Error).message}. Payload: ${raw.slice(0, 200)}`
    );
  }
}
