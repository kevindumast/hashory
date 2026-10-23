"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { isConvexConfigured } from "@/convex/client";

export type PortfolioSnapshot = {
  dayUtc: number;
  valueUsd: number;
  /** Apports nets cumulés : ce qui est entré moins ce qui est sorti. */
  netInvestedUsd: number;
  /** Apports (+) et retraits (−) du jour. */
  flowUsd: number;
  /** Rendement pondéré par le temps cumulé, en %. */
  profitPercent: number;
  btcPercent: number;
};

const DAY_MS = 86_400_000;

/**
 * Lance le recalcul du portefeuille (séries et rapport fiscal) à
 * l'affichage, au plus une fois par minute. L'action s'arrête aussitôt si
 * rien n'a changé depuis le dernier calcul : l'appeler souvent ne coûte rien.
 */
export function useRecomputeTrigger(ready: boolean, deps: unknown): boolean {
  const { user } = useUser();
  const clerkId = user?.id ?? null;
  const recompute = useAction(api.portfolioSnapshots.recomputeForUser);
  const [isComputing, setIsComputing] = useState(false);
  const lastTriggerRef = useRef<number>(0);

  useEffect(() => {
    if (!clerkId || !isConvexConfigured || !ready) return;

    const now = Date.now();
    if (now - lastTriggerRef.current < 60_000) return;
    lastTriggerRef.current = now;

    setIsComputing(true);
    recompute({})
      .catch((err) => console.error("[snapshots] recompute failed", err))
      .finally(() => setIsComputing(false));
  }, [clerkId, ready, deps, recompute]);

  return isComputing;
}

/**
 * Série quotidienne d'un périmètre — le portefeuille entier par défaut, ou
 * un compte — et recalcul quand elle manque ou date. L'action Convex
 * s'arrête aussitôt si rien n'a changé depuis le dernier calcul.
 */
export function usePortfolioSnapshots(scope?: string): {
  snapshots: PortfolioSnapshot[];
  isComputing: boolean;
  lastComputedDay: number | null;
} {
  const { user, isLoaded } = useUser();
  const clerkId = user?.id ?? null;

  const snapshots = useQuery(
    api.portfolioSnapshots.listByUser,
    isConvexConfigured && isLoaded && clerkId ? { scope } : "skip"
  );

  const state = useQuery(
    api.portfolioSnapshots.getState,
    isConvexConfigured && isLoaded && clerkId ? {} : "skip"
  );

  const isComputing = useRecomputeTrigger(state !== undefined, state);

  const list = useMemo<PortfolioSnapshot[]>(() => {
    if (!Array.isArray(snapshots)) return [];
    return snapshots.map((s) => ({
      dayUtc: s.dayUtc,
      valueUsd: s.valueUsd,
      netInvestedUsd: s.netInvestedUsd,
      flowUsd: s.flowUsd ?? 0,
      profitPercent: s.profitPercent,
      btcPercent: s.btcPercent,
    }));
  }, [snapshots]);

  return {
    snapshots: list,
    isComputing,
    lastComputedDay: state?.lastComputedDay ?? null,
  };
}

export const PORTFOLIO_SNAPSHOT_DAY_MS = DAY_MS;
