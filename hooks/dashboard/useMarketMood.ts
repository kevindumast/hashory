"use client";

import { useMemo } from "react";
import { useActiveQuery } from "@/hooks/usePageActivity";
import { api } from "@/convex/_generated/api";
import { isConvexConfigured } from "@/convex/client";
import { timingProfile, type FearGreedPoint, type TimingProfile, type TradeFlowDay } from "@/lib/fear-greed";

export type MarketMood = {
  isLoading: boolean;
  /** Indice restreint à la période. */
  index: FearGreedPoint[];
  /** Jours d'achat ou de vente de la période, avec l'indice du jour. */
  decisions: Array<TradeFlowDay & { value: number }>;
  profile: TimingProfile | null;
  /** Faux tant que le prochain recalcul n'a pas produit les flux. */
  hasFlows: boolean;
};

/**
 * Humeur du marché confrontée aux décisions du portefeuille, sur la même
 * période que le reste de la page. Le calcul vit dans `lib/fear-greed`.
 */
export function useMarketMood(range: { fromDay: number; toDay: number } | null): MarketMood {
  const enabled = isConvexConfigured && range !== null;
  const history = useActiveQuery(api.fearGreed.history, enabled ? {} : "skip");
  const flows = useActiveQuery(api.fearGreed.myTradeFlows, enabled ? {} : "skip");

  const fromDay = range?.fromDay ?? 0;
  const toDay = range?.toDay ?? 0;

  return useMemo<MarketMood>(() => {
    if (!enabled || history === undefined || flows === undefined) {
      return { isLoading: enabled, index: [], decisions: [], profile: null, hasFlows: false };
    }

    const index = history.filter((point) => point.dayUtc >= fromDay && point.dayUtc <= toDay);
    const valueByDay = new Map(index.map((point) => [point.dayUtc, point.value]));
    const decisions = (flows ?? []).flatMap((flow) => {
      const value = valueByDay.get(flow.dayUtc);
      return value === undefined ? [] : [{ ...flow, value }];
    });

    return {
      isLoading: false,
      index,
      decisions,
      profile: flows === null ? null : timingProfile(flows, history, { fromDay, toDay }),
      hasFlows: flows !== null,
    };
  }, [enabled, history, flows, fromDay, toDay]);
}
