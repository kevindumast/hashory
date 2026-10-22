import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { optionalUserId, requireUserId } from "./auth";
import { buildLedger, type LedgerInput } from "../lib/ledger";
import { buildPortfolioHistory } from "../lib/portfolio-history";
import {
  assetsToPrice,
  createPriceBook,
  impliedPrices,
  inEuros,
  startOfUtcDay,
  type PriceSeries,
} from "../lib/valuation";

/**
 * Version du moteur de calcul. L'incrémenter force la reconstruction de
 * toutes les séries au prochain affichage.
 *
 * 2 — grand livre unique, rendement pondéré par le temps, une série par compte.
 * 3 — frais de retrait Finary ignorés (rangés sans leur devise).
 * 4 — écriture sans doublon quand deux recalculs se chevauchent.
 * 5 — soldes par compte pour le dashboard.
 * 6 — positions par compte, en dollars et en euros historiques.
 */
const ENGINE_VERSION = 6;

/** Périmètre du portefeuille entier. */
export const ALL_SCOPE = "all";

// ─── Lecture ──────────────────────────────────────────────────────────

/** Série quotidienne d'un périmètre : le portefeuille entier par défaut. */
export const listByUser = query({
  args: {
    scope: v.optional(v.string()),
    refreshToken: v.optional(v.number()),
  },
  handler: async (ctx, { scope }) => {
    const clerkId = await optionalUserId(ctx);
    if (!clerkId) return [];
    return await ctx.db
      .query("portfolioSnapshots")
      .withIndex("by_user_scope_day", (q) => q.eq("clerkId", clerkId).eq("scope", scope ?? ALL_SCOPE))
      .collect();
  },
});

export const getState = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await optionalUserId(ctx);
    if (!clerkId) return null;
    return await ctx.db
      .query("portfolioSnapshotState")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .unique();
  },
});

/**
 * Positions du portefeuille entier au dernier recalcul (prix de revient et
 * résultat réalisé), et soldes du grand livre compte par compte.
 */
export const listPositions = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await optionalUserId(ctx);
    if (!clerkId) return { positions: [], balances: [] };
    const rows = await ctx.db
      .query("portfolioPositions")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .collect();
    const shape = (row: (typeof rows)[number]) => ({
      asset: row.asset,
      quantity: row.quantity,
      costUsd: row.costUsd,
      realizedUsd: row.realizedUsd,
      costEur: row.costEur ?? null,
      realizedEur: row.realizedEur ?? null,
    });
    return {
      positions: rows.filter((row) => row.account === undefined).map(shape),
      balances: rows
        .filter((row) => row.account !== undefined)
        .map((row) => ({ account: row.account!, ...shape(row) })),
    };
  },
});

export const getStateInternal = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    return await ctx.db
      .query("portfolioSnapshotState")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .unique();
  },
});

// ─── Écriture ─────────────────────────────────────────────────────────

/**
 * Supprime ce qui n'appartient plus à la série d'un périmètre : les jours
 * hors de sa nouvelle plage. Par lots, pour rester sous les limites.
 * `scope` absent vise les lignes de l'ancien moteur, sans périmètre.
 */
export const pruneSnapshots = internalMutation({
  args: {
    clerkId: v.string(),
    scope: v.optional(v.string()),
    fromDay: v.number(),
    toDay: v.number(),
  },
  handler: async (ctx, { clerkId, scope, fromDay, toDay }) => {
    const before = await ctx.db
      .query("portfolioSnapshots")
      .withIndex("by_user_scope_day", (q) => q.eq("clerkId", clerkId).eq("scope", scope).lt("dayUtc", fromDay))
      .take(1000);
    const after = await ctx.db
      .query("portfolioSnapshots")
      .withIndex("by_user_scope_day", (q) => q.eq("clerkId", clerkId).eq("scope", scope).gt("dayUtc", toDay))
      .take(1000);
    for (const doc of [...before, ...after]) await ctx.db.delete(doc._id);
    return { hasMore: before.length === 1000 || after.length === 1000 };
  },
});

const positionFields = {
  asset: v.string(),
  quantity: v.number(),
  costUsd: v.number(),
  realizedUsd: v.number(),
  costEur: v.number(),
  realizedEur: v.number(),
};
const positionRow = v.object(positionFields);

type PositionRow = { asset: string; quantity: number; costUsd: number; realizedUsd: number; costEur: number; realizedEur: number };

/** Réunit les positions en dollars et en euros d'un même périmètre. */
function mergePositions(
  usd: { asset: string; quantity: number; costUsd: number; realizedUsd: number }[],
  eur: { asset: string; costUsd: number; realizedUsd: number }[]
): PositionRow[] {
  const inEur = new Map(eur.map((position) => [position.asset, position]));
  return usd
    .filter((position) => position.quantity > 1e-12 || Math.abs(position.realizedUsd) > 1e-9)
    .map((position) => ({
      ...position,
      // Le moteur nomme « Usd » la devise de son carnet : ici, des euros.
      costEur: inEur.get(position.asset)?.costUsd ?? 0,
      realizedEur: inEur.get(position.asset)?.realizedUsd ?? 0,
    }));
}

export const replacePositions = internalMutation({
  args: {
    clerkId: v.string(),
    positions: v.array(positionRow),
    accounts: v.array(v.object({ account: v.string(), ...positionFields })),
  },
  handler: async (ctx, { clerkId, positions, accounts }) => {
    const existing = await ctx.db
      .query("portfolioPositions")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);
    const now = Date.now();
    for (const position of positions) {
      await ctx.db.insert("portfolioPositions", { clerkId, ...position, computedAt: now });
    }
    for (const position of accounts) {
      await ctx.db.insert("portfolioPositions", { clerkId, ...position, computedAt: now });
    }
  },
});

export const insertSnapshots = internalMutation({
  args: {
    clerkId: v.string(),
    scope: v.string(),
    snapshots: v.array(
      v.object({
        dayUtc: v.number(),
        valueUsd: v.number(),
        netInvestedUsd: v.number(),
        flowUsd: v.number(),
        profitPercent: v.number(),
        btcPercent: v.number(),
        costBasisUsd: v.number(),
        realizedPnlUsd: v.number(),
      })
    ),
  },
  handler: async (ctx, { clerkId, scope, snapshots }) => {
    const now = Date.now();
    for (const snapshot of snapshots) {
      // Écriture différentielle : un jour déjà écrit n'est réécrit que s'il
      // a changé. Le recalcul quotidien ne touche ainsi que les derniers
      // jours, au lieu de réécrire — et de renvoyer à tous les écrans —
      // l'historique entier. Deux recalculs simultanés ne dupliquent rien.
      const existing = await ctx.db
        .query("portfolioSnapshots")
        .withIndex("by_user_scope_day", (q) =>
          q.eq("clerkId", clerkId).eq("scope", scope).eq("dayUtc", snapshot.dayUtc)
        )
        .first();
      if (!existing) {
        await ctx.db.insert("portfolioSnapshots", { clerkId, scope, ...snapshot, computedAt: now });
        continue;
      }
      const changed = (Object.keys(snapshot) as (keyof typeof snapshot)[]).some(
        (field) => Math.abs((existing[field] ?? Number.NaN) - snapshot[field]) > 1e-9 || existing[field] === undefined
      );
      if (changed) await ctx.db.patch(existing._id, { ...snapshot, computedAt: now });
    }
  },
});

export const upsertState = internalMutation({
  args: {
    clerkId: v.string(),
    earliestEventDay: v.optional(v.number()),
    lastComputedDay: v.optional(v.number()),
    lastTradeAt: v.optional(v.number()),
    fingerprint: v.optional(v.string()),
    engineVersion: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("portfolioSnapshotState")
      .withIndex("by_user", (q) => q.eq("clerkId", args.clerkId))
      .unique();
    const payload = { ...args, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("portfolioSnapshotState", payload);
  },
});

// ─── Recalcul ─────────────────────────────────────────────────────────

/**
 * Empreinte des données : si elle n'a pas bougé, les séries sont à jour.
 * Toutes les tables comptent — un dépôt ou un retrait change la
 * performance autant qu'un trade.
 */
function fingerprintOf(input: LedgerInput): string {
  const timestamps = [
    ...input.trades.map((row) => row.executedAt),
    ...(input.converts ?? []).map((row) => row.executedAt),
    ...(input.orders ?? []).map((row) => row.executedAt),
    ...input.deposits.map((row) => row.timestamp),
    ...input.withdrawals.map((row) => row.timestamp),
    ...(input.fiat ?? []).map((row) => row.timestamp),
  ];
  const latest = timestamps.reduce((max, ts) => Math.max(max, ts), 0);
  const counts = [
    input.trades.length,
    input.converts?.length ?? 0,
    input.orders?.length ?? 0,
    input.deposits.length,
    input.withdrawals.length,
    input.fiat?.length ?? 0,
  ];
  return `${counts.join("-")}@${latest}`;
}

export const recomputeForUser = action({
  args: {
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, { force }): Promise<{ status: string; days?: number; scopes?: number }> => {
    const clerkId = await requireUserId(ctx);
    const state: Doc<"portfolioSnapshotState"> | null = await ctx.runQuery(
      internal.portfolioSnapshots.getStateInternal,
      { clerkId }
    );
    const todayUtc = startOfUtcDay(Date.now());

    const { input, accounts }: { input: LedgerInput; accounts: string[] } = await ctx.runQuery(
      internal.ledgerData.loadLedgerInputInternal,
      { clerkId }
    );
    const fingerprint = fingerprintOf(input);

    const isUpToDate =
      state?.engineVersion === ENGINE_VERSION &&
      state.fingerprint === fingerprint &&
      state.lastComputedDay === todayUtc;
    if (!force && isUpToDate) return { status: "up-to-date" };

    const operations = buildLedger(input);
    if (operations.length === 0) return { status: "no-events" };
    const earliest = operations[0].timestamp;
    const fromDay = startOfUtcDay(earliest);

    // Cours manquants : la collecte est idempotente, seuls les jours absents
    // sont demandés aux sources.
    const symbols = Array.from(new Set([...assetsToPrice(operations), "BTC"]));
    for (const symbol of symbols) {
      await ctx.runAction(internal.priceHistory.backfillSymbol, { symbol, fromTs: earliest });
    }

    const prices: PriceSeries = {};
    for (const symbol of symbols) {
      prices[symbol] = await ctx.runQuery(internal.ledgerData.loadPriceSeriesInternal, {
        symbol,
        fromDay,
        toDay: todayUtc,
      });
    }
    // Le change sert dès le premier jour : on prend un peu d'avance pour
    // couvrir un week-end en début d'historique.
    const fx = await ctx.runQuery(internal.ledgerData.loadFxInternal, {
      fromDay: fromDay - 10 * 86_400_000,
      toDay: todayUtc,
    });
    const book = createPriceBook({ prices, fx, implied: impliedPrices(operations, fx) });
    const eurBook = inEuros(book);

    const btcStart = book.usd("BTC", fromDay);

    const prune = async (scope: string | undefined, from: number, to: number) => {
      while (true) {
        const result: { hasMore: boolean } = await ctx.runMutation(internal.portfolioSnapshots.pruneSnapshots, {
          clerkId,
          scope,
          fromDay: from,
          toDay: to,
        });
        if (!result.hasMore) break;
      }
    };
    // Lignes de l'ancien moteur, sans périmètre : toutes obsolètes.
    await prune(undefined, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);

    const scopes: (string | undefined)[] = [undefined, ...accounts];
    let days = 0;
    let globalPositions: PositionRow[] = [];
    const accountPositions: (PositionRow & { account: string })[] = [];
    for (const account of scopes) {
      const history = buildPortfolioHistory(operations, book, { account, todayUtc });
      if (history.points.length === 0) continue;
      // La même comptabilité en euros, pour les positions.
      const historyEur = buildPortfolioHistory(operations, eurBook, { account, todayUtc });
      const positions = mergePositions(history.positions, historyEur.positions);
      if (account === undefined) globalPositions = positions;
      else accountPositions.push(...positions.map((position) => ({ account, ...position })));
      const rows = history.points.map((point) => {
        const btc = book.usd("BTC", point.dayUtc);
        return {
          dayUtc: point.dayUtc,
          valueUsd: point.valueUsd,
          netInvestedUsd: point.netContributionsUsd,
          flowUsd: point.flowUsd,
          profitPercent: (point.twrIndex - 1) * 100,
          btcPercent: btc !== null && btcStart ? (btc / btcStart - 1) * 100 : 0,
          costBasisUsd: point.costBasisUsd,
          realizedPnlUsd: point.realizedPnlUsd,
        };
      });

      const CHUNK = 400;
      for (let i = 0; i < rows.length; i += CHUNK) {
        await ctx.runMutation(internal.portfolioSnapshots.insertSnapshots, {
          clerkId,
          scope: account ?? ALL_SCOPE,
          snapshots: rows.slice(i, i + CHUNK),
        });
      }
      await prune(account ?? ALL_SCOPE, rows[0].dayUtc, rows[rows.length - 1].dayUtc);
      days = Math.max(days, rows.length);
    }

    await ctx.runMutation(internal.portfolioSnapshots.replacePositions, {
      clerkId,
      positions: globalPositions,
      accounts: accountPositions,
    });

    await ctx.runMutation(internal.portfolioSnapshots.upsertState, {
      clerkId,
      earliestEventDay: fromDay,
      lastComputedDay: todayUtc,
      lastTradeAt: operations[operations.length - 1].timestamp,
      fingerprint,
      engineVersion: ENGINE_VERSION,
    });

    return { status: "rebuilt", days, scopes: scopes.length };
  },
});
