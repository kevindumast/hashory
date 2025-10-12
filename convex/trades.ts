import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const ingestBatch = mutation({
  args: {
    integrationId: v.id("integrations"),
    trades: v.array(
      v.object({
        providerTradeId: v.string(),
        symbol: v.string(),
        side: v.union(v.literal("BUY"), v.literal("SELL")),
        quantity: v.number(),
        price: v.number(),
        quoteQuantity: v.optional(v.number()),
        fee: v.optional(v.number()),
        feeAsset: v.optional(v.string()),
        isMaker: v.boolean(),
        executedAt: v.number(),
        raw: v.optional(v.any()),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    const now = Date.now();

    for (const trade of args.trades) {
      const existing = await ctx.db
        .query("trades")
        .withIndex("by_integration_trade", (q) =>
          q.eq("integrationId", args.integrationId).eq("providerTradeId", trade.providerTradeId)
        )
        .first();

      if (existing) {
        continue;
      }

      await ctx.db.insert("trades", {
        integrationId: args.integrationId,
        providerTradeId: trade.providerTradeId,
        portfolioId: undefined,
        symbol: trade.symbol,
        side: trade.side,
        quantity: trade.quantity,
        price: trade.price,
        quoteQuantity: trade.quoteQuantity,
        fee: trade.fee,
        feeAsset: trade.feeAsset,
        isMaker: trade.isMaker,
        executedAt: trade.executedAt,
        raw: trade.raw,
        createdAt: now,
      });
      inserted += 1;
    }

    return { inserted };
  },
});

export const listByUser = query({
  args: {
    clerkId: v.string(),
    limit: v.optional(v.number()),
    refreshToken: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const integrations = await ctx.db
      .query("integrations")
      .withIndex("by_user", (q) => q.eq("clerkUserId", args.clerkId))
      .collect();

    if (integrations.length === 0) {
      return [];
    }

    const integrationMap = new Map(
      integrations.map((integration) => [integration._id, integration])
    );

    const trades = await ctx.db.query("trades").collect();

    const filtered = trades
      .filter((trade) => integrationMap.has(trade.integrationId))
      .sort((a, b) => b.createdAt - a.createdAt);

    const limited = args.limit ? filtered.slice(0, args.limit) : filtered;

    return limited.map((trade) => {
      const integration = integrationMap.get(trade.integrationId)!;
      return {
        _id: trade._id,
        integrationId: trade.integrationId,
        provider: integration.provider,
        providerDisplayName: integration.displayName ?? integration.provider,
        symbol: trade.symbol,
        side: trade.side,
        quantity: trade.quantity,
        price: trade.price,
        quoteQuantity: trade.quoteQuantity,
        fee: trade.fee,
        feeAsset: trade.feeAsset,
        isMaker: trade.isMaker,
        executedAt: trade.executedAt,
        createdAt: trade.createdAt,
      };
    });
  },
});
