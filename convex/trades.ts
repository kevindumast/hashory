import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listTrades = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (_ctx, _args) => {
    throw new Error("Convex backend not configured yet.");
  },
});

export const recordTrade = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    symbol: v.string(),
    side: v.union(v.literal("BUY"), v.literal("SELL")),
    quantity: v.number(),
    price: v.number(),
    fee: v.optional(v.number()),
    executedAt: v.number(),
  },
  handler: async (_ctx, _args) => {
    throw new Error("Convex backend not configured yet.");
  },
});
