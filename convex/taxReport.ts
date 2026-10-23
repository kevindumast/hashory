import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { optionalUserId } from "./auth";
import { loadLedgerInput } from "./ledgerData";
import { ANNUAL_EXEMPTION_EUR, PFU_RATE } from "../lib/tax";
import { computeCessionChain, summarizeByYear, type Cession } from "../lib/tax-chain";
import { buildLedger, isFiat, type Operation } from "../lib/ledger";
import {
  createPriceBook,
  impliedPrices,
  isCashLike,
  startOfUtcDay,
  type PriceBook,
  type PriceSeries,
} from "../lib/valuation";

export type TaxableEvent = {
  date: number;
  asset: string;
  quantity: number;
  source: "trade" | "fiat" | "convert";
  /** Montants en euros, devise de la déclaration (formulaire 2086). */
  proceedsEur: number | null;
  feesEur: number;
  costBasisEur: number | null;
  gainLossEur: number | null;
  portfolioValueEur: number;
  /** Contre-valeurs en dollars, au change du jour de la cession. */
  proceedsUsd: number;
  costBasisUsd: number;
  gainLossUsd: number;
  /** Euros par dollar au jour de la cession. */
  fxRate: number | null;
};

export type TaxYearReport = {
  year: number;
  totalProceedsUsd: number;
  totalCostBasisUsd: number;
  netGainLossUsd: number;
  estimatedTaxUsd: number;
  isBelowThreshold: boolean;
  events: TaxableEvent[];
  totalProceedsEur: number | null;
  /** Fractions du prix total d'acquisition imputées aux cessions de l'année. */
  totalCostBasisEur: number;
  /** Frais de cession de l'année. */
  totalFeesEur: number;
  netGainLossEur: number | null;
  estimatedTaxEur: number | null;
};

export type TaxReportResult = {
  reports: TaxYearReport[];
  availableYears: number[];
  tradeCountByYear: Record<number, number>;
  hasOnlyStablecoinTrades: boolean;
  /** Prix total d'acquisition restant, en dollars au change du jour. */
  currentAcquisitionCost: number;
  /** Prix total d'acquisition restant, en euros. */
  currentAcquisitionCostEur: number;
  /** Une valeur globale a dû être complétée au coût, faute de cours. */
  hasIncompleteValuation: boolean;
  hasMissingFxRates: boolean;
  /** Jetons détenus sans coût d'acquisition connu, comptés à coût nul. */
  unknownCostInflows: { count: number; valueEur: number };
  /** Jetons partis vers un compte non suivi : cessions possibles non vues. */
  untrackedOutflows: { count: number; valueEur: number };
};

const DAY_MS = 86_400_000;
/** Au-delà, un cours est trop ancien pour valoriser une ligne. */
const PRICE_LOOKBACK_DAYS = 30;

/**
 * Prépare un carnet de cours qui note les couples (actif, jour) demandés
 * au lieu d'y répondre. Faire tourner la chaîne une fois avec lui donne la
 * liste exacte des cours à lire, sans charger des historiques entiers.
 */
function recordingBook(fxBook: PriceBook, wanted: Map<string, Set<number>>): PriceBook {
  const note = (asset: string, timestamp: number) => {
    if (isCashLike(asset)) return;
    const days = wanted.get(asset) ?? new Set<number>();
    days.add(startOfUtcDay(timestamp));
    wanted.set(asset, days);
  };
  return {
    eurPerUsd: fxBook.eurPerUsd,
    usd: (asset, timestamp) => {
      note(asset, timestamp);
      return fxBook.usd(asset, timestamp);
    },
    eur: (asset, timestamp) => {
      note(asset, timestamp);
      return fxBook.eur(asset, timestamp);
    },
  };
}

function emptyReport(): TaxReportResult {
  return {
    reports: [],
    availableYears: [],
    tradeCountByYear: {},
    hasOnlyStablecoinTrades: false,
    currentAcquisitionCost: 0,
    currentAcquisitionCostEur: 0,
    hasIncompleteValuation: false,
    hasMissingFxRates: true,
    unknownCostInflows: { count: 0, valueEur: 0 },
    untrackedOutflows: { count: 0, valueEur: 0 },
  };
}

/** Cours de clôture retenu pour un actif un jour donné, ou null. */
export type PriceFinder = (asset: string, dayUtc: number) => Promise<number | null> | number | null;

/**
 * Cherche dans une série déjà chargée, avec la même règle que la lecture en
 * base : le dernier cours connu à cette date, sur trente jours au plus.
 */
export function findInSeries(series: PriceSeries, asset: string, dayUtc: number): number | null {
  const points = series[asset];
  if (!points) return null;
  const from = dayUtc - PRICE_LOOKBACK_DAYS * DAY_MS;
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i];
    if (point.dayUtc > dayUtc) continue;
    return point.dayUtc >= from ? point.closeUsd : null;
  }
  return null;
}

/**
 * Déclaration des plus-values sur actifs numériques — article 150 VH bis.
 * La logique vit dans `lib/tax-chain.ts`, pure et testée ; cette fonction
 * réunit le grand livre, le change et les cours demandés par la chaîne.
 * `findPrice` lit les cours en base (requête) ou dans les séries déjà
 * chargées (recalcul) : la règle est la même.
 */
export async function buildTaxReport(
  operations: Operation[],
  fx: { dayUtc: number; eurPerUsd: number }[],
  findPrice: PriceFinder
): Promise<TaxReportResult> {
  if (operations.length === 0) return emptyReport();
  const implied = impliedPrices(operations, fx);

  // Passe à blanc : quels cours la chaîne va-t-elle demander ?
  const wanted = new Map<string, Set<number>>();
  computeCessionChain(operations, recordingBook(createPriceBook({ prices: {}, fx, implied }), wanted));

  // Un cours par couple demandé : le dernier connu à cette date.
  const prices: PriceSeries = {};
  for (const [asset, days] of wanted) {
    const points: { dayUtc: number; closeUsd: number }[] = [];
    for (const day of days) {
      const closeUsd = await findPrice(asset, day);
      if (closeUsd !== null) points.push({ dayUtc: day, closeUsd });
    }
    prices[asset] = points;
  }

  const book = createPriceBook({ prices, fx, implied });
  const chain = computeCessionChain(operations, book);
  const years = summarizeByYear(chain.cessions, { threshold: ANNUAL_EXEMPTION_EUR, rate: PFU_RATE });

  const toUsd = (eur: number, rate: number | null) => (rate ? eur / rate : eur);
  const toEvent = (cession: Cession): TaxableEvent => ({
    date: cession.date,
    asset: cession.asset,
    quantity: cession.quantity,
    source: cession.source,
    proceedsEur: cession.proceedsEur,
    feesEur: cession.feesEur,
    costBasisEur: cession.costBasisEur,
    gainLossEur: cession.gainLossEur,
    portfolioValueEur: cession.portfolioValueEur,
    proceedsUsd: toUsd(cession.proceedsEur, cession.eurPerUsd),
    costBasisUsd: toUsd(cession.costBasisEur, cession.eurPerUsd),
    gainLossUsd: toUsd(cession.gainLossEur, cession.eurPerUsd),
    fxRate: cession.eurPerUsd,
  });

  const reports: TaxYearReport[] = years.map((year) => {
    const events = year.cessions.map(toEvent);
    const sum = (pick: (event: TaxableEvent) => number) => events.reduce((total, event) => total + pick(event), 0);
    const netGainLossUsd = sum((event) => event.gainLossUsd);
    return {
      year: year.year,
      totalProceedsUsd: sum((event) => event.proceedsUsd),
      totalCostBasisUsd: sum((event) => event.costBasisUsd),
      netGainLossUsd,
      estimatedTaxUsd: year.isBelowThreshold ? 0 : Math.max(0, netGainLossUsd * PFU_RATE),
      isBelowThreshold: year.isBelowThreshold,
      events,
      totalProceedsEur: year.totalProceedsEur,
      totalCostBasisEur: year.totalCostBasisEur,
      totalFeesEur: year.cessions.reduce((total, cession) => total + cession.feesEur, 0),
      netGainLossEur: year.netGainLossEur,
      estimatedTaxEur: year.estimatedTaxEur,
    };
  });

  // Activité par année, cessions ou non : sert à dire « aucune cession
  // imposable » plutôt que « aucune donnée ».
  const tradeCountByYear: Record<number, number> = {};
  for (const operation of operations) {
    if (operation.kind !== "exchange") continue;
    const year = new Date(operation.timestamp).getUTCFullYear();
    tradeCountByYear[year] = (tradeCountByYear[year] ?? 0) + 1;
  }
  const availableYears = Object.keys(tradeCountByYear).map(Number).sort((a, b) => b - a);

  const todayRate = book.eurPerUsd(Date.now());
  const total = (list: { valueEur: number | null }[]) => list.reduce((sum, item) => sum + (item.valueEur ?? 0), 0);

  return {
    reports,
    availableYears,
    tradeCountByYear,
    hasOnlyStablecoinTrades: availableYears.length > 0 && reports.length === 0,
    currentAcquisitionCost: toUsd(chain.acquisitionCostEur, todayRate),
    currentAcquisitionCostEur: chain.acquisitionCostEur,
    hasIncompleteValuation: chain.hasIncompleteValuation,
    hasMissingFxRates: fx.length === 0,
    unknownCostInflows: {
      count: chain.unknownCostInflows.length,
      valueEur: total(chain.unknownCostInflows),
    },
    untrackedOutflows: {
      // Le fiat retiré vers une banque n'est pas une sortie d'actif numérique.
      count: chain.untrackedOutflows.filter((outflow) => !isFiat(outflow.asset)).length,
      valueEur: total(chain.untrackedOutflows),
    },
  };
}

/**
 * Rapport fiscal de l'utilisateur.
 *
 * Le recalcul du portefeuille l'enregistre : la requête lit alors un seul
 * document. La calculer en direct relisait tout l'historique, le change et
 * des centaines de cours, à chaque écriture dans l'une de ces tables, pour
 * chaque écran abonné — c'était la première source de lecture en base.
 * Le calcul en direct ne sert plus qu'avant le premier recalcul.
 */
export const computeTaxReport = query({
  args: {},
  handler: async (ctx): Promise<TaxReportResult> => {
    const clerkId = await optionalUserId(ctx);
    if (!clerkId) return emptyReport();

    const stored = await ctx.db
      .query("taxReports")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .first();
    if (stored) return JSON.parse(stored.report) as TaxReportResult;

    const { input } = await loadLedgerInput(ctx, clerkId);
    const operations: Operation[] = buildLedger(input);
    if (operations.length === 0) return emptyReport();

    const fromDay = startOfUtcDay(operations[0].timestamp) - 10 * DAY_MS;
    const toDay = startOfUtcDay(Date.now());
    const fxRows = await ctx.db
      .query("fxRateHistory")
      .withIndex("by_day", (q) => q.gte("dayUtc", fromDay).lte("dayUtc", toDay))
      .collect();
    const fx = fxRows.map((row) => ({ dayUtc: row.dayUtc, eurPerUsd: row.eurPerUsd }));

    return buildTaxReport(operations, fx, async (asset, day) => {
      const row = await ctx.db
        .query("tokenPriceHistory")
        .withIndex("by_symbol_day", (q) =>
          q.eq("symbol", asset).gte("dayUtc", day - PRICE_LOOKBACK_DAYS * DAY_MS).lte("dayUtc", day)
        )
        .order("desc")
        .first();
      return row ? row.closeUsd : null;
    });
  },
});

/** Taille au-delà de laquelle on ne stocke pas (limite d'un document : 1 Mo). */
const MAX_STORED_REPORT_BYTES = 900_000;

/** Enregistre le rapport calculé par le recalcul du portefeuille. */
export const storeTaxReport = internalMutation({
  args: { clerkId: v.string(), report: v.string() },
  handler: async (ctx, { clerkId, report }) => {
    const existing = await ctx.db
      .query("taxReports")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .first();
    // Trop gros pour un document : on s'en remet au calcul en direct.
    if (report.length > MAX_STORED_REPORT_BYTES) {
      if (existing) await ctx.db.delete(existing._id);
      return;
    }
    if (existing) {
      // Inchangé : pas d'écriture, donc pas de nouvel envoi aux écrans abonnés.
      if (existing.report !== report) await ctx.db.patch(existing._id, { report, computedAt: Date.now() });
      return;
    }
    await ctx.db.insert("taxReports", { clerkId, report, computedAt: Date.now() });
  },
});
