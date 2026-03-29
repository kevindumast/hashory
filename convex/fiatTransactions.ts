import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getByOrderId = query({
  args: {
    integrationId: v.id("integrations"),
    orderId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("fiatTransactions")
      .withIndex("by_integration_order", (q) =>
        q.eq("integrationId", args.integrationId).eq("orderId", args.orderId)
      )
      .first() ?? null;
  },
});

export const listByIntegration = query({
  args: {
    integrationId: v.id("integrations"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("fiatTransactions")
      .withIndex("by_integration", (q) => q.eq("integrationId", args.integrationId))
      .collect();
  },
});

export const listByUser = query({
  args: {
    clerkId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const integrations = await ctx.db
      .query("integrations")
      .withIndex("by_user", (q) => q.eq("clerkUserId", args.clerkId))
      .collect();

    if (integrations.length === 0) return [];

    const all = [];
    for (const integration of integrations) {
      const rows = await ctx.db
        .query("fiatTransactions")
        .withIndex("by_integration", (q) => q.eq("integrationId", integration._id))
        .collect();
      for (const row of rows) {
        all.push({
          ...row,
          provider: integration.provider,
          providerDisplayName: integration.displayName ?? integration.provider,
        });
      }
    }

    all.sort((a, b) => b.updateTime - a.updateTime);
    return args.limit ? all.slice(0, args.limit) : all;
  },
});

export const insert = mutation({
  args: {
    integrationId: v.id("integrations"),
    tx: v.object({
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
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("fiatTransactions")
      .withIndex("by_integration_order", (q) =>
        q.eq("integrationId", args.integrationId).eq("orderId", args.tx.orderId)
      )
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("fiatTransactions", {
      integrationId: args.integrationId,
      ...args.tx,
    });
  },
});
