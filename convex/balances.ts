import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

// ─── Query: toutes les balances d'une intégration ───────────────────────────

export const getByIntegration = query({
  args: { integrationId: v.id("integrations") },
  handler: async (ctx, { integrationId }) => {
    return await ctx.db
      .query("balances")
      .withIndex("by_integration", (q) => q.eq("integrationId", integrationId))
      .collect();
  },
});

export const listByUser = query({
  args: {
    clerkId: v.string(),
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

    const results: Array<{
      _id: Id<"balances">;
      integrationId: Id<"integrations">;
      provider: string;
      providerDisplayName: string;
      asset: string;
      name: string;
      free: string;
      locked: string;
      freeze: string;
      withdrawing: string;
      totalPosition: string;
      btcValuation: string;
      depositAddress?: string;
      updatedAt: number;
    }> = [];

    for (const integration of integrations) {
      if (!integration.provider) continue;

      const balances = await ctx.db
        .query("balances")
        .withIndex("by_integration", (q) => q.eq("integrationId", integration._id))
        .collect();

      for (const balance of balances) {
        // Skip invalid balance records
        if (
          !balance.asset ||
          !balance.name ||
          balance.free === null ||
          balance.free === undefined ||
          balance.locked === null ||
          balance.locked === undefined ||
          balance.freeze === null ||
          balance.freeze === undefined ||
          balance.withdrawing === null ||
          balance.withdrawing === undefined ||
          balance.totalPosition === null ||
          balance.totalPosition === undefined ||
          balance.btcValuation === null ||
          balance.btcValuation === undefined ||
          balance.updatedAt === null ||
          balance.updatedAt === undefined
        ) {
          continue;
        }

        results.push({
          _id: balance._id as Id<"balances">,
          integrationId: integration._id as Id<"integrations">,
          provider: integration.provider,
          providerDisplayName: integration.displayName ?? integration.provider,
          asset: balance.asset,
          name: balance.name,
          free: balance.free,
          locked: balance.locked,
          freeze: balance.freeze,
          withdrawing: balance.withdrawing,
          totalPosition: balance.totalPosition,
          btcValuation: balance.btcValuation,
          depositAddress: balance.depositAddress ?? undefined,
          updatedAt: balance.updatedAt,
        });
      }
    }

    return results;
  },
});

// ─── Query: balance d'un asset spécifique ───────────────────────────────────

export const getByAsset = query({
  args: {
    integrationId: v.id("integrations"),
    asset: v.string(),
  },
  handler: async (ctx, { integrationId, asset }) => {
    return await ctx.db
      .query("balances")
      .withIndex("by_integration_asset", (q) =>
        q.eq("integrationId", integrationId).eq("asset", asset.toUpperCase())
      )
      .unique();
  },
});

// ─── Mutation interne: upsert batch de balances ─────────────────────────────

export const upsertBatch = internalMutation({
  args: {
    integrationId: v.id("integrations"),
    assets: v.array(
      v.object({
        asset: v.string(),
        name: v.string(),
        free: v.string(),
        locked: v.string(),
        freeze: v.string(),
        withdrawing: v.string(),
        totalPosition: v.string(),
        btcValuation: v.string(),
        depositAddress: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, { integrationId, assets }) => {
    const now = Date.now();
    let upserted = 0;

    for (const a of assets) {
      const existing = await ctx.db
        .query("balances")
        .withIndex("by_integration_asset", (q) =>
          q.eq("integrationId", integrationId).eq("asset", a.asset)
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          ...a,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("balances", {
          integrationId,
          ...a,
          updatedAt: now,
        });
      }
      upserted++;
    }

    // Remove assets that are no longer in the response
    const currentAssets = new Set(assets.map((a) => a.asset));
    const allExisting = await ctx.db
      .query("balances")
      .withIndex("by_integration", (q) => q.eq("integrationId", integrationId))
      .collect();

    for (const existing of allExisting) {
      if (!currentAssets.has(existing.asset)) {
        await ctx.db.delete(existing._id);
      }
    }

    return { upserted };
  },
});
