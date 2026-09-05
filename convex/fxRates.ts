import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";

const DAY_MS = 86_400_000;

function startOfUtcDay(timestamp: number): number {
  return Math.floor(timestamp / DAY_MS) * DAY_MS;
}

function toIsoDay(dayUtc: number): string {
  return new Date(dayUtc).toISOString().slice(0, 10);
}

/** Série de taux sur une plage, triée par date croissante. */
export const getRange = query({
  args: { fromDay: v.number(), toDay: v.number() },
  handler: async (ctx, { fromDay, toDay }) => {
    const rows = await ctx.db
      .query("fxRateHistory")
      .withIndex("by_day", (q) => q.gte("dayUtc", fromDay).lte("dayUtc", toDay))
      .collect();

    return rows
      .map((row) => ({ dayUtc: row.dayUtc, eurPerUsd: row.eurPerUsd }))
      .sort((a, b) => a.dayUtc - b.dayUtc);
  },
});

export const getLatestDay = internalQuery({
  args: {},
  handler: async (ctx) => {
    const latest = await ctx.db.query("fxRateHistory").withIndex("by_day").order("desc").first();
    return latest?.dayUtc ?? null;
  },
});

export const insertBatch = internalMutation({
  args: {
    points: v.array(v.object({ dayUtc: v.number(), eurPerUsd: v.number() })),
    source: v.union(v.literal("ecb"), v.literal("manual")),
  },
  handler: async (ctx, { points, source }) => {
    const now = Date.now();
    let inserted = 0;

    for (const point of points) {
      if (!Number.isFinite(point.eurPerUsd) || point.eurPerUsd <= 0) continue;

      const existing = await ctx.db
        .query("fxRateHistory")
        .withIndex("by_day", (q) => q.eq("dayUtc", point.dayUtc))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { eurPerUsd: point.eurPerUsd, source, updatedAt: now });
      } else {
        await ctx.db.insert("fxRateHistory", { ...point, source, updatedAt: now });
        inserted += 1;
      }
    }

    return { inserted };
  },
});

/**
 * Complète l'historique de change depuis la dernière date connue.
 *
 * La source est l'API Frankfurter, qui rediffuse les taux de référence
 * quotidiens de la Banque centrale européenne — sans clé, et faisant
 * autorité pour une déclaration française.
 *
 * La BCE ne publie ni les week-ends ni les jours fériés : les trous sont
 * normaux et le résolveur de `lib/fx.ts` retient le dernier taux publié.
 */
export const backfillEurUsd = action({
  args: { fromTs: v.optional(v.number()) },
  handler: async (ctx, { fromTs }): Promise<{ inserted: number; from: string; to: string }> => {
    const latestDay: number | null = await ctx.runQuery(internal.fxRates.getLatestDay, {});
    const defaultStart = Date.now() - 5 * 365 * DAY_MS;

    const startDay =
      latestDay !== null ? latestDay + DAY_MS : startOfUtcDay(fromTs ?? defaultStart);
    const endDay = startOfUtcDay(Date.now());

    if (startDay > endDay) {
      return { inserted: 0, from: toIsoDay(endDay), to: toIsoDay(endDay) };
    }

    const from = toIsoDay(startDay);
    const to = toIsoDay(endDay);
    const url = `https://api.frankfurter.app/${from}..${to}?from=USD&to=EUR`;

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`Frankfurter a répondu ${response.status} pour ${from}..${to}`);
    }

    const payload = (await response.json()) as { rates?: Record<string, { EUR?: number }> };
    const points: { dayUtc: number; eurPerUsd: number }[] = [];

    for (const [isoDay, value] of Object.entries(payload.rates ?? {})) {
      const rate = value?.EUR;
      if (typeof rate !== "number" || rate <= 0) continue;
      points.push({ dayUtc: Date.parse(`${isoDay}T00:00:00Z`), eurPerUsd: rate });
    }

    if (points.length === 0) {
      return { inserted: 0, from, to };
    }

    const { inserted } = await ctx.runMutation(internal.fxRates.insertBatch, {
      points,
      source: "ecb",
    });

    return { inserted, from, to };
  },
});
