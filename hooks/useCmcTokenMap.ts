"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

/**
 * Hook qui lit le mapping CMC symbol -> iconUrl depuis Convex.
 *
 * @param symbols - liste des symbols à charger (ex: ["BTC", "ETH"])
 *
 * Usage:
 *   const { getCmcIconUrl, isLoading } = useCmcTokenMap(["BTC", "ETH"]);
 *   <img src={getCmcIconUrl("BTC")} />
 */
export function useCmcTokenMap(symbols: string[] = []) {
  const uniqueSymbols = useMemo(
    () => [...new Set(symbols.map((s) => s.toUpperCase()))].sort(),
    [symbols]
  );

  const map = useQuery(
    api.cmcTokenMap.getBySymbols,
    uniqueSymbols.length > 0 ? { symbols: uniqueSymbols } : "skip"
  );
  const isLoading = map === undefined;

  const getCmcIconUrl = useCallback(
    (symbol: string): string | null => {
      if (!map) return null;
      return map[symbol.toUpperCase()] ?? null;
    },
    [map]
  );

  return { map: map ?? {}, isLoading, getCmcIconUrl };
}
