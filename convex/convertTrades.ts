import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const ingestBatch = mutation({
  args: {
    integrationId: v.id("integrations"),
    trades: v.array(
      v.object({
        providerTradeId: v.string(),
        orderStatus: v.string(),
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
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    const now = Date.now();

    for (const trade of args.trades) {
      const existing = await ctx.db
        .query("convertTrades")
        .withIndex("by_integration_trade", (q) =>
          q.eq("integrationId", args.integrationId).eq("providerTradeId", trade.providerTradeId)
        )
        .first();

      if (existing) continue;

      await ctx.db.insert("convertTrades", {
        integrationId: args.integrationId,
        providerTradeId: trade.providerTradeId,
        orderStatus: trade.orderStatus,
        fromAsset: trade.fromAsset,
        fromAmount: trade.fromAmount,
        toAsset: trade.toAsset,
        toAmount: trade.toAmount,
        price: trade.price,
        inversePrice: trade.inversePrice,
        fee: trade.fee,
        feeAsset: trade.feeAsset,
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
    refreshToken: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const integrations = await ctx.db
      .query("integrations")
      .withIndex("by_user", (q) => q.eq("clerkUserId", args.clerkId))
      .collect();

    if (integrations.length === 0) return [];

    const integrationMap = new Map(
      integrations.map((i) => [i._id, i])
    );

    const allTrades = await ctx.db.query("convertTrades").collect();

    return allTrades
      .filter((t) => integrationMap.has(t.integrationId))
      .sort((a, b) => b.executedAt - a.executedAt);
  },
});
