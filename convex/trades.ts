import { mutation } from "./_generated/server";
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
