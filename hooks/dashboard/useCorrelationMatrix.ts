"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { isConvexConfigured } from "@/convex/client";
import { correlationMatrix, type CorrelationMatrix } from "@/lib/performance";

const DAY_MS = 86_400_000;

/** Les stablecoins n'ont pas de dynamique propre : les corréler n'apprend rien. */
const STABLECOINS = new Set(["USDT", "USDC", "BUSD", "USD", "FDUSD", "TUSD", "DAI", "EUR", "EURC"]);

export type CorrelationResult = {
  matrix: CorrelationMatrix;
  isLoading: boolean;
  /** Actifs demandés mais absents de l'historique de cours. */
  missingSymbols: string[];
};

/**
 * Corrélations entre les principales positions du portefeuille.
 *
 * L'historique de cours est déjà en base pour le calcul des valorisations
 * quotidiennes : on le relit ici plutôt que d'interroger un service externe.
 */
export function useCorrelationMatrix(symbols: string[], days = 180): CorrelationResult {
  // On borne le nombre d'actifs : au-delà, la matrice devient illisible et la
  // requête inutilement lourde.
  const requested = useMemo(
    () => symbols.filter((symbol) => !STABLECOINS.has(symbol)).slice(0, 8),
    [symbols]
  );

  const toDay = useMemo(() => Math.floor(Date.now() / DAY_MS) * DAY_MS, []);
  const fromDay = toDay - days * DAY_MS;

  const series = useQuery(
    api.priceHistory.getRangeMulti,
    isConvexConfigured && requested.length >= 2
      ? { symbols: requested, fromDay, toDay }
      : "skip"
  );

  return useMemo<CorrelationResult>(() => {
    if (requested.length < 2) {
      return {
        matrix: { keys: [], values: [], averagePairwise: 0, observations: 0 },
        isLoading: false,
        missingSymbols: [],
      };
    }

    if (series === undefined) {
      return {
        matrix: { keys: [], values: [], averagePairwise: 0, observations: 0 },
        isLoading: true,
        missingSymbols: [],
      };
    }

    const missingSymbols = requested.filter((symbol) => (series[symbol]?.length ?? 0) < 3);

    // Les séries n'ont pas forcément les mêmes jours : on ne garde que les
    // dates communes à tous les actifs, sinon les rendements ne sont pas
    // comparables et la corrélation perd son sens.
    const usable = requested.filter((symbol) => (series[symbol]?.length ?? 0) >= 3);
    if (usable.length < 2) {
      return {
        matrix: { keys: [], values: [], averagePairwise: 0, observations: 0 },
        isLoading: false,
        missingSymbols,
      };
    }

    const dayCounts = new Map<number, number>();
    for (const symbol of usable) {
      for (const point of series[symbol]) {
        dayCounts.set(point.dayUtc, (dayCounts.get(point.dayUtc) ?? 0) + 1);
      }
    }
    const commonDays = Array.from(dayCounts.entries())
      .filter(([, count]) => count === usable.length)
      .map(([day]) => day)
      .sort((a, b) => a - b);

    if (commonDays.length < 3) {
      return {
        matrix: { keys: [], values: [], averagePairwise: 0, observations: 0 },
        isLoading: false,
        missingSymbols,
      };
    }

    const returnsByKey: Record<string, number[]> = {};
    for (const symbol of usable) {
      const byDay = new Map(series[symbol].map((point) => [point.dayUtc, point.closeUsd]));
      const returns: number[] = [];
      for (let index = 1; index < commonDays.length; index += 1) {
        const previous = byDay.get(commonDays[index - 1]);
        const current = byDay.get(commonDays[index]);
        if (!previous || previous <= 0 || current === undefined) continue;
        returns.push(current / previous - 1);
      }
      if (returns.length >= 2) returnsByKey[symbol] = returns;
    }

    return {
      matrix: correlationMatrix(returnsByKey),
      isLoading: false,
      missingSymbols,
    };
  }, [series, requested]);
}
