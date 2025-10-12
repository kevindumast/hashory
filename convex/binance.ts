import { action } from "./_generated/server";
import { v } from "convex/values";
import HmacSHA256 from "crypto-js/hmac-sha256";
import { decryptSecret } from "./utils/encryption";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";

const DATASET_SPOT_TRADES = "spot_trades";
const DATASET_DEPOSITS = "capital_deposits";
const DATASET_WITHDRAWALS = "capital_withdrawals";

const DEFAULT_BASE_URL = "https://api.binance.com";
const SAPI_BASE_URL = "https://api.binance.com/sapi";
const MAX_LIMIT = 1000;
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
  lastInsertTime: number | null;
};

type WithdrawalCursor = {
  lastApplyTime: number | null;
};

type SyncResult = {
  symbol: string;
  fetched: number;
  inserted: number;
};

type DepositSyncResult = {
  fetched: number;
  inserted: number;
};

type WithdrawalSyncResult = {
  fetched: number;
  inserted: number;
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

    return {
      symbols: detection.symbols,
      trades,
      deposits,
      withdrawals,
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

  return {
    symbols,
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
    details.push(result);
  }

  return {
    fetched: totalFetched,
    inserted: totalInserted,
    details,
  };
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
  const deposits = await fetchDeposits(params.apiKey, params.apiSecret, cursor?.lastInsertTime ?? null);

  if (deposits.length === 0) {
    return { fetched: 0, inserted: 0 };
  }

  deposits.sort((a, b) => a.insertTime - b.insertTime);

  const now = Date.now();
  let inserted = 0;
  for (const deposit of deposits) {
    const existing = await ctx.runQuery(api.deposits.getByDepositId, {
      integrationId: params.integrationId,
      depositId: deposit.id,
    });
    if (existing) {
      continue;
    }
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

  const lastDeposit = deposits[deposits.length - 1];
  await saveDepositCursor(ctx, params.integrationId, {
    lastInsertTime: lastDeposit.insertTime,
  });

  return {
    fetched: deposits.length,
    inserted,
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
  const withdrawals = await fetchWithdrawals(params.apiKey, params.apiSecret, cursor?.lastApplyTime ?? null);

  if (withdrawals.length === 0) {
    return { fetched: 0, inserted: 0 };
  }

  withdrawals.sort((a, b) => resolveNumber(a.applyTime) - resolveNumber(b.applyTime));

  const now = Date.now();
  let inserted = 0;
  for (const withdrawal of withdrawals) {
    const existing = await ctx.runQuery(api.withdrawals.getByWithdrawId, {
      integrationId: params.integrationId,
      withdrawId: withdrawal.id,
    });
    if (existing) {
      continue;
    }
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
        applyTime: resolveNumber(withdrawal.applyTime),
        updateTime: withdrawal.updateTime ? resolveNumber(withdrawal.updateTime) : undefined,
        raw: withdrawal,
        createdAt: now,
      },
    });
    inserted += 1;
  }

  const lastWithdrawal = withdrawals[withdrawals.length - 1];
  await saveWithdrawalCursor(ctx, params.integrationId, {
    lastApplyTime: resolveNumber(lastWithdrawal.applyTime),
  });

  return {
    fetched: withdrawals.length,
    inserted,
  };
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

    const result = await ctx.runMutation(api.trades.ingestBatch, {
      integrationId: params.integrationId,
      trades: formattedTrades,
    });

    inserted += result.inserted;

    const lastTrade = trades[trades.length - 1];
    lastTradeId = lastTrade.id;
    lastTradeTime = lastTrade.time;

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

  return {
    symbol: scope,
    fetched,
    inserted,
  };
}

async function fetchDeposits(apiKey: string, apiSecret: string, startTime: number | null) {
  const params: Record<string, string> = {
    recvWindow: RECEIPT_WINDOW_MS.toString(),
    limit: MAX_LIMIT.toString(),
  };
  if (startTime !== null) {
    params.startTime = (startTime + 1).toString();
  }
  const response = await signedGet(apiKey, apiSecret, "/sapi/v1/capital/deposit/hisrec", params, SAPI_BASE_URL);
  if (!Array.isArray(response)) {
    return [];
  }
  return response as DepositRecord[];
}

async function fetchWithdrawals(apiKey: string, apiSecret: string, startTime: number | null) {
  const params: Record<string, string> = {
    recvWindow: RECEIPT_WINDOW_MS.toString(),
    limit: MAX_LIMIT.toString(),
  };
  if (startTime !== null) {
    params.startTime = (startTime + 1).toString();
  }
  const response = await signedGet(apiKey, apiSecret, "/sapi/v1/capital/withdraw/history", params, SAPI_BASE_URL);
  if (!Array.isArray(response)) {
    return [];
  }
  return response as WithdrawalRecord[];
}

async function loadDepositCursor(ctx: ActionCtx, integrationId: Id<"integrations">) {
  const state = await ctx.runQuery(api.integrations.getSyncState, {
    integrationId,
    dataset: DATASET_DEPOSITS,
    scope: "default",
  });
  if (!state?.cursor) {
    return null;
  }
  const cursor = state.cursor as Record<string, unknown>;
  return {
    lastInsertTime:
      typeof cursor.lastInsertTime === "number"
        ? cursor.lastInsertTime
        : typeof cursor.lastInsertTime === "string"
        ? Number(cursor.lastInsertTime)
        : null,
  } satisfies DepositCursor;
}

async function saveDepositCursor(ctx: ActionCtx, integrationId: Id<"integrations">, cursor: DepositCursor) {
  await ctx.runMutation(api.integrations.updateSyncState, {
    integrationId,
    dataset: DATASET_DEPOSITS,
    scope: "default",
    cursor,
  });
}

async function loadWithdrawalCursor(ctx: ActionCtx, integrationId: Id<"integrations">) {
  const state = await ctx.runQuery(api.integrations.getSyncState, {
    integrationId,
    dataset: DATASET_WITHDRAWALS,
    scope: "default",
  });
  if (!state?.cursor) {
    return null;
  }
  const cursor = state.cursor as Record<string, unknown>;
  return {
    lastApplyTime:
      typeof cursor.lastApplyTime === "number"
        ? cursor.lastApplyTime
        : typeof cursor.lastApplyTime === "string"
        ? Number(cursor.lastApplyTime)
        : null,
  } satisfies WithdrawalCursor;
}

async function saveWithdrawalCursor(ctx: ActionCtx, integrationId: Id<"integrations">, cursor: WithdrawalCursor) {
  await ctx.runMutation(api.integrations.updateSyncState, {
    integrationId,
    dataset: DATASET_WITHDRAWALS,
    scope: "default",
    cursor,
  });
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
