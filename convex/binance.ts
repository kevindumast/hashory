import { action } from "./_generated/server";
import { v } from "convex/values";
import HmacSHA256 from "crypto-js/hmac-sha256";
import { decryptSecret } from "./utils/encryption";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";

const DATASET_SPOT_TRADES = "spot_trades";
const DATASET_CONVERT_TRADES = "convert_trades";
const DATASET_FIAT_ORDERS = "fiat_orders";
const DATASET_DEPOSITS = "capital_deposits";
const DATASET_WITHDRAWALS = "capital_withdrawals";

const DEFAULT_BASE_URL = "https://api.binance.com";
const SAPI_BASE_URL = "https://api.binance.com";
const MAX_LIMIT = 1000;
const MAX_CONVERT_LIMIT = 1000;
const MAX_FIAT_LIMIT = 500;
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

// Force TAO to always be synchronized
const FORCED_SYMBOLS = ["TAOUSDT", "TAOUSDC"];

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
  "STRKUSDT",
  "STRKUSDC",
];

const HISTORY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const CONVERT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const FIAT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_HISTORY_ITERATIONS = 50; // Increased to cover ~4.5 years of history per symbol (50 * 90 days)
const MAX_EMPTY_WINDOWS = 5;

// Delays between requests (in milliseconds)
const DELAY_BACKFILL_REQUEST = 600; // 600ms entre requêtes pour backfill (éviter 429)
const DELAY_FORWARD_REQUEST = 100;  // 100ms entre requêtes pour forward
const DELAY_BETWEEN_SYNC_TYPES = 1000; // 1s entre les différents types de sync
const DELAY_FIAT_REQUEST = 1500; // 1.5s entre appels fiat (/sapi/v1/fiat/*) - limite Binance ~1 req/s

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
  moreData?: boolean;
};

type ConvertFetchResult = {
  records: BinanceConvertTrade[];
  moreData: boolean;
};

type NormalizedConvertTrade = {
  payload: {
    providerTradeId: string;
    tradeType: "SPOT" | "CONVERT" | "FIAT";
    symbol: string;
    side: "BUY" | "SELL";
    quantity: number;
    price: number;
    quoteQuantity: number;
    fee?: number;
    feeAsset?: string;
    isMaker: boolean;
    executedAt: number;
    fromAsset?: string;
    fromAmount?: number;
    toAsset?: string;
    toAmount?: number;
    raw: unknown;
  };
  updateTime: number;
};

// Unified type for both /sapi/v1/fiat/orders and /sapi/v1/fiat/payments
// Records with obtainCurrency = crypto trade (Acheter/Vendre)
// Records without obtainCurrency = fiat deposit/withdrawal (Dépôt/Retrait)
type BinanceFiatRecord = {
  orderNo?: string;
  orderId?: string;
  fiatCurrency: string;
  obtainCurrency?: string;   // /fiat/payments field name
  cryptoCurrency?: string;   // /fiat/orders field name (alias)
  amount?: string;           // net fiat amount
  sourceAmount?: string;     // /fiat/orders field name for fiat amount
  indicatedAmount?: string;  // gross fiat amount
  obtainAmount?: string;
  price?: string;
  totalFee?: string;
  fee?: string;
  method?: string;
  status: string;
  createTime: string | number;
  updateTime: string | number;
  orderType?: string;
};

type BinanceFiatResponse = {
  data?: BinanceFiatRecord[];
  total?: number;
  success?: boolean;
  code?: string;
  message?: string;
};

// Dust conversion (small balances → BNB)
type BinanceDribbletDetail = {
  transId: number;
  serviceChargeAmount: string;
  amount: string;
  operateTime: number;
  transferedAmount: string;
  fromAsset: string;
};

type BinanceDribbletEntry = {
  operateTime: number;
  totalTransferedAmount: string;
  totalServiceChargeAmount: string;
  transId: number;
  userAssetDribbletDetails: BinanceDribbletDetail[];
};

type BinanceDribbletResponse = {
  total: number;
  userAssetDribblets: BinanceDribbletEntry[];
};

type BinanceBalance = {
  asset: string;
  free: string;
  locked: string;
};

type BinanceAccount = {
  balances: BinanceBalance[];
};

type BinanceUserAsset = {
  asset: string;
  name: string;
  free: string;
  locked: string;
  freeze: string;
  withdrawing: string;
  ipoable: string;
  btcValuation: string;
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

type FiatCursor = {
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

type FiatSyncResult = {
  fetched: number;
  inserted: number;
  earliest?: number | null;
  latest?: number | null;
};

// ─── Assets Overview (getUserAsset + deposit addresses) ─────────────────────

export const getUserAssets = action({
  args: {
    integrationId: v.id("integrations"),
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

    const decryptedKey = decryptSecret(integration.encryptedCredentials.apiKey);
    const decryptedSecret = decryptSecret(integration.encryptedCredentials.apiSecret);

    const assets = (await signedPost(
      decryptedKey,
      decryptedSecret,
      "/sapi/v3/asset/getUserAsset",
      {},
      SAPI_BASE_URL
    )) as BinanceUserAsset[];

    // Fetch deposit addresses from DB
    const depositAddresses = (await ctx.runQuery(api.binanceDepositAddresses.getAll, {})) as Record<string, string>;

    const mapped = assets.map((a) => ({
      asset: a.asset,
      name: a.name,
      free: a.free,
      locked: a.locked,
      freeze: a.freeze,
      withdrawing: a.withdrawing,
      totalPosition: (
        parseFloat(a.free) +
        parseFloat(a.locked) +
        parseFloat(a.freeze)
      ).toFixed(8),
      btcValuation: a.btcValuation,
      depositAddress: depositAddresses[a.asset] ?? undefined,
    }));

    // Persist to balances table
    await ctx.runMutation(internal.balances.upsertBatch, {
      integrationId: args.integrationId,
      assets: mapped,
    });

    return mapped;
  },
});

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

    // Mark as syncing in DB
    await ctx.runMutation(api.integrations.updateSyncStatus, {
      integrationId: args.integrationId,
      syncStatus: "syncing",
    });

    const { apiKey, apiSecret } = integration.encryptedCredentials;
    const decryptedKey = decryptSecret(apiKey);
    const decryptedSecret = decryptSecret(apiSecret);

    try {

    const detection = await detectSymbols(ctx, {
      integrationId: args.integrationId,
      clerkUserId: integration.clerkUserId,
      apiKey: decryptedKey,
      apiSecret: decryptedSecret,
      explicitSymbols: args.options?.symbols ?? [],
    });

    console.log("Starting withdrawals sync...");
    const withdrawals = await syncWithdrawals(ctx, {
      integrationId: args.integrationId,
      apiKey: decryptedKey,
      apiSecret: decryptedSecret,
    });
    console.log(`Withdrawals: ${withdrawals.fetched} fetched, ${withdrawals.inserted} inserted`);

    await sleep(DELAY_BETWEEN_SYNC_TYPES);

    console.log("Starting deposits sync...");
    const deposits = await syncDeposits(ctx, {
      integrationId: args.integrationId,
      apiKey: decryptedKey,
      apiSecret: decryptedSecret,
    });
    console.log(`Deposits: ${deposits.fetched} fetched, ${deposits.inserted} inserted`);

    await sleep(DELAY_BETWEEN_SYNC_TYPES);

    console.log("Starting fiat orders sync...");
    const fiatOrders = await syncFiatOrders(ctx, {
      integrationId: args.integrationId,
      apiKey: decryptedKey,
      apiSecret: decryptedSecret,
    });
    console.log(`Fiat (all types): ${fiatOrders.fetched} fetched, ${fiatOrders.inserted} inserted`);

    await sleep(DELAY_BETWEEN_SYNC_TYPES);

    console.log("Starting convert trades sync...");
    const convertTrades = await syncConvertTrades(ctx, {
      integrationId: args.integrationId,
      apiKey: decryptedKey,
      apiSecret: decryptedSecret,
    });
    console.log(`Convert trades: ${convertTrades.fetched} fetched, ${convertTrades.inserted} inserted`);

    await sleep(DELAY_BETWEEN_SYNC_TYPES);

    console.log("Starting dust conversion sync...");
    const dustTrades = await syncDustConversions(ctx, {
      integrationId: args.integrationId,
      apiKey: decryptedKey,
      apiSecret: decryptedSecret,
    });
    console.log(`Dust conversions: ${dustTrades.fetched} fetched, ${dustTrades.inserted} inserted`);

    const accountCreationFromApi = await fetchAccountCreationTime(decryptedKey, decryptedSecret);
    const earliestActivityCandidates = [
      convertTrades.earliest ?? null,
      fiatOrders.earliest ?? null,
      deposits.earliest ?? null,
      withdrawals.earliest ?? null,
    ].filter((value): value is number => value !== null && Number.isFinite(value));
    const inferredCreation =
      earliestActivityCandidates.length > 0 ? Math.min(...earliestActivityCandidates) : null;
    const accountCreatedAt = accountCreationFromApi ?? inferredCreation ?? null;

    // Queue spot trades sync in background (don't await)
    console.log("📊 Launching spot trades sync in background...");
    ctx.scheduler.runAfter(0, api.binance.syncSpotTradesOnly, {
      integrationId: args.integrationId,
      symbols: detection.symbols,
      startTime: args.options?.startTime,
    });

    await ctx.runMutation(api.integrations.updateMetadata, {
      integrationId: args.integrationId,
      accountCreatedAt: accountCreatedAt ?? undefined,
      lastSyncedAt: Date.now(),
    });

    return {
      symbols: detection.symbols,
      convertTrades,
      fiatOrders,
      deposits,
      withdrawals,
      accountCreatedAt,
      spotTradesQueued: true,
    };

    } catch (error) {
      await ctx.runMutation(api.integrations.updateSyncStatus, {
        integrationId: args.integrationId,
        syncStatus: "error",
      });
      throw error;
    }
  },
});

// Separate action for spot trades sync - can run for longer without blocking
export const syncSpotTradesOnly = action({
  args: {
    integrationId: v.id("integrations"),
    symbols: v.array(v.string()),
    startTime: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const integration = (await ctx.runQuery(api.integrations.getById, {
      integrationId: args.integrationId,
    })) as (IntegrationRecord & { encryptedCredentials: { apiKey: string; apiSecret: string } }) | null;

    if (!integration) {
      throw new Error("Intégration introuvable.");
    }

    const { apiKey, apiSecret } = integration.encryptedCredentials;
    const decryptedKey = decryptSecret(apiKey);
    const decryptedSecret = decryptSecret(apiSecret);

    console.log("📊 Starting spot trades sync (background action)...");
    try {
      const trades = await syncSpotTrades(ctx, {
        integrationId: args.integrationId,
        apiKey: decryptedKey,
        apiSecret: decryptedSecret,
        symbols: args.symbols,
        startTime: args.startTime ?? null,
      });
      console.log(`📊 Spot trades: ${trades.fetched} fetched, ${trades.inserted} inserted`);

      // Spot trades is the last step — mark sync as complete
      await ctx.runMutation(api.integrations.updateSyncStatus, {
        integrationId: args.integrationId,
        syncStatus: "synced",
      });

      return trades;
    } catch (error) {
      await ctx.runMutation(api.integrations.updateSyncStatus, {
        integrationId: args.integrationId,
        syncStatus: "error",
      });
      throw error;
    }
  },
});

// Action to sync only fiat orders (for testing/debugging)
export const syncFiatOrdersOnly = action({
  args: {
    integrationId: v.id("integrations"),
  },
  handler: async (ctx, args) => {
    const integration = (await ctx.runQuery(api.integrations.getById, {
      integrationId: args.integrationId,
    })) as (IntegrationRecord & { encryptedCredentials: { apiKey: string; apiSecret: string } }) | null;

    if (!integration) {
      throw new Error("Intégration introuvable.");
    }

    const { apiKey, apiSecret } = integration.encryptedCredentials;
    const decryptedKey = decryptSecret(apiKey);
    const decryptedSecret = decryptSecret(apiSecret);

    await ctx.runMutation(api.integrations.updateSyncStatus, {
      integrationId: args.integrationId,
      syncStatus: "syncing",
    });

    try {
      const exchangeInfo = await fetchExchangeInfo();
      const symbolCatalog = new Map<string, SymbolMeta>();
      for (const entry of exchangeInfo) {
        symbolCatalog.set(entry.symbol.toUpperCase(), entry);
      }

      // Reset cursors to force full backfill
      await saveFiatCursor(ctx, args.integrationId, {
        initialized: false,
        lastUpdateTime: null,
        earliestUpdateTime: null,
      });
      console.log("📲 Fiat cursor reset, starting full fiat sync...");

      // Unified fiat sync: Acheter + Vendre + Dépôt + Retrait
      const result = await syncFiatOrders(ctx, {
        integrationId: args.integrationId,
        apiKey: decryptedKey,
        apiSecret: decryptedSecret,
      });
      console.log(`📲 Fiat (all types): ${result.fetched} fetched, ${result.inserted} inserted`);

      await ctx.runMutation(api.integrations.updateSyncStatus, {
        integrationId: args.integrationId,
        syncStatus: "synced",
      });

      return result;
    } catch (error) {
      await ctx.runMutation(api.integrations.updateSyncStatus, {
        integrationId: args.integrationId,
        syncStatus: "error",
      });
      throw error;
    }
  },
});

// Action to sync only dust conversions (small balances → BNB)
export const syncDustOnly = action({
  args: {
    integrationId: v.id("integrations"),
  },
  handler: async (ctx, args) => {
    const integration = (await ctx.runQuery(api.integrations.getById, {
      integrationId: args.integrationId,
    })) as (IntegrationRecord & { encryptedCredentials: { apiKey: string; apiSecret: string } }) | null;

    if (!integration) {
      throw new Error("Intégration introuvable.");
    }

    const { apiKey, apiSecret } = integration.encryptedCredentials;
    const decryptedKey = decryptSecret(apiKey);
    const decryptedSecret = decryptSecret(apiSecret);

    await ctx.runMutation(api.integrations.updateSyncStatus, {
      integrationId: args.integrationId,
      syncStatus: "syncing",
    });

    try {
      const result = await syncDustConversions(ctx, {
        integrationId: args.integrationId,
        apiKey: decryptedKey,
        apiSecret: decryptedSecret,
      });
      console.log(`🧹 Dust only: ${result.fetched} fetched, ${result.inserted} inserted`);

      await ctx.runMutation(api.integrations.updateSyncStatus, {
        integrationId: args.integrationId,
        syncStatus: "synced",
      });

      return result;
    } catch (error) {
      await ctx.runMutation(api.integrations.updateSyncStatus, {
        integrationId: args.integrationId,
        syncStatus: "error",
      });
      throw error;
    }
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

  // Ensure forced symbols are always included (TAO, etc.)
  FORCED_SYMBOLS.forEach((symbol) => {
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

export async function syncSpotTrades(
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

  console.log(`📊 Starting spot trades sync for ${params.symbols.length} symbols`);

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

  console.log(`✅ Spot trades sync complete: ${totalFetched} fetched, ${totalInserted} inserted across ${details.length} symbols`);

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
  console.log("🔄 Starting convert trades sync...");
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
    console.log(`Convert backfill: ${backfill.fetched} fetched, ${backfill.inserted} inserted`);
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

  console.log(`📥 Starting convert trades backfill from ${new Date(startingEndTime).toISOString()}`);

  while (endTime > 0 && iterations < MAX_HISTORY_ITERATIONS) {
    const windowStart = Math.max(0, endTime - CONVERT_WINDOW_MS);

    // Fetch ALL converts in this window (with internal pagination)
    const records = await fetchAllConvertTradesInWindow(
      params.apiKey,
      params.apiSecret,
      windowStart,
      endTime
    );
    iterations += 1;

    if (!Array.isArray(records) || records.length === 0) {
      if (windowStart === 0) {
        break;
      }
      endTime = windowStart - 1;
      continue;
    }


    const normalized = records
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

    const nextEndTime = windowEarliest > 0 ? windowEarliest - 1 : windowStart - 1;
    if (nextEndTime <= 0) {
      break;
    }
    endTime = nextEndTime;

    // Delay between windows (not too aggressive since we already paginated internally)
    await sleep(DELAY_FORWARD_REQUEST);
  }

  console.log(`✅ Convert trades backfill complete: ${fetched} fetched, ${inserted} inserted`);
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
  let windowStart = since !== null ? Math.max(0, since - 1) : Math.max(0, now - CONVERT_WINDOW_MS);
  let fetched = 0;
  let inserted = 0;
  let earliest: number | null = null;
  let latest: number | null = since ?? null;
  let iterations = 0;

  console.log(`📤 Starting convert trades forward sync from ${since ? new Date(since).toISOString() : 'beginning'}`);

  while (windowStart <= now && iterations < MAX_HISTORY_ITERATIONS) {
    const windowEnd = Math.min(windowStart + CONVERT_WINDOW_MS, now);

    // Fetch ALL converts in this window (with internal pagination)
    const records = await fetchAllConvertTradesInWindow(
      params.apiKey,
      params.apiSecret,
      windowStart,
      windowEnd
    );
    iterations += 1;

    if (!Array.isArray(records) || records.length === 0) {
      if (windowEnd >= now) {
        break;
      }
      windowStart = windowEnd + 1;
      continue;
    }


    const normalized = records
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

    // Delay between windows (not too aggressive since we already paginated internally)
    await sleep(DELAY_FORWARD_REQUEST);
  }

  console.log(`✅ Convert trades forward sync complete: ${fetched} fetched, ${inserted} inserted`);
  return {
    fetched,
    inserted,
    earliest,
    latest,
  };
}

// ─── Unified Fiat Sync ─────────────────────────────────────────────────
// Handles all 4 Binance fiat tabs:
//   Acheter  = /fiat/orders type 0  (buy crypto with fiat)
//   Vendre   = /fiat/orders type 1  (sell crypto to fiat)
//   Dépôt    = /fiat/payments type 0 (fiat deposit: Apple Pay, bank transfer)
//   Retrait  = /fiat/payments type 1 (fiat withdrawal to bank)
//
// Records WITH obtainCurrency → stored as trades
// Records WITHOUT obtainCurrency → stored as deposits/withdrawals

async function syncFiatOrders(
  ctx: ActionCtx,
  params: {
    integrationId: Id<"integrations">;
    apiKey: string;
    apiSecret: string;
  }
): Promise<FiatSyncResult> {
  const cursor = await loadFiatCursor(ctx, params.integrationId);

  const exchangeInfo = await fetchExchangeInfo();
  const symbolCatalog = new Map<string, SymbolMeta>();
  for (const entry of exchangeInfo) {
    symbolCatalog.set(entry.symbol.toUpperCase(), entry);
  }

  console.log(`📥 Starting unified fiat sync (fiat/orders, 90-day windows, 2 year history)`);

  const now = Date.now();
  const WINDOW_MS = 90 * 24 * 60 * 60 * 1000; // 90-day windows (Binance fiat API max range)
  const MAX_HISTORY_MS = 3 * 365 * 24 * 60 * 60 * 1000; // 3 ans d'historique
  const absoluteStart = now - MAX_HISTORY_MS;
  const MAX_CONSECUTIVE_EMPTY = 4; // stop after 4 empty windows (= 12 months gap)

  let totalFetched = 0;
  let totalInserted = 0;
  let earliest = cursor.earliestUpdateTime ?? null;
  let latest = cursor.lastUpdateTime ?? null;

  const sources: Array<{
    fetchFn: typeof fetchFiatOrders;
    txType: "0" | "1";
    label: string;
    isDeposit: boolean;
    source: "fiat_orders" | "fiat_payments";
  }> = [
    { fetchFn: fetchFiatOrders, txType: "0", label: "Acheter (orders)", isDeposit: false, source: "fiat_orders" },
    { fetchFn: fetchFiatOrders, txType: "1", label: "Vendre (orders)", isDeposit: false, source: "fiat_orders" },
    { fetchFn: fetchFiatPayments, txType: "0", label: "Dépôt fiat (payments)", isDeposit: true, source: "fiat_payments" },
    { fetchFn: fetchFiatPayments, txType: "1", label: "Retrait fiat (payments)", isDeposit: true, source: "fiat_payments" },
  ];

  for (const source of sources) {
    let windowEnd = now;
    let consecutiveEmpty = 0;

    console.log(`  📂 ${source.label} (txType=${source.txType})...`);

    while (windowEnd > absoluteStart && consecutiveEmpty < MAX_CONSECUTIVE_EMPTY) {
      const windowStart = Math.max(windowEnd - WINDOW_MS, absoluteStart);
      let page = 1;
      let windowHadRecords = false;
      while (page <= 50) {
        const batch = await source.fetchFn(params.apiKey, params.apiSecret, page, source.txType, windowStart, windowEnd);

        if (!Array.isArray(batch) || batch.length === 0) {
          break;
        }

        windowHadRecords = true;

        if (page === 1) {
          console.log(`    window ${new Date(windowStart).toISOString().slice(0,10)} -> ${new Date(windowEnd).toISOString().slice(0,10)}: ${batch.length} records, sample:`, JSON.stringify(batch[0]).slice(0, 200));
        }

        const { f, i, e, l } = await processFiatBatch(ctx, params, batch, symbolCatalog, source.isDeposit, source.txType, source.label, now, source.source);
        totalFetched += f;
        totalInserted += i;
        if (e !== null) earliest = earliest === null ? e : Math.min(earliest, e);
        if (l !== null) latest = latest === null ? l : Math.max(latest, l);

        if (batch.length < MAX_FIAT_LIMIT) break;
        page += 1;
        await sleep(DELAY_FIAT_REQUEST);
      }

      if (!windowHadRecords) {
        consecutiveEmpty += 1;
      } else {
        consecutiveEmpty = 0;
      }

      windowEnd = windowStart;
      await sleep(DELAY_FIAT_REQUEST);
    }

    await sleep(DELAY_BETWEEN_SYNC_TYPES);
  }

  const finalLatest = latest ?? cursor.lastUpdateTime ?? null;
  const finalEarliest = earliest ?? cursor.earliestUpdateTime ?? null;

  await saveFiatCursor(ctx, params.integrationId, {
    initialized: true,
    lastUpdateTime: finalLatest,
    earliestUpdateTime: finalEarliest,
  });

  console.log(`✅ Unified fiat sync complete: ${totalFetched} fetched, ${totalInserted} inserted`);

  return {
    fetched: totalFetched,
    inserted: totalInserted,
    earliest: finalEarliest,
    latest: finalLatest,
  };
}

async function processFiatBatch(
  ctx: ActionCtx,
  params: { integrationId: Id<"integrations">; apiKey: string; apiSecret: string },
  batch: BinanceFiatRecord[],
  symbolCatalog: Map<string, SymbolMeta>,
  forceDeposit: boolean,
  txType: "0" | "1",
  label: string,
  now: number,
  source: "fiat_orders" | "fiat_payments"
): Promise<{ f: number; i: number; e: number | null; l: number | null }> {
  let f = 0;
  let i = 0;
  let e: number | null = null;
  let l: number | null = null;

  // Separate: records with obtainCurrency = crypto trades, without = fiat deposits/withdrawals
  const trades: BinanceFiatRecord[] = [];
  const movements: BinanceFiatRecord[] = [];

  for (const record of batch) {
    // /fiat/orders uses cryptoCurrency, /fiat/payments uses obtainCurrency
    const obtainCurrency = (record.obtainCurrency ?? record.cryptoCurrency ?? "").trim();
    if (!forceDeposit && obtainCurrency.length > 0) {
      trades.push(record);
    } else {
      movements.push(record);
    }
  }

  // Process crypto trades (records with obtainCurrency)
  if (trades.length > 0) {
    const sourcePrefix = txType === "0" ? "binance_fiat_buy" : "binance_fiat_sell";
    const normalized = trades
      .map((order) => normalizeFiatOrder(order, symbolCatalog, sourcePrefix))
      .filter((order): order is NormalizedConvertTrade => order !== null);

    if (normalized.length > 0) {
      f += normalized.length;
      const payload = normalized.map((o) => o.payload);
      const result = await ctx.runMutation(api.trades.ingestBatch, {
        integrationId: params.integrationId,
        trades: payload,
      });
      i += result.inserted;
      for (const n of normalized) {
        if (e === null || n.updateTime < e) e = n.updateTime;
        if (l === null || n.updateTime > l) l = n.updateTime;
      }
    }
    console.log(`    [${label}] ${trades.length} crypto trades -> ${normalized.length} normalized, ${normalized.length - (normalized.length)} filtered`);
  }

  // Process fiat movements -> stored in fiatTransactions (no status filter, store everything)
  if (movements.length > 0) {
    let movInserted = 0;
    console.log(`    [${label}] processing ${movements.length} fiat movements...`);
    for (const record of movements) {
      const orderId = record.orderNo ?? record.orderId ?? "";
      if (!orderId) {
        console.log(`      SKIP no orderId, raw:`, JSON.stringify(record).slice(0, 200));
        continue;
      }

      const updateTime = resolveNumber(record.updateTime ?? record.createTime ?? 0);
      const createTime = resolveNumber(record.createTime ?? record.updateTime ?? 0);
      // /fiat/orders uses sourceAmount, /fiat/payments uses amount or indicatedAmount
      const fiatAmount = resolveNumber(record.sourceAmount ?? record.amount ?? record.indicatedAmount ?? 0);
      const fee = resolveNumber(record.totalFee ?? record.fee ?? 0);
      const fiatCurrency = (record.fiatCurrency ?? "EUR").toUpperCase();
      const cryptoCurrency = (record.obtainCurrency ?? record.cryptoCurrency)?.toUpperCase();
      const cryptoAmount = record.obtainAmount ? resolveNumber(record.obtainAmount) : undefined;
      const price = record.price ? resolveNumber(record.price) : undefined;

      console.log(`      orderId=${orderId} status="${record.status}" fiatAmount=${fiatAmount} fiatCurrency=${fiatCurrency}`);

      f += 1;
      await ctx.runMutation(api.fiatTransactions.insert, {
        integrationId: params.integrationId,
        tx: {
          orderId,
          source,
          txType,
          fiatCurrency,
          fiatAmount,
          cryptoCurrency,
          cryptoAmount,
          price: price !== undefined && !isNaN(price) ? price : undefined,
          fee: fee > 0 ? fee : undefined,
          method: record.method ?? undefined,
          status: record.status,
          createTime: createTime > 0 ? createTime : now,
          updateTime: updateTime > 0 ? updateTime : now,
          raw: record,
          createdAt: now,
        },
      });
      movInserted += 1;
      i += 1;

      if (updateTime > 0) {
        if (e === null || updateTime < e) e = updateTime;
        if (l === null || updateTime > l) l = updateTime;
      }
    }
    console.log(`    [${label}] ${movements.length} movements -> ${movInserted} inserted into fiatTransactions`);
  }

  return { f, i, e, l };
}

// ─── Fiat Payments (Dépôt / Retrait fiat) ─────────────────────────────

/**
 * Fetch a single batch of convert trades (no pagination within window)
 * Used internally by fetchAllConvertTradesInWindow
 */
async function fetchConvertTradesBatch(
  apiKey: string,
  apiSecret: string,
  startTime: number | null,
  endTime: number | null = null
): Promise<ConvertFetchResult> {
  const params: Record<string, string> = {
    limit: MAX_CONVERT_LIMIT.toString(),
  };
  if (startTime !== null && startTime !== undefined) {
    params.startTime = Math.floor(Math.max(0, startTime)).toString();
  }
  if (endTime !== null && endTime !== undefined) {
    params.endTime = Math.floor(Math.max(0, endTime)).toString();
  }

  const response = await signedGet(
    apiKey,
    apiSecret,
    "/sapi/v1/convert/tradeFlow",
    params,
    SAPI_BASE_URL
  );

  let records: BinanceConvertTrade[] = [];
  let moreData = false;

  if (Array.isArray(response)) {
    records = response as BinanceConvertTrade[];
  } else if (response && typeof response === "object") {
    const typed = response as BinanceConvertTradeFlowResponse;
    if (Array.isArray(typed.list)) {
      records = typed.list;
    }
    moreData = Boolean(typed.moreData);
  }

  return { records, moreData };
}

/**
 * Fetch ALL convert trades within a time window with internal pagination
 * If a window has > 1000 records, uses createTime pagination to fetch all
 * This matches the Binance API behavior: when you get exactly 1000 results,
 * there may be more data that overlaps with the endTime
 */
async function fetchAllConvertTradesInWindow(
  apiKey: string,
  apiSecret: string,
  startTime: number,
  endTime: number
): Promise<BinanceConvertTrade[]> {
  const allTrades: BinanceConvertTrade[] = [];
  let currentStartTime = startTime;

  while (currentStartTime < endTime) {
    const { records } = await fetchConvertTradesBatch(
      apiKey,
      apiSecret,
      currentStartTime,
      endTime
    );

    if (!Array.isArray(records) || records.length === 0) {
      break;
    }

    allTrades.push(...records);

    // If we got exactly MAX_CONVERT_LIMIT records, there might be more
    // Paginate using the last trade's createTime
    if (records.length === MAX_CONVERT_LIMIT) {
      const lastTrade = records[records.length - 1];
      // Use createTime + 1 to avoid duplicates
      currentStartTime = Math.floor(Number(lastTrade.createTime)) + 1;

      // Small delay to respect rate limits
      await sleep(100);
    } else {
      // Got less than limit, so we've exhausted this window
      break;
    }
  }

  return allTrades;
}

/**
 * Legacy: Fetch a single batch (deprecated, use fetchAllConvertTradesInWindow instead)
 */
async function fetchConvertTrades(
  apiKey: string,
  apiSecret: string,
  startTime: number | null,
  endTime: number | null = null
): Promise<ConvertFetchResult> {
  return fetchConvertTradesBatch(apiKey, apiSecret, startTime, endTime);
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

  console.log(`📥 Starting deposits backfill from ${new Date(startingEndTime).toISOString()}`);

  while (endTime > 0 && iterations < MAX_HISTORY_ITERATIONS) {
    const windowStart = Math.max(0, endTime - HISTORY_WINDOW_MS);

    const batch = await fetchDeposits(params.apiKey, params.apiSecret, windowStart, endTime);
    iterations += 1;

    if (!Array.isArray(batch) || batch.length === 0) {
      emptyWindows += 1;
      if (emptyWindows >= MAX_EMPTY_WINDOWS || windowStart === 0) {
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

    let newInserts = 0;
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
        newInserts += 1;
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

    // Delay between requests to respect rate limits (backfill = conservative)
    await sleep(DELAY_BACKFILL_REQUEST);
  }

  console.log(`✅ Deposits backfill complete: ${fetched} fetched, ${inserted} inserted`);
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

  console.log(`📤 Starting deposits forward sync from ${lastInsertTime ? new Date(lastInsertTime).toISOString() : 'beginning'}`);

  while (iterations < MAX_HISTORY_ITERATIONS) {
    // Binance API requires time interval within 90 days, so clamp startTime to at most 90 days ago
    let effectiveStartTime = pointer;
    if (effectiveStartTime !== null) {
      const minAllowedTime = now - HISTORY_WINDOW_MS;
      if (effectiveStartTime < minAllowedTime) {
        effectiveStartTime = minAllowedTime;
      }
    }
    const batch = await fetchDeposits(params.apiKey, params.apiSecret, effectiveStartTime, null);
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

    let newInserts = 0;
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
        newInserts += 1;
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

  console.log(`✅ Deposits forward sync complete: ${fetched} fetched, ${inserted} inserted`);
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

  console.log(`📥 Withdrawals backfill...`);

  while (endTime > 0 && iterations < MAX_HISTORY_ITERATIONS) {
    const windowStart = Math.max(0, endTime - HISTORY_WINDOW_MS);

    const batch = await fetchWithdrawals(params.apiKey, params.apiSecret, windowStart, endTime);
    iterations += 1;

    if (!Array.isArray(batch) || batch.length === 0) {
      emptyWindows += 1;
      if (emptyWindows >= MAX_EMPTY_WINDOWS || windowStart === 0) {
        break;
      }
      endTime = windowStart - 1;
      continue;
    }

    emptyWindows = 0;

    const normalized = batch
      .map((withdrawal) => ({
        ...withdrawal,
        applyTime: parseTimestamp(withdrawal.applyTime),
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

    let newInserts = 0;
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
            updateTime: withdrawal.updateTime ? parseTimestamp(withdrawal.updateTime) : undefined,
            raw: withdrawal,
            createdAt: now,
          },
        });
        inserted += 1;
        newInserts += 1;
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

    // Delay between requests to respect rate limits (backfill = conservative)
    await sleep(DELAY_BACKFILL_REQUEST);
  }

  console.log(`✅ Withdrawals backfill: ${fetched} fetched, ${inserted} inserted`);
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

  console.log(`📤 Starting withdrawals forward sync from ${lastApplyTime ? new Date(lastApplyTime).toISOString() : 'beginning'}`);

  while (iterations < MAX_HISTORY_ITERATIONS) {
    // Binance API requires time interval within 90 days, so clamp startTime to at most 90 days ago
    let effectiveStartTime = pointer;
    if (effectiveStartTime !== null) {
      const minAllowedTime = now - HISTORY_WINDOW_MS;
      if (effectiveStartTime < minAllowedTime) {
        effectiveStartTime = minAllowedTime;
      }
    }
    const batch = await fetchWithdrawals(params.apiKey, params.apiSecret, effectiveStartTime, null);
    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }
    iterations += 1;

    const normalized = batch
      .map((withdrawal) => ({
        ...withdrawal,
        applyTime: parseTimestamp(withdrawal.applyTime),
      }))
      .filter((withdrawal) => withdrawal.applyTime > (lastApplyTime ?? 0))
      .sort((a, b) => a.applyTime - b.applyTime);

    if (normalized.length === 0) {
      break;
    }

    fetched += normalized.length;

    let newInserts = 0;
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
            updateTime: withdrawal.updateTime ? parseTimestamp(withdrawal.updateTime) : undefined,
            raw: withdrawal,
            createdAt: now,
          },
        });
        inserted += 1;
        newInserts += 1;
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

  console.log(`✅ Withdrawals forward sync complete: ${fetched} fetched, ${inserted} inserted`);
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

/**
 * Fetch all trades for a symbol using pagination with fromId
 * This is more efficient than time-based fetching - no need for 24h delays
 * Fetches trades in batches of MAX_LIMIT (1000) using fromId pagination
 */
async function fetchAllTradesPaginated(
  apiKey: string,
  apiSecret: string,
  symbol: string
): Promise<BinanceTrade[]> {
  const allTrades: BinanceTrade[] = [];
  let fromId: number | null = null;

  while (true) {
    const params: Record<string, string> = {
      symbol: symbol.toUpperCase(),
      limit: MAX_LIMIT.toString(),
    };

    if (fromId !== null) {
      params.fromId = (fromId + 1).toString();
    }


    const trades = (await signedGet(apiKey, apiSecret, "/api/v3/myTrades", params)) as unknown;

    // Handle error responses
    if (trades && typeof trades === "object" && "code" in trades) {
      const error = trades as Record<string, unknown>;
      console.error(`❌ Binance API error: ${error.code} - ${error.msg}`);
      break;
    }

    if (!Array.isArray(trades) || trades.length === 0) {
      break;
    }

    allTrades.push(...(trades as BinanceTrade[]));
    const lastTrade = trades[trades.length - 1] as BinanceTrade;
    fromId = lastTrade.id;

    // Stop if we got less than MAX_LIMIT (we've reached the end)
    if (trades.length < MAX_LIMIT) {
      console.log(`  ✅ ${symbol}: Completed - ${allTrades.length} total trades fetched`);
      break;
    }

    // Respect rate limits (100ms between requests)
    await sleep(100);
  }

  return allTrades;
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

  // Fetch exchange info to get symbol metadata (baseAsset, quoteAsset)
  const exchangeInfo = await fetchExchangeInfo();
  const symbolCatalog = new Map<string, SymbolMeta>();
  for (const entry of exchangeInfo) {
    symbolCatalog.set(entry.symbol.toUpperCase(), entry);
  }

  // Get symbol metadata for calculating FROM/TO
  const symbolMeta = symbolCatalog.get(scope);

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
      const quantity = Number(trade.qty);
      const quoteQuantity = Number(trade.quoteQty);

      // Calculate FROM/TO fields for spot trades
      let fromAsset: string | undefined;
      let fromAmount: number | undefined;
      let toAsset: string | undefined;
      let toAmount: number | undefined;

      if (symbolMeta) {
        if (side === "BUY") {
          // BUY: spend quote currency, receive base currency
          fromAsset = symbolMeta.quoteAsset;
          fromAmount = quoteQuantity;
          toAsset = symbolMeta.baseAsset;
          toAmount = quantity;
        } else {
          // SELL: spend base currency, receive quote currency
          fromAsset = symbolMeta.baseAsset;
          fromAmount = quantity;
          toAsset = symbolMeta.quoteAsset;
          toAmount = quoteQuantity;
        }
      }

      return {
        providerTradeId: trade.id.toString(),
        tradeType: "SPOT" as const,
        symbol: trade.symbol.toUpperCase(),
        side,
        quantity,
        price: Number(trade.price),
        quoteQuantity,
        fee: Number(trade.commission),
        feeAsset: trade.commissionAsset ?? undefined,
        isMaker: Boolean(trade.isMaker),
        executedAt: Number(trade.time),
        fromAsset,
        fromAmount,
        toAsset,
        toAmount,
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

    // Delay between requests to respect rate limits (forward = faster)
    await sleep(DELAY_FORWARD_REQUEST);
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
    limit: MAX_LIMIT.toString(),
  };
  if (startTime !== null && startTime !== undefined) {
    params.startTime = Math.floor(Math.max(0, startTime)).toString();
  }
  if (endTime !== null && endTime !== undefined) {
    params.endTime = Math.floor(Math.max(0, endTime)).toString();
  }

  const response = await signedGet(apiKey, apiSecret, "/sapi/v1/capital/deposit/hisrec", params, SAPI_BASE_URL);
  if (!Array.isArray(response)) {
    return [];
  }
  return response as DepositRecord[];
}

async function fetchWithdrawals(
  apiKey: string,
  apiSecret: string,
  startTime: number | null,
  endTime: number | null = null
) {
  const params: Record<string, string> = {
    limit: MAX_LIMIT.toString(),
  };
  if (startTime !== null && startTime !== undefined) {
    params.startTime = Math.floor(Math.max(0, startTime)).toString();
  }
  if (endTime !== null && endTime !== undefined) {
    params.endTime = Math.floor(Math.max(0, endTime)).toString();
  }

  const response = await signedGet(apiKey, apiSecret, "/sapi/v1/capital/withdraw/history", params, SAPI_BASE_URL);
  if (!Array.isArray(response)) {
    return [];
  }
  return response as WithdrawalRecord[];
}

async function fetchDustLog(
  apiKey: string,
  apiSecret: string,
  startTime?: number,
  endTime?: number
): Promise<BinanceDribbletEntry[]> {
  const params: Record<string, string> = {
    recvWindow: RECEIPT_WINDOW_MS.toString(),
  };
  if (startTime !== undefined) {
    params.startTime = Math.floor(Math.max(0, startTime)).toString();
  }
  if (endTime !== undefined) {
    params.endTime = Math.floor(Math.max(0, endTime)).toString();
  }

  const response = await signedGet(apiKey, apiSecret, "/sapi/v1/asset/dribblet", params, SAPI_BASE_URL);

  if (!response || typeof response !== "object") {
    return [];
  }

  const typed = response as BinanceDribbletResponse;
  console.log(`[fetchDustLog] total=${typed.total}, entries=${typed.userAssetDribblets?.length ?? 0}`);
  return typed.userAssetDribblets ?? [];
}

async function syncDustConversions(
  ctx: ActionCtx,
  params: {
    integrationId: Id<"integrations">;
    apiKey: string;
    apiSecret: string;
  }
): Promise<{ fetched: number; inserted: number }> {
  console.log("🧹 Fetching dust conversion log...");

  const entries = await fetchDustLog(params.apiKey, params.apiSecret);
  if (entries.length === 0) {
    console.log("🧹 No dust conversions found");
    return { fetched: 0, inserted: 0 };
  }

  const trades: Array<{
    providerTradeId: string;
    tradeType: "DUST";
    symbol: string;
    side: "SELL";
    quantity: number;
    price: number;
    quoteQuantity: number;
    fee: number;
    feeAsset: string;
    isMaker: boolean;
    executedAt: number;
    fromAsset: string;
    fromAmount: number;
    toAsset: string;
    toAmount: number;
    raw: unknown;
  }> = [];

  for (const entry of entries) {
    for (const detail of entry.userAssetDribbletDetails) {
      const fromAmount = resolveNumber(detail.amount);
      const toAmount = resolveNumber(detail.transferedAmount);
      const fee = resolveNumber(detail.serviceChargeAmount);
      const fromAsset = detail.fromAsset.toUpperCase();

      if (fromAmount <= 0 || toAmount <= 0) continue;

      const price = fromAmount / toAmount; // price of BNB in fromAsset terms
      const symbol = `${fromAsset}BNB`;

      trades.push({
        providerTradeId: `dust:${detail.transId}:${fromAsset}`,
        tradeType: "DUST",
        symbol,
        side: "SELL",
        quantity: fromAmount,
        price: toAmount / fromAmount, // BNB per unit of fromAsset
        quoteQuantity: toAmount,
        fee,
        feeAsset: "BNB",
        isMaker: false,
        executedAt: detail.operateTime,
        fromAsset,
        fromAmount,
        toAsset: "BNB",
        toAmount,
        raw: { source: "dust", entry, detail },
      });
    }
  }

  for (const t of trades) {
    console.log(`🧹 [dust] id=${t.providerTradeId} ${t.fromAsset} ${t.fromAmount} → BNB ${t.toAmount} (fee=${t.fee} BNB) at ${new Date(t.executedAt).toISOString()}`);
  }
  console.log(`🧹 ${trades.length} dust trades to ingest`);

  if (trades.length === 0) {
    return { fetched: 0, inserted: 0 };
  }

  const result = await ctx.runMutation(api.trades.ingestBatch, {
    integrationId: params.integrationId,
    trades,
  });

  console.log(`🧹 Dust conversions: ${trades.length} fetched, ${result.inserted} inserted`);
  return { fetched: trades.length, inserted: result.inserted };
}

async function fetchFiatOrders(
  apiKey: string,
  apiSecret: string,
  page: number = 1,
  transactionType: "0" | "1" = "0",
  beginTime?: number,
  endTime?: number
) {
  const params: Record<string, string> = {
    recvWindow: RECEIPT_WINDOW_MS.toString(),
    transactionType,
    rows: MAX_FIAT_LIMIT.toString(),
    page: page.toString(),
  };
  if (beginTime !== undefined) {
    params.beginTime = beginTime.toString();
  }
  if (endTime !== undefined) {
    params.endTime = endTime.toString();
  }

  const response = await signedGet(apiKey, apiSecret, "/sapi/v1/fiat/orders", params, SAPI_BASE_URL);

  console.log(`[fetchFiatOrders] txType=${transactionType} page=${page} response type=${typeof response}, isArray=${Array.isArray(response)}, keys=${response && typeof response === "object" ? Object.keys(response as object).join(",") : "N/A"}`);

  if (Array.isArray(response)) {
    return response as BinanceFiatRecord[];
  }

  if (response && typeof response === "object") {
    const typed = response as BinanceFiatResponse;
    if (Array.isArray(typed.data)) {
      console.log(`[fetchFiatOrders] txType=${transactionType} data.length=${typed.data.length}, total=${typed.total}`);
      return typed.data;
    }
  }

  console.log(`[fetchFiatOrders] txType=${transactionType} returning empty, raw:`, JSON.stringify(response).slice(0, 500));
  return [];
}

async function fetchFiatPayments(
  apiKey: string,
  apiSecret: string,
  page: number = 1,
  transactionType: "0" | "1" = "0",
  beginTime?: number,
  endTime?: number
) {
  const params: Record<string, string> = {
    recvWindow: RECEIPT_WINDOW_MS.toString(),
    transactionType,
    rows: MAX_FIAT_LIMIT.toString(),
    page: page.toString(),
  };
  if (beginTime !== undefined) {
    params.beginTime = beginTime.toString();
  }
  if (endTime !== undefined) {
    params.endTime = endTime.toString();
  }

  const response = await signedGet(apiKey, apiSecret, "/sapi/v1/fiat/payments", params, SAPI_BASE_URL);

  console.log(`[fetchFiatPayments] txType=${transactionType} page=${page} response type=${typeof response}, isArray=${Array.isArray(response)}, keys=${response && typeof response === "object" ? Object.keys(response as object).join(",") : "N/A"}`);

  if (Array.isArray(response)) {
    return response as BinanceFiatRecord[];
  }

  if (response && typeof response === "object") {
    const typed = response as BinanceFiatResponse;
    if (Array.isArray(typed.data)) {
      console.log(`[fetchFiatPayments] txType=${transactionType} data.length=${typed.data.length}, total=${typed.total}`);
      return typed.data;
    }
  }

  console.log(`[fetchFiatPayments] txType=${transactionType} returning empty, raw:`, JSON.stringify(response).slice(0, 500));
  return [];
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

async function loadFiatCursor(ctx: ActionCtx, integrationId: Id<"integrations">): Promise<FiatCursor> {
  const state = await ctx.runQuery(api.integrations.getSyncState, {
    integrationId,
    dataset: DATASET_FIAT_ORDERS,
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

async function saveFiatCursor(ctx: ActionCtx, integrationId: Id<"integrations">, cursor: FiatCursor) {
  await ctx.runMutation(api.integrations.updateSyncState, {
    integrationId,
    dataset: DATASET_FIAT_ORDERS,
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

function normalizeFiatOrder(
  order: BinanceFiatRecord,
  symbolCatalog: Map<string, SymbolMeta>,
  sourcePrefix: string = "binance_fiat_buy"
): NormalizedConvertTrade | null {
  const status = String(order.status ?? "").toUpperCase();
  if (!status.includes("SUCCESS") && !status.includes("COMPLETED")) {
    console.log(`[normalizeFiat] SKIP status="${order.status}" orderId=${order.orderId}`);
    return null;
  }

  const fiatCurrency = (order.fiatCurrency ?? "").toUpperCase();
  // /fiat/orders uses cryptoCurrency, /fiat/payments uses obtainCurrency
  const obtainCurrency = (order.obtainCurrency ?? order.cryptoCurrency ?? "").toUpperCase();
  if (!fiatCurrency || !obtainCurrency) {
    console.log(`[normalizeFiat] SKIP empty currency fiat="${fiatCurrency}" obtain="${obtainCurrency}" orderId=${order.orderId ?? order.orderNo}`);
    return null;
  }

  // /fiat/orders uses sourceAmount, /fiat/payments uses amount or indicatedAmount
  const fiatAmount =
    resolveNumber(order.sourceAmount ?? order.amount ?? order.indicatedAmount ?? 0);
  const cryptoAmount = resolveNumber(order.obtainAmount ?? 0);

  if (fiatAmount <= 0 || cryptoAmount <= 0) {
    console.log(`[normalizeFiat] SKIP amounts fiat=${fiatAmount} crypto=${cryptoAmount} orderId=${order.orderId}`);
    return null;
  }

  const updateTimestamp = resolveNumber(order.updateTime ?? order.createTime ?? 0);
  const executedAt = updateTimestamp > 0 ? updateTimestamp : resolveNumber(order.createTime ?? 0);
  if (executedAt <= 0) {
    return null;
  }

  const { symbol, side } = resolveConvertSymbol(symbolCatalog, fiatCurrency, obtainCurrency);

  const quantity = side === "BUY" ? cryptoAmount : fiatAmount;
  const quoteQuantity = side === "BUY" ? fiatAmount : cryptoAmount;

  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(quoteQuantity) || quoteQuantity < 0) {
    return null;
  }

  const explicitPrice = resolveNumber(order.price ?? 0);
  const price = explicitPrice > 0 ? explicitPrice : quoteQuantity / quantity;
  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  const feeValue =
    resolveNumber(order.totalFee ?? 0) ||
    resolveNumber((order as { fee?: string }).fee ?? 0);
  const fee = feeValue > 0 ? feeValue : undefined;

  const rawId = order.orderId ?? order.orderNo ?? "";
  const providerTradeId = rawId && String(rawId).trim().length > 0 ? `${sourcePrefix}:${rawId}` : null;

  if (!providerTradeId) {
    return null;
  }

  return {
    payload: {
      providerTradeId,
      tradeType: "FIAT" as const,
      symbol,
      side,
      quantity,
      price,
      quoteQuantity,
      fee,
      feeAsset: fee ? fiatCurrency : undefined,
      isMaker: false,
      executedAt,
      fromAsset: fiatCurrency,
      fromAmount: fiatAmount,
      toAsset: obtainCurrency,
      toAmount: cryptoAmount,
      raw: {
        source: sourcePrefix,
        order,
      },
    },
    updateTime: executedAt,
  };
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
      tradeType: "CONVERT" as const,
      symbol,
      side,
      quantity,
      price,
      quoteQuantity,
      fee,
      feeAsset,
      isMaker: false,
      executedAt,
      fromAsset,
      fromAmount,
      toAsset,
      toAmount,
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

/**
 * Parse a timestamp that can be:
 * - A number (Unix timestamp in milliseconds)
 * - A string number ("1234567890")
 * - An ISO date string ("2025-01-24 18:42:10" or "2025-01-24T18:42:10Z")
 * Returns 0 if parsing fails.
 */
function parseTimestamp(value: number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  // If it's already a number, return it
  if (typeof value === "number") {
    return value;
  }

  // Try to parse as a direct number first
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return asNumber;
  }

  // Try to parse as an ISO date string
  if (typeof value === "string") {
    try {
      // Handle both "YYYY-MM-DD HH:mm:ss" and ISO 8601 formats
      const dateValue = new Date(value.replace(' ', 'T') + 'Z');
      const timestamp = dateValue.getTime();
      if (Number.isFinite(timestamp) && timestamp > 0) {
        return timestamp;
      }
    } catch (e) {
      // Fall through to return 0
    }
  }

  return 0;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function signedGet(
  apiKey: string,
  apiSecret: string,
  path: string,
  params: Record<string, string | number>,
  baseUrl = DEFAULT_BASE_URL,
  retryCount = 0
): Promise<unknown> {
  const MAX_RETRIES = 3;
  const BASE_DELAY = 30000; // 30 secondes de base (Binance throttle dure souvent 1-2 min)

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, String(value));
  }

  // Add timestamp and recvWindow if not already present
  searchParams.set("timestamp", Date.now().toString());
  if (!searchParams.has("recvWindow")) {
    searchParams.set("recvWindow", RECEIPT_WINDOW_MS.toString());
  }

  const signature = HmacSHA256(searchParams.toString(), apiSecret).toString();
  searchParams.set("signature", signature);

  const response = await fetch(`${baseUrl}${path}?${searchParams.toString()}`, {
    method: "GET",
    headers: {
      "X-MBX-APIKEY": apiKey,
    },
  });

  const raw = await response.text();

  // Handle IP ban (418) - do not retry, Binance has banned the IP
  if (response.status === 418) {
    const retryAfter = response.headers.get("Retry-After");
    console.error(`IP banned by Binance (418). Retry-After: ${retryAfter}s`);
    throw new Error(`Binance API IP ban (418). Wait ${retryAfter ?? "unknown"} seconds before retrying.`);
  }

  // Handle rate limit (429) - always wait and retry, no limit
  // Binance rate limits are temporary, we just need to be patient
  if (response.status === 429) {
    const retryAfterHeader = response.headers.get("Retry-After");
    const delay = retryAfterHeader
      ? Math.min(parseInt(retryAfterHeader, 10) * 1000, 180_000) // respect header, max 3 min
      : Math.min(BASE_DELAY * Math.pow(2, retryCount), 180_000); // fallback: exponential backoff, max 3 min
    console.warn(`Rate limit hit (429), Retry-After=${retryAfterHeader ?? "none"}, waiting ${delay}ms (attempt ${retryCount + 1})`);
    await sleep(delay);
    return signedGet(apiKey, apiSecret, path, params, baseUrl, retryCount + 1);
  }

  if (!response.ok) {
    console.error(`Binance API error for ${path}:`, {
      status: response.status,
      statusText: response.statusText,
      body: raw.slice(0, 500),
    });
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

async function signedPost(
  apiKey: string,
  apiSecret: string,
  path: string,
  params: Record<string, string | number> = {},
  baseUrl = DEFAULT_BASE_URL,
  retryCount = 0
): Promise<unknown> {
  const MAX_RETRIES = 3;
  const BASE_DELAY = 30000;

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, String(value));
  }

  searchParams.set("timestamp", Date.now().toString());
  if (!searchParams.has("recvWindow")) {
    searchParams.set("recvWindow", RECEIPT_WINDOW_MS.toString());
  }

  const signature = HmacSHA256(searchParams.toString(), apiSecret).toString();
  searchParams.set("signature", signature);

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "X-MBX-APIKEY": apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: searchParams.toString(),
  });

  const raw = await response.text();

  if (response.status === 418) {
    const retryAfter = response.headers.get("Retry-After");
    throw new Error(`Binance API IP ban (418). Wait ${retryAfter ?? "unknown"} seconds before retrying.`);
  }

  if (response.status === 429) {
    const retryAfterHeader = response.headers.get("Retry-After");
    const delay = retryAfterHeader
      ? Math.min(parseInt(retryAfterHeader, 10) * 1000, 180_000)
      : Math.min(BASE_DELAY * Math.pow(2, retryCount), 180_000);
    console.warn(`Rate limit hit (429), waiting ${delay}ms (attempt ${retryCount + 1})`);
    await sleep(delay);
    return signedPost(apiKey, apiSecret, path, params, baseUrl, retryCount + 1);
  }

  if (!response.ok) {
    console.error(`Binance API error for ${path}:`, {
      status: response.status,
      statusText: response.statusText,
      body: raw.slice(0, 500),
    });
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
