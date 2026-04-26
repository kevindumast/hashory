"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { isConvexConfigured } from "@/convex/client";

export type PortfolioSnapshot = {
  dayUtc: number;
  valueUsd: number;
  costBasisUsd: number;
  realizedPnlUsd: number;
  netInvestedUsd: number;
  profitPercent: number;
  btcPercent: number;
};

const DAY_MS = 86_400_000;

/**
 * Reads daily portfolio snapshots from Convex and triggers a recompute when
 * they're missing or stale. The Convex action is idempotent — it short-circuits
 * if `lastTradeAt` and `lastComputedDay` already match.
 */
export function usePortfolioSnapshots(): {
  snapshots: PortfolioSnapshot[];
  isComputing: boolean;
  lastComputedDay: number | null;
} {
  const { user, isLoaded } = useUser();
  const clerkId = user?.id ?? null;

  const snapshots = useQuery(
    api.portfolioSnapshots.listByUser,
    isConvexConfigured && isLoaded && clerkId ? { clerkId } : "skip"
  );

  const state = useQuery(
    api.portfolioSnapshots.getState,
    isConvexConfigured && isLoaded && clerkId ? { clerkId } : "skip"
  );

  const recompute = useAction(api.portfolioSnapshots.recomputeForUser);
  const [isComputing, setIsComputing] = useState(false);
  const lastTriggerRef = useRef<number>(0);

  useEffect(() => {
    if (!clerkId || !isConvexConfigured) return;
    if (state === undefined) return; // still loading

    // Throttle to one call per minute — the action itself short-circuits cheaply
    // if `lastTradeAt` and `lastComputedDay` haven't moved, so over-calling is fine.
    const now = Date.now();
    if (now - lastTriggerRef.current < 60_000) return;
    lastTriggerRef.current = now;

    setIsComputing(true);
    recompute({ clerkId })
      .catch((err) => console.error("[snapshots] recompute failed", err))
      .finally(() => setIsComputing(false));
  }, [clerkId, state, recompute]);

  const list = useMemo<PortfolioSnapshot[]>(() => {
    if (!Array.isArray(snapshots)) return [];
    return snapshots.map((s) => ({
      dayUtc: s.dayUtc,
      valueUsd: s.valueUsd,
      costBasisUsd: s.costBasisUsd,
      realizedPnlUsd: s.realizedPnlUsd,
      netInvestedUsd: s.netInvestedUsd,
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
