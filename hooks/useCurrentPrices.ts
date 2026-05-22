"use client";

import { useState, useEffect, useMemo } from "react";
import type { PortfolioToken } from "@/hooks/dashboard/useDashboardMetrics";

/**
 * Retourne la paire la plus importante pour un token (ou USDT par défaut).
 */
function buildCandidatePairs(token: PortfolioToken): string[] {
  // Prendre la première paire réelle (la plus tradée)
  if (token.tradeSymbols && token.tradeSymbols.length > 0) {
    return [token.tradeSymbols[0].toUpperCase()];
  }

  // Fallback : utiliser USDT
  return [`${token.symbol.toUpperCase()}USDT`];
}

type PriceResult = {
  /** Prix actuel par symbole de token (ex: { "ETH": 3200, "BTC": 95000 }) */
  currentPrices: Record<string, number>;
  loading: boolean;
  error: string | null;
  /** Relancer le fetch manuellement */
  refresh: () => void;
};

/**
 * Récupère les prix actuels depuis Binance en une seule requête batch.
 * Aucun refresh automatique — appelé une fois au montage du composant.
 */
export function useCurrentPrices(tokens: PortfolioToken[]): PriceResult {
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  // Construire la map paire → symbole token pour le mapping inverse
  const pairToSymbol = useMemo(() => {
    const map = new Map<string, string>();
    for (const token of tokens) {
      for (const pair of buildCandidatePairs(token)) {
        // On garde la première association (token le plus spécifique en premier)
        if (!map.has(pair)) {
          map.set(pair, token.symbol);
        }
      }
    }
    return map;
  }, [tokens]);

  // Toutes les paires candidates à interroger
  const allPairs = useMemo(() => Array.from(pairToSymbol.keys()), [pairToSymbol]);

  useEffect(() => {
    if (tokens.length === 0 || allPairs.length === 0) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetchBatch = async () => {
      try {
        if (allPairs.length === 0) {
          setCurrentPrices({});
          setError(null);
          setLoading(false);
          return;
        }

        // Appel à notre route API (qui contourne le problème CORS)
        const response = await fetch('/api/prices', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ symbols: allPairs }),
        });

        if (!response.ok) {
          throw new Error(`Erreur serveur: ${response.status}`);
        }

        const data = (await response.json()) as Array<{ symbol: string; price: string }>;

        if (cancelled) return;

        // Mapper chaque résultat au bon token (on garde le premier prix trouvé par token)
        const prices: Record<string, number> = {};
        for (const item of data) {
          const tokenSymbol = pairToSymbol.get(item.symbol.toUpperCase());
          if (tokenSymbol && !prices[tokenSymbol]) {
            const parsedPrice = parseFloat(item.price);
            if (!isNaN(parsedPrice)) {
              prices[tokenSymbol] = parsedPrice;
            }
          }
        }

        setCurrentPrices(prices);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Impossible de récupérer les prix.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchBatch();

    return () => {
      cancelled = true;
    };
  }, [tokens.length, fetchTrigger]);

  const refresh = () => setFetchTrigger((n) => n + 1);

  return { currentPrices, loading, error, refresh };
}
