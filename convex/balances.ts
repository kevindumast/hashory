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

    const integrationMap = new Map(
      integrations.map((integration) => [integration._id, integration])
    );

    const records: Array<{
      _id: Id<"balances">;
      integrationId: Id<"integrations">;
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
      const balances = await ctx.db
        .query("balances")
        .withIndex("by_integration", (q) => q.eq("integrationId", integration._id))
        .collect();

      for (const balance of balances) {
        // Validate all required fields exist before pushing
        if (
          balance.asset &&
          balance.name &&
          typeof balance.free === "string" &&
          typeof balance.locked === "string" &&
          typeof balance.freeze === "string" &&
          typeof balance.withdrawing === "string" &&
          typeof balance.totalPosition === "string" &&
          typeof balance.btcValuation === "string" &&
          typeof balance.updatedAt === "number"
        ) {
          records.push({
            _id: balance._id as Id<"balances">,
            integrationId: integration._id as Id<"integrations">,
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
    }

    return records.map((record) => {
      const integration = integrationMap.get(record.integrationId);
      if (!integration) {
        throw new Error(`Integration not found for balance ${record._id}`);
      }
      return {
        _id: record._id,
        integrationId: record.integrationId,
        provider: integration.provider,
        providerDisplayName: integration.displayName ?? integration.provider,
        asset: record.asset,
        name: record.name,
        free: record.free,
        locked: record.locked,
        freeze: record.freeze,
        withdrawing: record.withdrawing,
        totalPosition: record.totalPosition,
        btcValuation: record.btcValuation,
        depositAddress: record.depositAddress,
        updatedAt: record.updatedAt,
      };
    });
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
