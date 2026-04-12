import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_clerk_id", ["clerkId"]),
  portfolios: defineTable({
    userId: v.id("users"),
    exchange: v.string(),
    label: v.string(),
    totalValueUsd: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
  trades: defineTable({
    integrationId: v.id("integrations"),
    providerTradeId: v.string(),
    providerOrderId: v.optional(v.string()), // Binance orderId for deduplication with orders table
    portfolioId: v.optional(v.id("portfolios")),
    tradeType: v.optional(v.union(v.literal("SPOT"), v.literal("CONVERT"), v.literal("FIAT"), v.literal("DUST"))),
    symbol: v.string(),
    side: v.union(v.literal("BUY"), v.literal("SELL")),
    quantity: v.number(),
    price: v.number(),
    quoteQuantity: v.optional(v.number()),
    fee: v.optional(v.number()),
    feeAsset: v.optional(v.string()),
    isMaker: v.boolean(),
    executedAt: v.number(),
    // FROM -> TO fields for clear exchange display
    fromAsset: v.optional(v.string()),
    fromAmount: v.optional(v.number()),
    toAsset: v.optional(v.string()),
    toAmount: v.optional(v.number()),
    raw: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_integration", ["integrationId"])
    .index("by_integration_trade", ["integrationId", "providerTradeId"])
    .index("by_integration_order", ["integrationId", "providerOrderId"]),
  orders: defineTable({
    integrationId: v.id("integrations"),
    providerOrderId: v.string(), // Binance orderId
    symbol: v.string(),
    side: v.union(v.literal("BUY"), v.literal("SELL")),
    orderType: v.string(), // LIMIT, MARKET, TAKE_PROFIT_LIMIT, STOP_LOSS_LIMIT, etc.
    status: v.string(), // FILLED, PARTIALLY_FILLED, CANCELED, etc.
    quantity: v.number(), // executedQty
    price: v.number(), // average execution price
    quoteQuantity: v.number(), // cummulativeQuoteQty
    executedAt: v.number(), // updateTime (when filled)
    fromAsset: v.optional(v.string()),
    fromAmount: v.optional(v.number()),
    toAsset: v.optional(v.string()),
    toAmount: v.optional(v.number()),
    raw: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_integration", ["integrationId"])
    .index("by_integration_order", ["integrationId", "providerOrderId"]),
  convertTrades: defineTable({
    integrationId: v.id("integrations"),
    providerTradeId: v.string(), // convert:{orderId}
    orderStatus: v.string(), // SUCCESS, PROCESS, FAIL
    fromAsset: v.string(),
    fromAmount: v.number(),
    toAsset: v.string(),
    toAmount: v.number(),
    price: v.number(),
    inversePrice: v.optional(v.number()),
    fee: v.optional(v.number()),
    feeAsset: v.optional(v.string()),
    executedAt: v.number(),
    raw: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_integration", ["integrationId"])
    .index("by_integration_trade", ["integrationId", "providerTradeId"]),
  analytics: defineTable({
    portfolioId: v.id("portfolios"),
    metric: v.string(),
    value: v.number(),
    computedAt: v.number(),
    window: v.optional(v.string()),
  }).index("by_portfolio_metric", ["portfolioId", "metric"]),
  aiRecommendations: defineTable({
    portfolioId: v.id("portfolios"),
    summary: v.string(),
    recommendationType: v.union(
      v.literal("REALLOCATION"),
      v.literal("STOP_LOSS"),
      v.literal("RISK")
    ),
    payload: v.optional(v.any()),
    generatedAt: v.number(),
  }).index("by_portfolio_type", ["portfolioId", "recommendationType"]),
  integrations: defineTable({
    clerkUserId: v.string(),
    provider: v.string(),
    displayName: v.optional(v.string()),
    readOnly: v.boolean(),
    encryptedCredentials: v.object({
      apiKey: v.string(),
      apiSecret: v.string(),
    }),
    scopes: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastSyncedAt: v.optional(v.number()),
    syncStatus: v.optional(v.union(v.literal("idle"), v.literal("syncing"), v.literal("synced"), v.literal("error"))),
    accountCreatedAt: v.optional(v.number()),
  })
    .index("by_user", ["clerkUserId"])
    .index("by_user_provider", ["clerkUserId", "provider"]),
  integrationSyncStates: defineTable({
    integrationId: v.id("integrations"),
    dataset: v.string(),
    scope: v.string(),
    cursor: v.string(),
    updatedAt: v.number(),
  }).index("by_integration_dataset_scope", ["integrationId", "dataset", "scope"]),
  deposits: defineTable({
    integrationId: v.id("integrations"),
    depositId: v.string(),
    txId: v.optional(v.string()),
    coin: v.string(),
    amount: v.number(),
    network: v.optional(v.string()),
    status: v.string(),
    address: v.optional(v.string()),
    addressTag: v.optional(v.string()),
    insertTime: v.number(),
    confirmedTime: v.optional(v.number()),
    raw: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_integration", ["integrationId"])
    .index("by_integration_deposit", ["integrationId", "depositId"]),
  withdrawals: defineTable({
    integrationId: v.id("integrations"),
    withdrawId: v.string(),
    txId: v.optional(v.string()),
    coin: v.string(),
    amount: v.number(),
    network: v.optional(v.string()),
    address: v.optional(v.string()),
    addressTag: v.optional(v.string()),
    fee: v.number(),
    status: v.string(),
    applyTime: v.number(),
    updateTime: v.optional(v.number()),
    raw: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_integration", ["integrationId"])
    .index("by_integration_withdraw", ["integrationId", "withdrawId"]),
  fiatTransactions: defineTable({
    integrationId: v.id("integrations"),
    orderId: v.string(),
    source: v.union(v.literal("fiat_orders"), v.literal("fiat_payments")),
    txType: v.union(v.literal("0"), v.literal("1")),
    fiatCurrency: v.string(),
    fiatAmount: v.number(),
    cryptoCurrency: v.optional(v.string()),
    cryptoAmount: v.optional(v.number()),
    price: v.optional(v.number()),
    fee: v.optional(v.number()),
    method: v.optional(v.string()),
    status: v.string(),
    createTime: v.number(),
    updateTime: v.number(),
    raw: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_integration", ["integrationId"])
    .index("by_integration_order", ["integrationId", "orderId"]),
  cmcTokenMap: defineTable({
    symbol: v.string(),
    cmcId: v.optional(v.number()),
    iconUrl: v.optional(v.string()),
    name: v.string(),
    slug: v.string(),
    updatedAt: v.optional(v.number()),
  }).index("by_symbol", ["symbol"]),
  balances: defineTable({
    integrationId: v.id("integrations"),
    asset: v.string(),
    name: v.string(),
    free: v.string(),
    locked: v.string(),
    freeze: v.string(),
    withdrawing: v.string(),
    totalPosition: v.string(),
    btcValuation: v.string(),
    depositAddress: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_integration", ["integrationId"])
    .index("by_integration_asset", ["integrationId", "asset"]),
  binanceDepositAddresses: defineTable({
    coin: v.string(),
    address: v.string(),
    network: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_coin", ["coin"]),
  spotTradesSyncQueue: defineTable({
    integrationId: v.id("integrations"),
    symbols: v.array(v.string()),
    startTime: v.optional(v.number()),
    status: v.union(v.literal("pending"), v.literal("processing"), v.literal("completed"), v.literal("failed")),
    error: v.optional(v.string()),
    result: v.optional(v.object({
      fetched: v.number(),
      inserted: v.number(),
      earliest: v.optional(v.number()),
      latest: v.optional(v.number()),
    })),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_integration_status", ["integrationId", "status"])
    .index("by_status", ["status"]),
});
