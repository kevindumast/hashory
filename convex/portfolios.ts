import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listPortfolios = query({
  args: { userId: v.id("users") },
  handler: async (_ctx, _args) => {
    throw new Error("Convex backend not configured yet.");
  },
});

export const upsertPortfolio = mutation({
  args: {
    portfolioId: v.optional(v.id("portfolios")),
    userId: v.id("users"),
    exchange: v.string(),
    label: v.string(),
    totalValueUsd: v.optional(v.number()),
  },
  handler: async (_ctx, _args) => {
    throw new Error("Convex backend not configured yet.");
  },
});
