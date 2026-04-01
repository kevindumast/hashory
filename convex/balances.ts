import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

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
