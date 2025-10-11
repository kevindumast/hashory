import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const latestRecommendations = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (_ctx, _args) => {
    throw new Error("Convex backend not configured yet.");
  },
});

export const saveRecommendation = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    summary: v.string(),
    recommendationType: v.union(
      v.literal("REALLOCATION"),
      v.literal("STOP_LOSS"),
      v.literal("RISK")
    ),
    payload: v.optional(v.any()),
    generatedAt: v.number(),
  },
  handler: async (_ctx, _args) => {
    throw new Error("Convex backend not configured yet.");
  },
});
