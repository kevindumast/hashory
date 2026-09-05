"use client";

import { useState, useEffect, useMemo } from "react";
import type { PortfolioToken } from "@/hooks/dashboard/useDashboardMetrics";

/**
 * Paires candidates pour valoriser un actif, par ordre de préférence.
 *
 * Les paires adossées au dollar viennent d'abord, pour deux raisons. Elles
 * existent chez la plupart des places, là où la paire réellement tradée peut
 * être propre à une seule — Kraken cote en USD et en EUR quand Binance ne
 * connaît que USDT et USDC. Surtout, le reste de l'application raisonne en
 * dollars : retenir une paire en euros donnerait un cours juste dans la
 * mauvaise devise, ce qui est pire qu'une valeur absente.
 *
 * La paire tradée reste en dernier recours, pour les actifs sans marché
 * adossé au dollar.
 */
function buildCandidatePairs(token: PortfolioToken): string[] {
  const symbol = token.symbol.toUpperCase();
  const candidates = [`${symbol}USDT`, `${symbol}USDC`];

  for (const traded of token.tradeSymbols ?? []) {
    const pair = traded.toUpperCase();
    if (!candidates.includes(pair)) candidates.push(pair);
  }

  return candidates;
}

/** Intervalle de rafraîchissement, aligné sur le cache de la route de prix. */
const REFRESH_INTERVAL_MS = 60_000;

type PriceResult = {
  /** Prix actuel par symbole de token (ex: { "ETH": 3200, "BTC": 95000 }) */
  currentPrices: Record<string, number>;
  loading: boolean;
  error: string | null;
  /** Relancer le fetch manuellement */
  refresh: () => void;
  /** Relancer le fetch pour un seul actif. */
  refreshSymbol: (symbol: string) => Promise<void>;
  /** Actifs dont le cours est en cours de rechargement individuel. */
  refreshingSymbols: Set<string>;
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
  const [refreshingSymbols, setRefreshingSymbols] = useState<Set<string>>(new Set());

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

    // Les cours ne se figeaient qu'au montage : l'écran restait sur la
    // valeur du premier chargement. La route de prix garde un cache d'une
    // minute, donc interroger à ce rythme ne coûte rien de plus.
    const timer = window.setInterval(fetchBatch, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [allPairs, pairToSymbol, tokens.length, fetchTrigger]);

  const refresh = () => setFetchTrigger((n) => n + 1);

  /**
   * Recharge le cours d'un seul actif.
   *
   * Utile quand une valeur manque : une requête portant sur une poignée de
   * paires aboutit là où un lot de plusieurs dizaines peut être écourté par
   * la place de marché. Elle sert donc autant à réparer l'affichage qu'à
   * distinguer un actif réellement inconnu d'un appel qui n'a pas abouti.
   */
  const refreshSymbol = async (symbol: string) => {
    const token = tokens.find((entry) => entry.symbol === symbol);
    if (!token) return;

    setRefreshingSymbols((current) => new Set(current).add(symbol));
    try {
      const response = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: buildCandidatePairs(token) }),
      });
      if (!response.ok) throw new Error(`Erreur serveur: ${response.status}`);

      const data = (await response.json()) as Array<{ symbol: string; price: string }>;
      const price = data.map((item) => parseFloat(item.price)).find((value) => !isNaN(value));

      if (price !== undefined) {
        setCurrentPrices((current) => ({ ...current, [symbol]: price }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de récupérer le cours.");
    } finally {
      setRefreshingSymbols((current) => {
        const next = new Set(current);
        next.delete(symbol);
        return next;
      });
    }
  };

  return { currentPrices, loading, error, refresh, refreshSymbol, refreshingSymbols };
}
