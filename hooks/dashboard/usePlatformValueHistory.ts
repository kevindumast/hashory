"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { isConvexConfigured } from "@/convex/client";
import { USD_STABLECOINS, type PortfolioToken } from "@/hooks/dashboard/useDashboardMetrics";

/**
 * Plafond de symboles interrogés.
 *
 * L'historique de cours est lu jour par jour et par symbole : sans borne, un
 * portefeuille très fragmenté ferait exploser le volume lu par la requête.
 * Les symboles retenus sont les plus lourds, ceux qui décident de la forme
 * de la courbe.
 */
const MAX_SYMBOLS = 30;

export type PlatformValuePoint = {
  dayUtc: number;
  /** Valeur détenue sur chaque plateforme, ce jour-là. */
  byPlatform: Record<string, number>;
};

export type PlatformValueHistory = {
  platforms: string[];
  points: PlatformValuePoint[];
  isLoading: boolean;
  /** Symboles écartés faute de place, ou d'historique de cours. */
  omittedSymbols: string[];
};

type Movement = {
  timestamp: number;
  symbol: string;
  platform: string;
  delta: number;
};

/**
 * Reconstitue la valeur détenue sur chaque plateforme, jour après jour.
 *
 * La valeur totale du portefeuille est déjà calculée côté serveur, mais elle
 * n'est pas ventilée. On la reconstitue ici en rejouant les mouvements par
 * plateforme, puis en valorisant les quantités obtenues au cours du jour.
 *
 * Le rejeu et la valorisation avancent tous deux dans le temps : un curseur
 * par symbole suffit, ce qui évite un coût quadratique sur un long historique.
 */
export function usePlatformValueHistory(
  tokens: PortfolioToken[],
  days: number[]
): PlatformValueHistory {
  // ── Mouvements, tous symboles et plateformes confondus ────────
  const { movements, symbols, platforms, omittedSymbols } = useMemo(() => {
    const all: Movement[] = [];
    const platformSet = new Set<string>();

    // On garde les symboles les plus lourds : ce sont eux qui portent la forme.
    const ranked = [...tokens]
      .sort((a, b) => Math.abs(b.investedUsd) - Math.abs(a.investedUsd))
      .slice(0, MAX_SYMBOLS);
    const kept = new Set(ranked.map((token) => token.symbol));
    const omitted = tokens.filter((token) => !kept.has(token.symbol)).map((token) => token.symbol);

    for (const token of ranked) {
      for (const event of token.events) {
        const sign = event.type === "BUY" || event.type === "DEPOSIT" ? 1 : -1;
        if (event.quantity <= 0) continue;
        all.push({
          timestamp: event.timestamp,
          symbol: token.symbol,
          platform: event.providerDisplayName,
          delta: sign * event.quantity,
        });
        platformSet.add(event.providerDisplayName);
      }
    }

    all.sort((a, b) => a.timestamp - b.timestamp);

    return {
      movements: all,
      symbols: Array.from(kept).filter((symbol) => !USD_STABLECOINS.has(symbol)),
      platforms: Array.from(platformSet).sort(),
      omittedSymbols: omitted,
    };
  }, [tokens]);

  const range = useMemo(() => {
    if (days.length === 0) return null;
    return { fromDay: Math.min(...days), toDay: Math.max(...days) };
  }, [days]);

  const priceRows = useQuery(
    api.priceHistory.getRangeMulti,
    isConvexConfigured && range && symbols.length > 0
      ? { symbols, fromDay: range.fromDay, toDay: range.toDay }
      : "skip"
  );

  return useMemo<PlatformValueHistory>(() => {
    if (days.length === 0 || platforms.length === 0) {
      return { platforms: [], points: [], isLoading: false, omittedSymbols };
    }
    if (symbols.length > 0 && priceRows === undefined) {
      return { platforms, points: [], isLoading: true, omittedSymbols };
    }

    // Curseur par symbole : les jours sont parcourus dans l'ordre croissant.
    const series = priceRows ?? {};
    const priceCursor = new Map<string, number>();

    const priceAt = (symbol: string, dayUtc: number): number => {
      // Un stablecoin vaut un dollar : inutile d'en stocker l'historique.
      if (USD_STABLECOINS.has(symbol)) return 1;
      const points = series[symbol];
      if (!points || points.length === 0) return 0;

      let index = priceCursor.get(symbol) ?? -1;
      while (index + 1 < points.length && points[index + 1].dayUtc <= dayUtc) index += 1;
      priceCursor.set(symbol, index);

      // Avant le premier cours connu, on ne devine pas : la ligne vaut zéro.
      return index >= 0 ? points[index].closeUsd : 0;
    };

    const sortedDays = [...days].sort((a, b) => a - b);
    const quantities = new Map<string, Map<string, number>>();
    let movementIndex = 0;
    const points: PlatformValuePoint[] = [];

    for (const dayUtc of sortedDays) {
      // Fin de journée : tout mouvement de ce jour compte déjà.
      const cutoff = dayUtc + 86_400_000 - 1;
      while (movementIndex < movements.length && movements[movementIndex].timestamp <= cutoff) {
        const movement = movements[movementIndex];
        const perSymbol = quantities.get(movement.platform) ?? new Map<string, number>();
        perSymbol.set(movement.symbol, (perSymbol.get(movement.symbol) ?? 0) + movement.delta);
        quantities.set(movement.platform, perSymbol);
        movementIndex += 1;
      }

      const byPlatform: Record<string, number> = {};
      for (const platform of platforms) {
        let value = 0;
        const perSymbol = quantities.get(platform);
        if (perSymbol) {
          for (const [symbol, quantity] of perSymbol) {
            // Une quantité négative traduit un historique incomplet plutôt
            // qu'une position vendue à découvert : on ne la propage pas.
            if (quantity <= 0) continue;
            value += quantity * priceAt(symbol, dayUtc);
          }
        }
        byPlatform[platform] = value;
      }

      points.push({ dayUtc, byPlatform });
    }

    // Une plateforme restée à zéro sur toute la période n'apporte rien.
    const visible = platforms.filter((platform) =>
      points.some((point) => point.byPlatform[platform] > 0)
    );

    return { platforms: visible, points, isLoading: false, omittedSymbols };
  }, [days, movements, platforms, symbols, priceRows, omittedSymbols]);
}
