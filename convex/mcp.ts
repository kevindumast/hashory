import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { optionalUserId, requireUserId } from "./auth";
import { loadLedgerInput } from "./ledgerData";
import { loadTaxReport } from "./taxReport";
import { ALL_SCOPE } from "./portfolioSnapshots";
import { buildLedger } from "../lib/ledger";
import { createPriceBook, isCashLike, startOfUtcDay, type PriceSeries } from "../lib/valuation";
import {
  ACTIVITY_LIMIT,
  AUDIT_RETENTION_DAYS,
  nextRateWindow,
  samplePoints,
  secretsMatch,
  selectTransactions,
} from "../lib/mcp";

/**
 * Lecture des données d'un utilisateur pour le serveur MCP (`app/api/mcp`).
 *
 * Le serveur MCP authentifie l'utilisateur par OAuth auprès de Clerk : il
 * ne détient pas de jeton Convex à son nom. Il appelle donc ces requêtes
 * avec l'identifiant Clerk vérifié et un secret partagé, `MCP_SERVER_SECRET`,
 * défini à la fois dans Convex et côté Next.js. Sans ce secret, ou s'il
 * n'est pas configuré, chaque requête refuse de répondre.
 *
 * Les données sont en lecture seule. Les seules écritures sont celles du
 * contrôle d'accès : compteur de débit et journal des appels.
 */

const serverArgs = { secret: v.string(), clerkId: v.string() };

function assertServer(secret: string) {
  if (!secretsMatch(process.env.MCP_SERVER_SECRET, secret)) {
    throw new Error("Appel MCP refusé.");
  }
}

const DAY_MS = 86_400_000;
/** Au-delà, un cours est trop ancien pour valoriser une ligne. */
const PRICE_LOOKBACK_DAYS = 30;

// ─── Contrôle d'accès ─────────────────────────────────────────────────

/**
 * Appelée une fois par requête MCP, avant tout outil : refuse si
 * l'utilisateur a coupé l'accès, compte la requête dans la minute en cours.
 */
export const authorize = mutation({
  args: serverArgs,
  handler: async (ctx, { secret, clerkId }): Promise<{ status: "ok"; requestsThisMinute: number } | { status: "disabled" }> => {
    assertServer(secret);
    const now = Date.now();
    const access = await ctx.db
      .query("mcpAccess")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (access?.disabled) return { status: "disabled" };

    const window = nextRateWindow(access, now);
    if (access) {
      await ctx.db.patch(access._id, { ...window, lastUsedAt: now });
    } else {
      await ctx.db.insert("mcpAccess", { clerkId, disabled: false, ...window, lastUsedAt: now, updatedAt: now });
    }
    return { status: "ok", requestsThisMinute: window.rateCount };
  },
});

/** Journalise un appel d'outil, et efface au passage les entrées périmées. */
export const audit = mutation({
  args: {
    ...serverArgs,
    tool: v.string(),
    rowCount: v.number(),
    ip: v.optional(v.string()),
    clientId: v.optional(v.string()),
  },
  handler: async (ctx, { secret, clerkId, ...entry }) => {
    assertServer(secret);
    const now = Date.now();
    await ctx.db.insert("mcpAuditLog", { clerkId, ...entry, createdAt: now });
    const expired = await ctx.db
      .query("mcpAuditLog")
      .withIndex("by_user_created", (q) => q.eq("clerkId", clerkId).lt("createdAt", now - AUDIT_RETENTION_DAYS * DAY_MS))
      .take(20);
    for (const row of expired) await ctx.db.delete(row._id);
  },
});

/** Pour les réglages : état de l'accès et derniers appels de Claude. */
export const myAccess = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await optionalUserId(ctx);
    if (!clerkId) return null;
    const access = await ctx.db
      .query("mcpAccess")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .unique();
    const activity = await ctx.db
      .query("mcpAuditLog")
      .withIndex("by_user_created", (q) => q.eq("clerkId", clerkId))
      .order("desc")
      .take(ACTIVITY_LIMIT);
    return {
      enabled: !access?.disabled,
      lastUsedAt: access?.lastUsedAt ?? null,
      activity: activity.map((row) => ({
        id: row._id,
        tool: row.tool,
        rowCount: row.rowCount,
        ip: row.ip ?? null,
        createdAt: row.createdAt,
      })),
    };
  },
});

/** Ouvre ou coupe l'accès de Claude ; une coupure vaut dès la requête suivante. */
export const setEnabled = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }) => {
    const clerkId = await requireUserId(ctx);
    const now = Date.now();
    const access = await ctx.db
      .query("mcpAccess")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (access) {
      await ctx.db.patch(access._id, { disabled: !enabled, updatedAt: now });
    } else {
      await ctx.db.insert("mcpAccess", { clerkId, disabled: !enabled, rateWindowStart: 0, rateCount: 0, updatedAt: now });
    }
  },
});

// ─── Lecture ──────────────────────────────────────────────────────────

async function accountNames(ctx: QueryCtx, clerkId: string): Promise<Record<string, string>> {
  const integrations = await ctx.db
    .query("integrations")
    .withIndex("by_user", (q) => q.eq("clerkUserId", clerkId))
    .collect();
  return Object.fromEntries(
    integrations.map((integration) => [String(integration._id), integration.displayName ?? integration.provider])
  );
}

/** Comptes reliés : plateformes, wallets et imports. */
export const accounts = query({
  args: serverArgs,
  handler: async (ctx, { secret, clerkId }) => {
    assertServer(secret);
    const integrations = await ctx.db
      .query("integrations")
      .withIndex("by_user", (q) => q.eq("clerkUserId", clerkId))
      .collect();
    return integrations.map((integration) => ({
      id: String(integration._id),
      name: integration.displayName ?? integration.provider,
      provider: integration.provider,
      syncStatus: integration.syncStatus ?? "idle",
      syncEnabled: integration.syncEnabled ?? true,
      lastSyncedAt: integration.lastSyncedAt ? new Date(integration.lastSyncedAt).toISOString() : null,
    }));
  },
});

/**
 * Positions au dernier recalcul, valorisées au dernier cours de clôture
 * connu. Le prix de revient et le réalisé viennent du même déroulé que la
 * courbe de performance du dashboard.
 */
export const portfolio = query({
  args: { ...serverArgs, byAccount: v.optional(v.boolean()) },
  handler: async (ctx, { secret, clerkId, byAccount }) => {
    assertServer(secret);
    const rows = await ctx.db
      .query("portfolioPositions")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .collect();
    const state = await ctx.db
      .query("portfolioSnapshotState")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .unique();

    const today = startOfUtcDay(Date.now());
    const prices: PriceSeries = {};
    for (const asset of new Set(rows.map((row) => row.asset))) {
      if (isCashLike(asset)) continue;
      const latest = await ctx.db
        .query("tokenPriceHistory")
        .withIndex("by_symbol_day", (q) =>
          q.eq("symbol", asset).gte("dayUtc", today - PRICE_LOOKBACK_DAYS * DAY_MS).lte("dayUtc", today)
        )
        .order("desc")
        .first();
      if (latest) prices[asset] = [{ dayUtc: latest.dayUtc, closeUsd: latest.closeUsd }];
    }
    const fxRow = await ctx.db.query("fxRateHistory").withIndex("by_day").order("desc").first();
    const fx = fxRow ? [{ dayUtc: fxRow.dayUtc, eurPerUsd: fxRow.eurPerUsd }] : [];
    const book = createPriceBook({ prices, fx });
    const names = byAccount ? await accountNames(ctx, clerkId) : {};

    const describe = (row: (typeof rows)[number]) => {
      const priceUsd = book.usd(row.asset, Date.now());
      const valueUsd = priceUsd === null ? null : row.quantity * priceUsd;
      const eurPerUsd = book.eurPerUsd(Date.now());
      return {
        asset: row.asset,
        quantity: row.quantity,
        priceUsd,
        priceDate: prices[row.asset] ? new Date(prices[row.asset][0].dayUtc).toISOString().slice(0, 10) : null,
        valueUsd,
        valueEur: valueUsd !== null && eurPerUsd !== null ? valueUsd * eurPerUsd : null,
        costUsd: row.costUsd,
        costEur: row.costEur ?? null,
        unrealizedUsd: valueUsd === null ? null : valueUsd - row.costUsd,
        realizedUsd: row.realizedUsd,
        realizedEur: row.realizedEur ?? null,
      };
    };
    const byValue = (a: { valueUsd: number | null }, b: { valueUsd: number | null }) =>
      (b.valueUsd ?? 0) - (a.valueUsd ?? 0);

    const positions = rows
      .filter((row) => row.account === undefined && Math.abs(row.quantity) > 1e-12)
      .map(describe)
      .sort(byValue);
    const totalValueUsd = positions.reduce((sum, position) => sum + (position.valueUsd ?? 0), 0);

    return {
      computedAt: rows[0] ? new Date(rows[0].computedAt).toISOString() : null,
      lastComputedDay: state?.lastComputedDay ? new Date(state.lastComputedDay).toISOString().slice(0, 10) : null,
      eurPerUsd: fxRow?.eurPerUsd ?? null,
      totalValueUsd,
      totalValueEur: fxRow ? totalValueUsd * fxRow.eurPerUsd : null,
      unpricedAssets: positions.filter((position) => position.priceUsd === null).map((position) => position.asset),
      positions,
      ...(byAccount
        ? {
            accounts: rows
              .filter((row) => row.account !== undefined && Math.abs(row.quantity) > 1e-12)
              .map((row) => ({ account: names[row.account!] ?? row.account!, ...describe(row) }))
              .sort(byValue),
          }
        : {}),
    };
  },
});

/** Série quotidienne de valeur et de performance, échantillonnée. */
export const performance = query({
  args: {
    ...serverArgs,
    /** Identifiant d'un compte ; le portefeuille entier par défaut. */
    account: v.optional(v.string()),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    maxPoints: v.optional(v.number()),
  },
  handler: async (ctx, { secret, clerkId, account, from, to, maxPoints }) => {
    assertServer(secret);
    const snapshots = await ctx.db
      .query("portfolioSnapshots")
      .withIndex("by_user_scope_day", (q) => {
        const scoped = q.eq("clerkId", clerkId).eq("scope", account ?? ALL_SCOPE);
        if (from !== undefined && to !== undefined) return scoped.gte("dayUtc", from).lte("dayUtc", to);
        if (from !== undefined) return scoped.gte("dayUtc", from);
        if (to !== undefined) return scoped.lte("dayUtc", to);
        return scoped;
      })
      .collect();

    const points = snapshots.map((snapshot) => ({
      day: new Date(snapshot.dayUtc).toISOString().slice(0, 10),
      valueUsd: snapshot.valueUsd,
      netInvestedUsd: snapshot.netInvestedUsd,
      twrPercent: snapshot.profitPercent,
      btcPercent: snapshot.btcPercent,
    }));
    const first = points[0];
    const last = points[points.length - 1];

    return {
      days: points.length,
      summary:
        first && last
          ? {
              from: first.day,
              to: last.day,
              startValueUsd: first.valueUsd,
              endValueUsd: last.valueUsd,
              netInvestedUsd: last.netInvestedUsd,
              /** Plus-value latente et réalisée : valeur moins apports nets. */
              gainUsd: last.valueUsd - last.netInvestedUsd,
              twrPercent: last.twrPercent,
              btcPercent: last.btcPercent,
            }
          : null,
      points: samplePoints(points, maxPoints),
    };
  },
});

/** Opérations du grand livre, filtrées et triées des plus récentes aux plus anciennes. */
export const transactions = query({
  args: {
    ...serverArgs,
    asset: v.optional(v.string()),
    type: v.optional(v.union(v.literal("exchange"), v.literal("deposit"), v.literal("withdrawal"))),
    account: v.optional(v.string()),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { secret, clerkId, ...filter }) => {
    assertServer(secret);
    const { input, accounts } = await loadLedgerInput(ctx, clerkId);
    const names = Object.fromEntries(accounts.map((account) => [String(account.id), account.displayName]));
    return selectTransactions(buildLedger(input), filter, names);
  },
});

/** Plus-values de cession (article 150 VH bis du CGI), une année ou le résumé de toutes. */
export const taxReport = query({
  args: { ...serverArgs, year: v.optional(v.number()), includeEvents: v.optional(v.boolean()) },
  handler: async (ctx, { secret, clerkId, year, includeEvents }) => {
    assertServer(secret);
    const report = await loadTaxReport(ctx, clerkId);
    const years = report.reports
      .filter((entry) => year === undefined || entry.year === year)
      .map(({ events, ...totals }) => ({
        ...totals,
        cessionCount: events.length,
        ...(includeEvents
          ? {
              events: events.map((event) => ({
                ...event,
                date: new Date(event.date).toISOString().slice(0, 10),
              })),
            }
          : {}),
      }));

    return {
      availableYears: report.availableYears,
      years,
      currentAcquisitionCostEur: report.currentAcquisitionCostEur,
      warnings: {
        hasIncompleteValuation: report.hasIncompleteValuation,
        hasMissingFxRates: report.hasMissingFxRates,
        unknownCostInflows: report.unknownCostInflows,
        untrackedOutflows: report.untrackedOutflows,
      },
    };
  },
});
