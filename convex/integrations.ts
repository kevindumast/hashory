import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { encryptSecret } from "./utils/encryption";
import { optionalUserId, requireUserId } from "./auth";

const SUPPORTED_PROVIDERS = ["binance"];

export const list = query({
  args: {},
  handler: async (ctx) => {
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
    }));
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
    });

    return { status: "created", provider: args.provider };
  },
});
