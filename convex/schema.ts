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
    portfolioId: v.id("portfolios"),
    symbol: v.string(),
    side: v.union(v.literal("BUY"), v.literal("SELL")),
    quantity: v.number(),
    price: v.number(),
    fee: v.optional(v.number()),
    executedAt: v.number(),
  }).index("by_portfolio", ["portfolioId"]),
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
  })
    .index("by_user", ["clerkUserId"])
    .index("by_user_provider", ["clerkUserId", "provider"]),
});
