"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { isConvexConfigured } from "@/convex/client";
import { createFxResolver, type FxPoint } from "@/lib/fx";

const DAY_MS = 86_400_000;

/**
 * Historique de change EUR/USD, exposé sous forme de résolveur.
 *
 * La série couvre par défaut cinq ans : elle est légère (un point par jour
 * ouvré) et évite de re-interroger la base à chaque changement de période.
 */
export function useFxRates(years = 5) {
  const toDay = useMemo(() => Math.floor(Date.now() / DAY_MS) * DAY_MS, []);
  const fromDay = toDay - Math.round(years * 365) * DAY_MS;

  const rows = useQuery(
    api.fxRates.getRange,
    isConvexConfigured ? { fromDay, toDay } : "skip"
  );

  return useMemo(() => {
    const points: FxPoint[] = rows ?? [];
    return {
      rateAt: createFxResolver(points),
      /** Faux tant qu'aucun taux n'est disponible : ne rien afficher vaut mieux qu'un faux montant. */
      hasRates: points.length > 0,
      isLoading: rows === undefined,
    };
  }, [rows]);
}
