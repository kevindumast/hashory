import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { optionalUserId, requireUserId } from "./auth";
import { categoryInfo, type JustificationCategory } from "../lib/justification";

const MAX_NOTE_LENGTH = 1000;

/** Pointages de l'utilisateur, les plus récents d'abord. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await optionalUserId(ctx);
    if (!clerkId) return [];
    const rows = await ctx.db
      .query("flowJustifications")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .collect();
    return rows
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((row) => ({
        operationId: row.operationId,
        direction: row.direction,
        category: row.category,
        costEur: row.costEur,
        linkedOperationId: row.linkedOperationId,
        note: row.note,
        updatedAt: row.updatedAt,
      }));
  },
});

/**
 * Pointe une opération, ou met à jour son pointage. Le recalcul du
 * portefeuille, relancé par l'écran, en tient compte : le pointage entre
 * dans l'empreinte des données.
 */
export const upsert = mutation({
  args: {
    operationId: v.string(),
    direction: v.union(v.literal("in"), v.literal("out")),
    category: v.string(),
    costEur: v.optional(v.number()),
    linkedOperationId: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireUserId(ctx);
    const info = categoryInfo(args.direction, args.category as JustificationCategory);
    if (!info) throw new ConvexError({ code: "invalid_category", message: "Catégorie de pointage inconnue." });
    if (args.costEur !== undefined && (!Number.isFinite(args.costEur) || args.costEur < 0 || args.costEur > 1e10)) {
      throw new ConvexError({ code: "invalid_cost", message: "Prix d'acquisition invalide." });
    }
    if (info.needsLink && !args.linkedOperationId) {
      throw new ConvexError({ code: "missing_link", message: "Choisissez l'opération correspondante." });
    }
    const note = args.note?.trim().slice(0, MAX_NOTE_LENGTH) || undefined;
    const fields = {
      direction: args.direction,
      category: args.category,
      costEur: info.needsCost ? args.costEur : undefined,
      linkedOperationId: info.needsLink ? args.linkedOperationId : undefined,
      note,
      updatedAt: Date.now(),
    };

    const upsertOne = async (operationId: string, values: typeof fields) => {
      const existing = await ctx.db
        .query("flowJustifications")
        .withIndex("by_user_operation", (q) => q.eq("clerkId", clerkId).eq("operationId", operationId))
        .first();
      if (existing) await ctx.db.replace(existing._id, { ...existing, ...values });
      else await ctx.db.insert("flowJustifications", { clerkId, operationId, ...values, createdAt: Date.now() });
    };

    await upsertOne(args.operationId, fields);
    // Un transfert interne se pointe des deux côtés à la fois.
    if (info.needsLink && args.linkedOperationId) {
      await upsertOne(args.linkedOperationId, {
        ...fields,
        direction: args.direction === "in" ? "out" : "in",
        linkedOperationId: args.operationId,
      });
    }
  },
});

/** Retire le pointage d'une opération (et de sa jumelle, pour un transfert interne). */
export const remove = mutation({
  args: { operationId: v.string() },
  handler: async (ctx, { operationId }) => {
    const clerkId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("flowJustifications")
      .withIndex("by_user_operation", (q) => q.eq("clerkId", clerkId).eq("operationId", operationId))
      .first();
    if (!existing) return;
    await ctx.db.delete(existing._id);
    if (existing.category === "internal" && existing.linkedOperationId) {
      const twin = await ctx.db
        .query("flowJustifications")
        .withIndex("by_user_operation", (q) =>
          q.eq("clerkId", clerkId).eq("operationId", existing.linkedOperationId!)
        )
        .first();
      if (twin && twin.linkedOperationId === operationId) await ctx.db.delete(twin._id);
    }
  },
});
