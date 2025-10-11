import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getAnalytics = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (_ctx, _args) => {
    throw new Error("Convex backend not configured yet.");
  },
});

export const upsertMetric = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    metric: v.string(),
    value: v.number(),
    computedAt: v.number(),
    window: v.optional(v.string()),
  },
  handler: async (_ctx, _args) => {
    throw new Error("Convex backend not configured yet.");
  },
});
