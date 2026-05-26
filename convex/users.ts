import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUserId } from "./auth";

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await requireUserId(ctx);
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .first();
  },
});

export const upsertUser = mutation({
  args: {
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireUserId(ctx);
    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .first();

    if (existing) {
      const patch: Record<string, string | number> = {};
      if (args.email !== undefined && args.email !== existing.email) patch.email = args.email;
      if (args.displayName !== undefined && args.displayName !== existing.displayName) patch.displayName = args.displayName;
      if (args.avatarUrl !== undefined && args.avatarUrl !== existing.avatarUrl) patch.avatarUrl = args.avatarUrl;
      if (Object.keys(patch).length > 0) await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId,
      email: args.email,
      displayName: args.displayName,
      avatarUrl: args.avatarUrl,
      createdAt: now,
    });
  },
});
