import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const ingestBatch = mutation({
  args: {
    integrationId: v.id("integrations"),
    orders: v.array(
      v.object({
        providerOrderId: v.string(),
        symbol: v.string(),
        side: v.union(v.literal("BUY"), v.literal("SELL")),
        orderType: v.string(),
        status: v.string(),
        quantity: v.number(),
        price: v.number(),
        quoteQuantity: v.number(),
        executedAt: v.number(),
        fromAsset: v.optional(v.string()),
        fromAmount: v.optional(v.number()),
        toAsset: v.optional(v.string()),
        toAmount: v.optional(v.number()),
        raw: v.optional(v.any()),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    const now = Date.now();

    for (const order of args.orders) {
      const existing = await ctx.db
        .query("orders")
        .withIndex("by_integration_order", (q) =>
          q.eq("integrationId", args.integrationId).eq("providerOrderId", order.providerOrderId)
        )
        .first();

      if (existing) {
        continue;
      }

      await ctx.db.insert("orders", {
        integrationId: args.integrationId,
        providerOrderId: order.providerOrderId,
        symbol: order.symbol,
        side: order.side,
        orderType: order.orderType,
        status: order.status,
        quantity: order.quantity,
        price: order.price,
        quoteQuantity: order.quoteQuantity,
        executedAt: order.executedAt,
        fromAsset: order.fromAsset,
        fromAmount: order.fromAmount,
        toAsset: order.toAsset,
        toAmount: order.toAmount,
        raw: order.raw,
        createdAt: now,
      });
      inserted += 1;
    }

    return { inserted };
  },
});

export const listByIntegration = query({
  args: {
    integrationId: v.id("integrations"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_integration", (q) => q.eq("integrationId", args.integrationId))
      .collect();
  },
});

export const listByUser = query({
  args: {
    clerkId: v.string(),
    limit: v.optional(v.number()),
    refreshToken: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    void args.refreshToken;

    const integrations = await ctx.db
      .query("integrations")
      .withIndex("by_user", (q) => q.eq("clerkUserId", args.clerkId))
      .collect();

    if (integrations.length === 0) return [];

    const integrationMap = new Map(
      integrations.map((i) => [i._id, i])
    );

    const ordersPerIntegration = await Promise.all(
      integrations.map((integration) => {
        const cursor = ctx.db
          .query("orders")
          .withIndex("by_integration", (q) => q.eq("integrationId", integration._id))
          .order("desc");
        return args.limit ? cursor.take(args.limit) : cursor.collect();
      })
    );

    const sorted = ordersPerIntegration
      .flat()
      .sort((a, b) => b.executedAt - a.executedAt);

    const limited = args.limit ? sorted.slice(0, args.limit) : sorted;

    return limited.map((order) => {
      const integration = integrationMap.get(order.integrationId)!;
      return {
        _id: order._id,
        integrationId: order.integrationId,
        provider: integration.provider,
        providerDisplayName: integration.displayName ?? integration.provider,
        providerOrderId: order.providerOrderId,
        symbol: order.symbol,
        side: order.side,
        orderType: order.orderType,
        status: order.status,
        quantity: order.quantity,
        price: order.price,
        quoteQuantity: order.quoteQuantity,
        executedAt: order.executedAt,
        fromAsset: order.fromAsset,
        fromAmount: order.fromAmount,
        toAsset: order.toAsset,
        toAmount: order.toAmount,
      };
    });
  },
});
