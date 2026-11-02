import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { optionalUserId } from "./auth";
import { parseAlternativeMe, type FearGreedPoint } from "../lib/fear-greed";

const DAY_MS = 86_400_000;

const pointValidator = v.object({ dayUtc: v.number(), value: v.number() });

/** Historique complet de l'indice, trié par date. Une dizaine de documents. */
export const history = query({
  args: {},
  handler: async (ctx): Promise<FearGreedPoint[]> => {
    const clerkId = await optionalUserId(ctx);
    if (!clerkId) return [];
    const years = await ctx.db.query("fearGreedYears").withIndex("by_year").collect();
    return years.flatMap((year) => year.points);
  },
});

/** Achats et ventes par jour de l'utilisateur, ou `null` avant le premier calcul. */
export const myTradeFlows = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await optionalUserId(ctx);
    if (!clerkId) return null;
    const row = await ctx.db
      .query("tradeFlows")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .first();
    return row?.days ?? null;
  },
});

export const getLatestDay = internalQuery({
  args: {},
  handler: async (ctx) => {
    const latest = await ctx.db.query("fearGreedYears").withIndex("by_year").order("desc").first();
    return latest?.points[latest.points.length - 1]?.dayUtc ?? null;
  },
});

/** Fusionne des points dans leurs documents annuels ; un jour connu est remplacé. */
export const upsertPoints = internalMutation({
  args: { points: v.array(pointValidator) },
  handler: async (ctx, { points }) => {
    const byYear = new Map<number, FearGreedPoint[]>();
    for (const point of points) {
      const year = new Date(point.dayUtc).getUTCFullYear();
      byYear.set(year, [...(byYear.get(year) ?? []), point]);
    }

    const now = Date.now();
    for (const [year, incoming] of byYear) {
      const existing = await ctx.db
        .query("fearGreedYears")
        .withIndex("by_year", (q) => q.eq("year", year))
        .unique();
      const merged = new Map((existing?.points ?? []).map((point) => [point.dayUtc, point.value]));
      for (const point of incoming) merged.set(point.dayUtc, point.value);
      const sorted = Array.from(merged, ([dayUtc, value]) => ({ dayUtc, value })).sort(
        (a, b) => a.dayUtc - b.dayUtc
      );

      if (!existing) {
        await ctx.db.insert("fearGreedYears", { year, points: sorted, updatedAt: now });
      } else if (JSON.stringify(existing.points) !== JSON.stringify(sorted)) {
        await ctx.db.patch(existing._id, { points: sorted, updatedAt: now });
      }
    }
  },
});

/**
 * Complète l'indice depuis le dernier jour connu. Au premier passage, la
 * table est vide et tout l'historique (depuis février 2018) arrive d'un coup.
 *
 * Source : alternative.me, sans clé. Se lance aussi à la main avec
 * `npx convex run fearGreed:refresh`.
 */
export const refresh = internalAction({
  args: {},
  handler: async (ctx): Promise<{ received: number }> => {
    const latestDay: number | null = await ctx.runQuery(internal.fearGreed.getLatestDay, {});
    // `limit=0` renvoie tout ; sinon, les jours manquants et une marge.
    const limit = latestDay === null ? 0 : Math.ceil((Date.now() - latestDay) / DAY_MS) + 2;

    const response = await fetch(`https://api.alternative.me/fng/?limit=${limit}&format=json`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`alternative.me a répondu ${response.status}`);
    }

    const points = parseAlternativeMe(await response.json());
    if (points.length > 0) {
      await ctx.runMutation(internal.fearGreed.upsertPoints, { points });
    }
    return { received: points.length };
  },
});

/** Enregistre les flux du dernier recalcul ; rien n'est écrit s'ils n'ont pas changé. */
export const storeTradeFlows = internalMutation({
  args: {
    clerkId: v.string(),
    days: v.array(v.object({ dayUtc: v.number(), boughtUsd: v.number(), soldUsd: v.number() })),
  },
  handler: async (ctx, { clerkId, days }) => {
    const existing = await ctx.db
      .query("tradeFlows")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .first();
    if (existing) {
      if (JSON.stringify(existing.days) !== JSON.stringify(days)) {
        await ctx.db.patch(existing._id, { days, computedAt: Date.now() });
      }
      return;
    }
    await ctx.db.insert("tradeFlows", { clerkId, days, computedAt: Date.now() });
  },
});
