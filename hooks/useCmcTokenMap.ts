"use client";

import { useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

/**
 * Hook qui lit le mapping CMC symbol -> iconUrl depuis Convex.
 *
 * Usage:
 *   const { getCmcIconUrl, isLoading } = useCmcTokenMap();
 *   <img src={getCmcIconUrl("BTC")} />
 */
export function useCmcTokenMap() {
  const map = useQuery(api.cmcTokenMap.getAll);
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
