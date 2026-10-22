import { query } from "./_generated/server";
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

/**
 * Déclaration des plus-values sur actifs numériques — article 150 VH bis.
 * La logique vit dans `lib/tax-chain.ts`, pure et testée ; ce fichier réunit
 * les données : le grand livre de tous les comptes, le change et les cours.
 */
export const computeTaxReport = query({
  args: {},
  handler: async (ctx): Promise<TaxReportResult> => {
    const clerkId = await optionalUserId(ctx);
    if (!clerkId) return emptyReport();

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
    const implied = impliedPrices(operations, fx);

    // Passe à blanc : quels cours la chaîne va-t-elle demander ?
    const wanted = new Map<string, Set<number>>();
    computeCessionChain(operations, recordingBook(createPriceBook({ prices: {}, fx, implied }), wanted));

    // Un cours par couple demandé : le dernier connu à cette date.
    const prices: PriceSeries = {};
    for (const [asset, days] of wanted) {
      const points: { dayUtc: number; closeUsd: number }[] = [];
      for (const day of days) {
        const row = await ctx.db
          .query("tokenPriceHistory")
          .withIndex("by_symbol_day", (q) =>
            q.eq("symbol", asset).gte("dayUtc", day - PRICE_LOOKBACK_DAYS * DAY_MS).lte("dayUtc", day)
          )
          .order("desc")
          .first();
        if (row) points.push({ dayUtc: day, closeUsd: row.closeUsd });
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
  },
});
