"use client";

import { useMemo } from "react";
import {
  annualize,
  beta,
  calmarRatio,
  cashFlowsFromPoints,
  compound,
  concentration,
  correlation,
  dailyReturns,
  downsideDeviation,
  drawdownProfile,
  growthIndex,
  jensenAlpha,
  moneyWeightedReturn,
  sharpeRatio,
  shockImpact,
  sortinoRatio,
  volatility,
  type ConcentrationProfile,
  type DrawdownProfile,
  type ValuePoint,
} from "@/lib/performance";
import { useCurrentPrices } from "@/hooks/useCurrentPrices";
import { usePortfolioSnapshots } from "@/hooks/usePortfolioSnapshots";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";

const DAY_MS = 86_400_000;

/** Fenêtres d'analyse proposées à l'utilisateur. */
export const ANALYSIS_WINDOWS = [
  { id: "30d", label: "30 j", days: 30 },
  { id: "90d", label: "90 j", days: 90 },
  { id: "1y", label: "1 an", days: 365 },
  { id: "all", label: "Tout", days: null },
] as const;

export type AnalysisWindowId = (typeof ANALYSIS_WINDOWS)[number]["id"];

export type PortfolioAnalytics = {
  /** Vrai tant que les données nécessaires ne sont pas toutes arrivées. */
  isLoading: boolean;
  /**
   * Nombre de jours réellement couverts. En dessous d'une trentaine, les
   * ratios annualisés n'ont pas de sens statistique.
   */
  observedDays: number;
  hasEnoughHistory: boolean;

  /** Rendement pondéré par le temps, cumulé puis annualisé. */
  timeWeightedReturn: number;
  annualizedReturn: number;
  /** Rendement pondéré par les flux — `null` si les flux ne le permettent pas. */
  moneyWeightedReturn: number | null;

  volatility: number;
  downsideDeviation: number;
  sharpe: number;
  sortino: number;
  calmar: number;

  drawdown: DrawdownProfile;
  /** Indice base 100 du portefeuille, et de la référence Bitcoin. */
  indexSeries: Array<{ dayUtc: number; portfolio: number; benchmark: number | null }>;

  /** Performance cumulée de Bitcoin sur la même fenêtre. */
  benchmarkReturn: number | null;
  benchmarkAnnualized: number | null;
  /** Écart de performance face à un simple achat-conservation de Bitcoin. */
  excessReturn: number | null;
  beta: number | null;
  correlationToBenchmark: number | null;
  alpha: number | null;

  /** Concentration par actif et par plateforme de conservation. */
  assetConcentration: ConcentrationProfile;
  venueConcentration: ConcentrationProfile;
  /** Part du portefeuille en stablecoins — la réserve mobilisable. */
  stablecoinWeight: number;
  /** Perte encourue si la première position chute de 30 %. */
  topAssetShock: { key: string; impact: number } | null;

  totalValueUsd: number;
};

const STABLECOINS = new Set([
  "USDT",
  "USDC",
  "BUSD",
  "USD",
  "FDUSD",
  "TUSD",
  "DAI",
  "EUR",
  "EURC",
]);

const EMPTY_CONCENTRATION: ConcentrationProfile = {
  hhi: 0,
  effectiveCount: 0,
  topWeight: 0,
  top3Weight: 0,
  weights: [],
};

const EMPTY_DRAWDOWN: DrawdownProfile = {
  maxDrawdown: 0,
  currentDrawdown: 0,
  peakDayUtc: null,
  troughDayUtc: null,
  recoveryDayUtc: null,
  longestUnderwaterDays: 0,
};

/**
 * Assemble les indicateurs de performance et de risque du portefeuille.
 *
 * Le hook ne fait qu'acheminer les données vers `lib/performance` : tout le
 * calcul y est pur et couvert par des tests. On garde ici la sélection de la
 * fenêtre, la valorisation des positions et la mise en forme.
 */
export function usePortfolioAnalytics(windowId: AnalysisWindowId = "all"): PortfolioAnalytics {
  const { portfolioTokens, isLoading: isLoadingPortfolio } = useDashboardData();
  const { snapshots, isComputing } = usePortfolioSnapshots();
  const { currentPrices } = useCurrentPrices(portfolioTokens);

  // ── Valorisation des positions ────────────────────────────────
  const holdings = useMemo(() => {
    return portfolioTokens
      .map((token) => ({
        symbol: token.symbol,
        quantity: token.currentQuantity,
        valueUsd: token.currentQuantity * (currentPrices[token.symbol] ?? 0),
        bySource: token.quantityBySource,
      }))
      .filter((holding) => holding.valueUsd > 0);
  }, [portfolioTokens, currentPrices]);

  const totalValueUsd = useMemo(
    () => holdings.reduce((sum, holding) => sum + holding.valueUsd, 0),
    [holdings]
  );

  // ── Séries temporelles, restreintes à la fenêtre choisie ──────
  const windowed = useMemo(() => {
    if (snapshots.length === 0) return [];
    const days = ANALYSIS_WINDOWS.find((entry) => entry.id === windowId)?.days ?? null;
    if (days === null) return snapshots;
    const cutoff = snapshots[snapshots.length - 1].dayUtc - days * DAY_MS;
    const inWindow = snapshots.filter((snapshot) => snapshot.dayUtc >= cutoff);
    // Une fenêtre trop courte pour produire un rendement ne sert à rien.
    return inWindow.length >= 2 ? inWindow : snapshots;
  }, [snapshots, windowId]);

  return useMemo<PortfolioAnalytics>(() => {
    const points: ValuePoint[] = windowed.map((snapshot) => ({
      dayUtc: snapshot.dayUtc,
      valueUsd: snapshot.valueUsd,
      netInvestedUsd: snapshot.netInvestedUsd,
    }));

    // ── Concentration : elle ne dépend pas de l'historique ──────
    const assetConcentration = holdings.length
      ? concentration(holdings.map((holding) => ({ key: holding.symbol, valueUsd: holding.valueUsd })))
      : EMPTY_CONCENTRATION;

    // Risque de contrepartie : où les actifs sont-ils réellement conservés ?
    const venueTotals = new Map<string, number>();
    for (const holding of holdings) {
      const quantity = holding.quantity;
      if (quantity <= 0) continue;
      const unitValue = holding.valueUsd / quantity;
      for (const source of holding.bySource) {
        if (source.quantity <= 0) continue;
        const current = venueTotals.get(source.providerDisplayName) ?? 0;
        venueTotals.set(source.providerDisplayName, current + source.quantity * unitValue);
      }
    }
    const venueConcentration = venueTotals.size
      ? concentration(Array.from(venueTotals, ([key, valueUsd]) => ({ key, valueUsd })))
      : EMPTY_CONCENTRATION;

    const stableValue = holdings
      .filter((holding) => STABLECOINS.has(holding.symbol))
      .reduce((sum, holding) => sum + holding.valueUsd, 0);

    const topAsset = assetConcentration.weights[0];
    const topAssetShock = topAsset
      ? {
          key: topAsset.key,
          impact: shockImpact(
            holdings.map((holding) => ({ key: holding.symbol, valueUsd: holding.valueUsd })),
            topAsset.key,
            0.3
          ),
        }
      : null;

    const base = {
      isLoading: isLoadingPortfolio || isComputing,
      assetConcentration,
      venueConcentration,
      stablecoinWeight: totalValueUsd > 0 ? stableValue / totalValueUsd : 0,
      topAssetShock,
      totalValueUsd,
    };

    if (points.length < 2) {
      return {
        ...base,
        observedDays: 0,
        hasEnoughHistory: false,
        timeWeightedReturn: 0,
        annualizedReturn: 0,
        moneyWeightedReturn: null,
        volatility: 0,
        downsideDeviation: 0,
        sharpe: 0,
        sortino: 0,
        calmar: 0,
        drawdown: EMPTY_DRAWDOWN,
        indexSeries: [],
        benchmarkReturn: null,
        benchmarkAnnualized: null,
        excessReturn: null,
        beta: null,
        correlationToBenchmark: null,
        alpha: null,
      };
    }

    // ── Performance du portefeuille ─────────────────────────────
    const returns = dailyReturns(points);
    const returnValues = returns.map((entry) => entry.value);
    const observedDays = Math.max(
      1,
      Math.round((points[points.length - 1].dayUtc - points[0].dayUtc) / DAY_MS)
    );

    const twr = compound(returnValues);
    const annualizedReturn = annualize(twr, observedDays);
    const annualVolatility = volatility(returnValues);
    const annualDownside = downsideDeviation(returnValues);

    const index = growthIndex(returns, 100, points[0].dayUtc);
    const drawdown = drawdownProfile(index);

    // ── Référence Bitcoin ───────────────────────────────────────
    // `btcPercent` est la variation cumulée de BTC depuis l'origine du
    // portefeuille : on la ramène en indice pour en tirer des rendements.
    const btcIndex = windowed.map((snapshot) => 1 + snapshot.btcPercent / 100);
    const hasBenchmark = btcIndex.every((value) => value > 0) && btcIndex.length === points.length;

    let benchmarkReturn: number | null = null;
    let benchmarkAnnualized: number | null = null;
    let portfolioBeta: number | null = null;
    let correlationToBenchmark: number | null = null;
    let alpha: number | null = null;
    let benchmarkIndexed: number[] = [];

    if (hasBenchmark) {
      const btcReturns: number[] = [];
      for (let position = 1; position < btcIndex.length; position += 1) {
        btcReturns.push(btcIndex[position] / btcIndex[position - 1] - 1);
      }

      // Les rendements du portefeuille sautent les jours partis de zéro :
      // on aligne la référence sur les jours réellement comparables.
      const dayToBtcReturn = new Map<number, number>();
      for (let position = 1; position < windowed.length; position += 1) {
        dayToBtcReturn.set(windowed[position].dayUtc, btcReturns[position - 1]);
      }
      const alignedBenchmark: number[] = [];
      const alignedPortfolio: number[] = [];
      for (const entry of returns) {
        const benchmarkValue = dayToBtcReturn.get(entry.dayUtc);
        if (benchmarkValue === undefined) continue;
        alignedBenchmark.push(benchmarkValue);
        alignedPortfolio.push(entry.value);
      }

      benchmarkReturn = compound(alignedBenchmark);
      benchmarkAnnualized = annualize(benchmarkReturn, observedDays);
      portfolioBeta = beta(alignedPortfolio, alignedBenchmark);
      correlationToBenchmark = correlation(alignedPortfolio, alignedBenchmark);
      alpha = jensenAlpha(annualizedReturn, benchmarkAnnualized, portfolioBeta);

      let level = 100;
      benchmarkIndexed = [100];
      for (const value of alignedBenchmark) {
        level *= 1 + value;
        benchmarkIndexed.push(level);
      }
    }

    const indexSeries = index.map((point, position) => ({
      dayUtc: point.dayUtc,
      portfolio: point.value,
      benchmark: benchmarkIndexed[position] ?? null,
    }));

    return {
      ...base,
      observedDays,
      // En dessous de 30 observations, un Sharpe est du bruit habillé.
      hasEnoughHistory: returnValues.length >= 30,
      timeWeightedReturn: twr,
      annualizedReturn,
      moneyWeightedReturn: moneyWeightedReturn(cashFlowsFromPoints(points)),
      volatility: annualVolatility,
      downsideDeviation: annualDownside,
      sharpe: sharpeRatio(annualizedReturn, annualVolatility),
      sortino: sortinoRatio(annualizedReturn, annualDownside),
      calmar: calmarRatio(annualizedReturn, drawdown.maxDrawdown),
      drawdown,
      indexSeries,
      benchmarkReturn,
      benchmarkAnnualized,
      excessReturn: benchmarkReturn === null ? null : twr - benchmarkReturn,
      beta: portfolioBeta,
      correlationToBenchmark,
      alpha,
    };
  }, [windowed, holdings, totalValueUsd, isLoadingPortfolio, isComputing]);
}
