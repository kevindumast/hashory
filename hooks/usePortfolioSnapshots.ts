"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useUser } from "@clerk/nextjs";
import { useAction } from "convex/react";
import { useActiveQuery, usePageActivity } from "@/hooks/usePageActivity";
import { api } from "@/convex/_generated/api";
import { isConvexConfigured } from "@/convex/client";
import { useIntegrations } from "@/hooks/dashboard/useIntegrations";
import { startOfUtcDay } from "@/lib/valuation";

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

/** Délai minimal entre deux recalculs lancés par l'affichage. */
const RETRIGGER_MS = 60_000;

/**
 * État partagé par tous les déclencheurs de la page. Chaque composant qui
 * affichait des séries avait le sien : le tableau de bord en monte deux, et
 * le recalcul du changement de jour partait deux fois en parallèle, avec
 * deux fois la collecte des cours et les écritures.
 */
const shared = {
  running: false,
  pending: false,
  lastTrigger: 0,
  /** Vrai une fois la vérification du chargement de la page faite. */
  checkedThisPage: false,
  lastSignature: null as string | null,
};
const computingListeners = new Set<() => void>();

function setRunning(running: boolean) {
  shared.running = running;
  for (const listener of computingListeners) listener();
}

function subscribeComputing(listener: () => void) {
  computingListeners.add(listener);
  return () => {
    computingListeners.delete(listener);
  };
}

function runRecompute(recompute: () => Promise<unknown>) {
  if (shared.running) {
    shared.pending = true;
    return;
  }
  shared.lastTrigger = Date.now();
  shared.checkedThisPage = true;
  setRunning(true);
  recompute()
    .catch((err) => console.error("[snapshots] recompute failed", err))
    .finally(() => {
      setRunning(false);
      if (shared.pending) {
        shared.pending = false;
        runRecompute(recompute);
      }
    });
}

/**
 * Lance le recalcul du portefeuille (séries et rapport fiscal) quand il peut
 * avoir changé : au chargement de la page, au passage à un nouveau jour UTC,
 * ou quand le moteur de calcul a évolué. Un seul calcul à la fois pour toute
 * la page, au plus un par minute.
 *
 * L'action s'arrête si rien n'a changé, mais elle relit tout le grand livre
 * pour le savoir : on ne l'appelle donc pas à chaque nouvel affichage. Rien
 * ne part non plus quand l'onglet est caché : le calcul attend le retour de
 * l'utilisateur au lieu de tourner en pleine nuit pour un onglet oublié.
 *
 * Un changement des données d'un compte (import, synchronisation, compte
 * vidé ou supprimé) relance le calcul sans attendre : rien d'autre ne le
 * signale à la page, qui gardait sinon les positions d'avant. Un changement
 * survenu pendant le calcul en relance un.
 */
export function useRecomputeTrigger(): boolean {
  const { user } = useUser();
  const clerkId = user?.id ?? null;
  const recompute = useAction(api.portfolioSnapshots.recomputeForUser);
  const { integrations, isLoading: integrationsLoading } = useIntegrations();
  const { visible } = usePageActivity();
  const state = useActiveQuery(
    api.portfolioSnapshots.getState,
    isConvexConfigured && clerkId ? {} : "skip"
  );
  const isComputing = useSyncExternalStore(subscribeComputing, () => shared.running, () => false);

  // Chaque écriture sur un compte déplace son `updatedAt`. Pendant une
  // synchronisation, il bouge à chaque paire lue : on attend qu'elle se
  // termine pour ne recalculer qu'une fois, le calcul relisant tout le
  // grand livre.
  const syncing = integrations.some((integration) => integration.syncStatus === "syncing");
  const dataSignature =
    integrationsLoading || syncing
      ? null
      : integrations.map((integration) => `${integration._id}:${integration.updatedAt}`).join("|");

  const ready = Boolean(clerkId) && isConvexConfigured && state !== undefined && visible;
  const run = useCallback(() => runRecompute(() => recompute({})), [recompute]);

  // Déclaré en premier : quand les deux se réveillent ensemble, au retour
  // sur l'onglet, le changement de données part seul et le déclencheur
  // suivant voit qu'un calcul vient de partir.
  useEffect(() => {
    if (!ready || dataSignature === null) return;
    const previous = shared.lastSignature;
    shared.lastSignature = dataSignature;
    // Le premier relevé n'est pas un changement : le déclencheur ci-dessous s'en charge.
    if (previous !== null && previous !== dataSignature) run();
  }, [ready, dataSignature, run]);

  const lastComputedDay = state?.lastComputedDay ?? null;
  const engineIsCurrent = state?.engineIsCurrent ?? false;
  useEffect(() => {
    if (!ready) return;
    if (Date.now() - shared.lastTrigger < RETRIGGER_MS) return;
    const outdated =
      !engineIsCurrent || lastComputedDay === null || lastComputedDay < startOfUtcDay(Date.now());
    // Le chargement de la page vérifie une fois : une synchronisation faite
    // ailleurs ne se voit qu'en relisant le grand livre.
    if (shared.checkedThisPage && !outdated) return;
    run();
  }, [ready, lastComputedDay, engineIsCurrent, run]);

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
  /** Vrai tant que la série n'est pas arrivée : à distinguer d'une série vide. */
  isLoading: boolean;
  lastComputedDay: number | null;
} {
  const { user, isLoaded } = useUser();
  const clerkId = user?.id ?? null;

  const snapshots = useActiveQuery(
    api.portfolioSnapshots.listByUser,
    isConvexConfigured && isLoaded && clerkId ? { scope } : "skip"
  );

  const state = useActiveQuery(
    api.portfolioSnapshots.getState,
    isConvexConfigured && isLoaded && clerkId ? {} : "skip"
  );

  const isComputing = useRecomputeTrigger();

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
    isLoading: !Array.isArray(snapshots),
    lastComputedDay: state?.lastComputedDay ?? null,
  };
}

export const PORTFOLIO_SNAPSHOT_DAY_MS = DAY_MS;

/**
 * Relance le recalcul à la demande, après un changement que la page ne voit
 * pas passer par les comptes (un pointage manuel, par exemple).
 */
export function useRequestRecompute(): () => void {
  const recompute = useAction(api.portfolioSnapshots.recomputeForUser);
  return useCallback(() => runRecompute(() => recompute({})), [recompute]);
}
