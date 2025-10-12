import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { encryptSecret } from "./utils/encryption";
import { optionalUserId, requireUserId } from "./auth";

const SUPPORTED_PROVIDERS = ["binance"];

export const list = query({
  args: {
    refreshToken: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    void args.refreshToken;
    const userId = await optionalUserId(ctx);
    if (!userId) {
      return [];
    }

    const integrations = await ctx.db
      .query("integrations")
      .withIndex("by_user", (q) => q.eq("clerkUserId", userId))
      .order("desc")
      .collect();

    return integrations.map((integration) => ({
      _id: integration._id,
      provider: integration.provider,
      displayName: integration.displayName ?? integration.provider,
      readOnly: integration.readOnly,
      scopes: integration.scopes ?? [],
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
      lastSyncedAt: integration.lastSyncedAt ?? null,
      accountCreatedAt: integration.accountCreatedAt ?? null,
    }));
  },
});

export const listSyncScopes = query({
  args: {
    clerkId: v.string(),
    dataset: v.optional(v.string()),
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

    const scopes = [];

    for (const integration of integrations) {
      const states = await ctx.db
        .query("integrationSyncStates")
        .withIndex("by_integration_dataset_scope", (q) => q.eq("integrationId", integration._id))
        .collect();

      for (const state of states) {
        if (args.dataset && state.dataset !== args.dataset) {
          continue;
        }
        scopes.push({
          integrationId: integration._id,
          dataset: state.dataset,
          scope: state.scope,
          updatedAt: state.updatedAt,
        });
      }
    }

    return scopes;
  },
});

export const upsert = mutation({
  args: {
    provider: v.string(),
    apiKey: v.string(),
    apiSecret: v.string(),
    readOnly: v.boolean(),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    if (!SUPPORTED_PROVIDERS.includes(args.provider)) {
      throw new Error(`Unsupported provider: ${args.provider}`);
    }

    const now = Date.now();

    const encryptedCredentials = {
      apiKey: encryptSecret(args.apiKey),
      apiSecret: encryptSecret(args.apiSecret),
    };

    const existing = await ctx.db
      .query("integrations")
      .withIndex("by_user_provider", (q) => q.eq("clerkUserId", userId).eq("provider", args.provider))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        encryptedCredentials,
        readOnly: args.readOnly,
        displayName: args.displayName,
        updatedAt: now,
      });
      return { status: "updated", provider: args.provider };
    }

    await ctx.db.insert("integrations", {
      clerkUserId: userId,
      provider: args.provider,
      displayName: args.displayName,
      readOnly: args.readOnly,
      encryptedCredentials,
      scopes: args.readOnly ? ["read"] : [],
      createdAt: now,
      updatedAt: now,
      accountCreatedAt: undefined,
    });

    return { status: "created", provider: args.provider };
  },
});

export const getById = query({
  args: { integrationId: v.id("integrations") },
  handler: async (ctx, args) => {
    const integration = await ctx.db.get(args.integrationId);
    return integration ?? null;
  },
});

export const getSyncState = query({
  args: {
    integrationId: v.id("integrations"),
    dataset: v.string(),
    scope: v.string(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("integrationSyncStates")
      .withIndex("by_integration_dataset_scope", (q) =>
        q.eq("integrationId", args.integrationId).eq("dataset", args.dataset).eq("scope", args.scope)
      )
      .first();

    if (!record) {
      return null;
    }

    let cursor: Record<string, unknown> | null = null;
    try {
      cursor = JSON.parse(record.cursor);
    } catch (error) {
      cursor = null;
    }

    return {
      ...record,
      cursor,
    };
  },
});

export const updateSyncState = mutation({
  args: {
    integrationId: v.id("integrations"),
    dataset: v.string(),
    scope: v.string(),
    cursor: v.any(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const cursorJson = JSON.stringify(args.cursor ?? {});

    const existing = await ctx.db
      .query("integrationSyncStates")
      .withIndex("by_integration_dataset_scope", (q) =>
        q.eq("integrationId", args.integrationId).eq("dataset", args.dataset).eq("scope", args.scope)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        cursor: cursorJson,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("integrationSyncStates", {
        integrationId: args.integrationId,
        dataset: args.dataset,
        scope: args.scope,
        cursor: cursorJson,
        updatedAt: now,
      });
    }

    await ctx.db.patch(args.integrationId, {
      lastSyncedAt: now,
      updatedAt: now,
    });

    return { status: "ok", updatedAt: now };
  },
});

export const updateMetadata = mutation({
  args: {
    integrationId: v.id("integrations"),
    accountCreatedAt: v.optional(v.number()),
    lastSyncedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const payload: Record<string, unknown> = {};
    if (args.accountCreatedAt !== undefined) {
      payload.accountCreatedAt = args.accountCreatedAt;
    }
    if (args.lastSyncedAt !== undefined) {
      payload.lastSyncedAt = args.lastSyncedAt;
    }
    if (Object.keys(payload).length === 0) {
      return { status: "noop" };
    }
    await ctx.db.patch(args.integrationId, payload);
    return { status: "ok" };
  },
});
