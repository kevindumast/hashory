"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { isConvexConfigured } from "@/convex/client";
import { useIntegrations } from "@/hooks/dashboard/useIntegrations";

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
 *
 * Un changement des données d'un compte — import, synchronisation, compte
 * vidé ou supprimé — relance le calcul sans attendre : rien d'autre ne le
 * signale à la page, qui gardait sinon les positions d'avant. Un seul calcul
 * à la fois ; un changement survenu pendant le calcul en relance un.
 */
export function useRecomputeTrigger(ready: boolean, deps: unknown): boolean {
  const { user } = useUser();
  const clerkId = user?.id ?? null;
  const recompute = useAction(api.portfolioSnapshots.recomputeForUser);
  const { integrations, isLoading: integrationsLoading } = useIntegrations();
  const [isComputing, setIsComputing] = useState(false);
  const lastTriggerRef = useRef<number>(0);
  const runningRef = useRef(false);
  const pendingRef = useRef(false);
  const lastSignatureRef = useRef<string | null>(null);

  // Chaque écriture sur un compte déplace son `updatedAt`.
  const dataSignature = integrationsLoading
    ? null
    : integrations.map((integration) => `${integration._id}:${integration.updatedAt}`).join("|");

  const run = useCallback(() => {
    if (runningRef.current) {
      pendingRef.current = true;
      return;
    }
    runningRef.current = true;
    lastTriggerRef.current = Date.now();
    setIsComputing(true);
    recompute({})
      .catch((err) => console.error("[snapshots] recompute failed", err))
      .finally(() => {
        runningRef.current = false;
        setIsComputing(false);
        if (pendingRef.current) {
          pendingRef.current = false;
          run();
        }
      });
  }, [recompute]);

  useEffect(() => {
    if (!clerkId || !isConvexConfigured || !ready) return;
    if (Date.now() - lastTriggerRef.current < 60_000) return;
    run();
  }, [clerkId, ready, deps, run]);

  useEffect(() => {
    if (!clerkId || !isConvexConfigured || !ready || dataSignature === null) return;
    const previous = lastSignatureRef.current;
    lastSignatureRef.current = dataSignature;
    // Le premier relevé n'est pas un changement : le déclencheur ci-dessus s'en charge.
    if (previous !== null && previous !== dataSignature) run();
  }, [clerkId, ready, dataSignature, run]);

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
