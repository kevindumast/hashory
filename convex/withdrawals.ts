import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

export const getByWithdrawId = query({
  args: {
    integrationId: v.id("integrations"),
    withdrawId: v.string(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("withdrawals")
      .withIndex("by_integration_withdraw", (q) =>
        q.eq("integrationId", args.integrationId).eq("withdrawId", args.withdrawId)
      )
      .first();
    return record ?? null;
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

    if (integrations.length === 0) {
      return [];
    }

    const integrationMap = new Map(integrations.map((integration) => [integration._id, integration]));
    const records: Array<{
      _id: Id<"withdrawals">;
      integrationId: Id<"integrations">;
      coin: string;
      amount: number;
      network?: string;
      status: string;
      address?: string;
      addressTag?: string;
      applyTime: number;
      updateTime?: number;
      fee: number;
      txId?: string;
    }> = [];

    for (const integration of integrations) {
      const withdrawals = await ctx.db
        .query("withdrawals")
        .withIndex("by_integration", (q) => q.eq("integrationId", integration._id))
        .collect();
      for (const withdrawal of withdrawals) {
        records.push({
          _id: withdrawal._id,
          integrationId: integration._id,
          coin: withdrawal.coin,
          amount: withdrawal.amount,
          network: withdrawal.network ?? undefined,
          status: withdrawal.status,
          address: withdrawal.address ?? undefined,
          addressTag: withdrawal.addressTag ?? undefined,
          applyTime: withdrawal.applyTime,
          updateTime: withdrawal.updateTime ?? undefined,
          fee: withdrawal.fee,
          txId: withdrawal.txId ?? undefined,
        });
      }
    }

    records.sort((a, b) => b.applyTime - a.applyTime);
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
        applyTime: record.applyTime,
        updateTime: record.updateTime ?? null,
        fee: record.fee,
        txId: record.txId ?? null,
      };
    });
  },
});

export const insert = mutation({
  args: {
    integrationId: v.id("integrations"),
    withdrawal: v.object({
      withdrawId: v.string(),
      txId: v.optional(v.string()),
      coin: v.string(),
      amount: v.number(),
      network: v.optional(v.string()),
      address: v.optional(v.string()),
      addressTag: v.optional(v.string()),
      fee: v.number(),
      status: v.string(),
      applyTime: v.number(),
      updateTime: v.optional(v.number()),
      raw: v.optional(v.any()),
      createdAt: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("withdrawals")
      .withIndex("by_integration_withdraw", (q) =>
        q.eq("integrationId", args.integrationId).eq("withdrawId", args.withdrawal.withdrawId)
      )
      .first();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("withdrawals", {
      integrationId: args.integrationId,
      withdrawId: args.withdrawal.withdrawId,
      txId: args.withdrawal.txId,
      coin: args.withdrawal.coin,
      amount: args.withdrawal.amount,
      network: args.withdrawal.network,
      address: args.withdrawal.address,
      addressTag: args.withdrawal.addressTag,
      fee: args.withdrawal.fee,
      status: args.withdrawal.status,
      applyTime: args.withdrawal.applyTime,
      updateTime: args.withdrawal.updateTime,
      raw: args.withdrawal.raw,
      createdAt: args.withdrawal.createdAt,
    });
  },
});
