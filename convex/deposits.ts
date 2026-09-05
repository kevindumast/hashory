import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { optionalUserId } from "./auth";

export const getByDepositId = internalQuery({
  args: {
    integrationId: v.id("integrations"),
    depositId: v.string(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("deposits")
      .withIndex("by_integration_deposit", (q) =>
        q.eq("integrationId", args.integrationId).eq("depositId", args.depositId)
      )
      .first();
    return record ?? null;
  },
});

export const listByUser = query({
  args: {
    limit: v.optional(v.number()),
    refreshToken: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    void args.refreshToken;
    const clerkId = await optionalUserId(ctx);
    if (!clerkId) return [];

    const integrations = await ctx.db
      .query("integrations")
      .withIndex("by_user", (q) => q.eq("clerkUserId", clerkId))
      .collect();

    if (integrations.length === 0) return [];

    const integrationMap = new Map(integrations.map((i) => [i._id, i]));
    const records: Array<{
      _id: Id<"deposits">;
      integrationId: Id<"integrations">;
      coin: string;
      amount: number;
      network?: string;
      status: string;
      address?: string;
      addressTag?: string;
      insertTime: number;
      txId?: string;
    }> = [];

    for (const integration of integrations) {
      const deposits = await ctx.db
        .query("deposits")
        .withIndex("by_integration", (q) => q.eq("integrationId", integration._id))
        .collect();
      for (const deposit of deposits) {
        records.push({
          _id: deposit._id,
          integrationId: integration._id,
          coin: deposit.coin,
          amount: deposit.amount,
          network: deposit.network ?? undefined,
          status: deposit.status,
          address: deposit.address ?? undefined,
          addressTag: deposit.addressTag ?? undefined,
          insertTime: deposit.insertTime,
          txId: deposit.txId ?? undefined,
        });
      }
    }

    records.sort((a, b) => b.insertTime - a.insertTime);
    const limited = args.limit ? records.slice(0, args.limit) : records;

    return limited.map((record) => {
      const integration = integrationMap.get(record.integrationId)!;
      return {
        _id: record._id,
        integrationId: record.integrationId,
        provider: integration.provider,
        providerDisplayName: integration.displayName ?? integration.provider,
        coin: record.coin,
        amount: record.amount,
        network: record.network ?? null,
        status: record.status,
        address: record.address ?? null,
        addressTag: record.addressTag ?? null,
        insertTime: record.insertTime,
        txId: record.txId ?? null,
      };
    });
  },
});

export const listAssetsByIntegration = query({
  args: {
    integrationId: v.id("integrations"),
  },
  handler: async (ctx, args) => {
    const deposits = await ctx.db
      .query("deposits")
      .withIndex("by_integration", (q) => q.eq("integrationId", args.integrationId))
      .collect();

    const assets = new Set<string>();
    for (const deposit of deposits) {
      if (deposit.coin) assets.add(deposit.coin.toUpperCase());
    }
    return Array.from(assets);
  },
});

export const insert = internalMutation({
  args: {
    integrationId: v.id("integrations"),
    deposit: v.object({
      depositId: v.string(),
      txId: v.optional(v.string()),
      coin: v.string(),
      amount: v.number(),
      network: v.optional(v.string()),
      status: v.string(),
      address: v.optional(v.string()),
      addressTag: v.optional(v.string()),
      insertTime: v.number(),
      confirmedTime: v.optional(v.number()),
      fee: v.optional(v.number()),
      raw: v.optional(v.any()),
      createdAt: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("deposits")
      .withIndex("by_integration_deposit", (q) =>
        q.eq("integrationId", args.integrationId).eq("depositId", args.deposit.depositId)
      )
      .first();

    if (existing) {
      // Même principe que pour les opérations : une entrée déjà connue
      // récupère la commission qui lui manquait, sans être réécrite.
      if (existing.fee === undefined && args.deposit.fee !== undefined && args.deposit.fee > 0) {
        await ctx.db.patch(existing._id, { fee: args.deposit.fee });
      }
      return existing._id;
    }

    return await ctx.db.insert("deposits", {
      integrationId: args.integrationId,
      depositId: args.deposit.depositId,
      txId: args.deposit.txId,
      coin: args.deposit.coin,
      amount: args.deposit.amount,
      network: args.deposit.network,
      status: args.deposit.status,
      address: args.deposit.address,
      addressTag: args.deposit.addressTag,
      insertTime: args.deposit.insertTime,
      confirmedTime: args.deposit.confirmedTime,
      fee: args.deposit.fee,
      raw: args.deposit.raw,
      createdAt: args.deposit.createdAt,
    });
  },
});
