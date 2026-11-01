"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import type { PortfolioToken } from "@/hooks/dashboard/useDashboardMetrics";
import { errorMessage, toast } from "@/lib/toast";
import { usePageActivity } from "@/hooks/usePageActivity";

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

/**
 * Heures locales de mise à jour automatique des cours : matin, midi et soir.
 *
 * Hashory suit un portefeuille, il ne sert pas à trader : un cours de
 * quelques heures suffit, et le bouton d'actualisation reste là pour qui
 * veut le cours du moment. Interroger chaque minute coûtait une requête par
 * onglet ouvert, pour rien.
 */
export const PRICE_REFRESH_HOURS = [8, 12, 19] as const;

/** Dernier créneau de mise à jour atteint à `now`, la veille au besoin. */
export function lastRefreshSlot(now: number): number {
  const date = new Date(now);
  for (let daysBack = 0; daysBack <= 1; daysBack++) {
    for (let i = PRICE_REFRESH_HOURS.length - 1; i >= 0; i--) {
      const slot = new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysBack, PRICE_REFRESH_HOURS[i]).getTime();
      if (slot <= now) return slot;
    }
  }
  return now;
}

/** Prochain créneau de mise à jour après `now`, le lendemain au besoin. */
export function nextRefreshSlot(now: number): number {
  const date = new Date(now);
  for (let daysAhead = 0; daysAhead <= 1; daysAhead++) {
    for (const hour of PRICE_REFRESH_HOURS) {
      const slot = new Date(date.getFullYear(), date.getMonth(), date.getDate() + daysAhead, hour).getTime();
      if (slot > now) return slot;
    }
  }
  return now;
}

const PRICE_CACHE_KEY = "hashory:current-prices";

type PriceCache = { pairsKey: string; at: number; prices: Record<string, number> };

// Les cours du dernier lot survivent au rechargement de la page : sans eux,
// chaque visite redemandait des cours que le créneau rendait encore valables.
function readPriceCache(): PriceCache | null {
  try {
    const raw = window.localStorage.getItem(PRICE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as PriceCache) : null;
  } catch {
    return null;
  }
}

function writePriceCache(cache: PriceCache) {
  try {
    window.localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* stockage indisponible : les cours seront redemandés au prochain chargement */
  }
}

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
 * Récupère les prix actuels depuis Binance en une seule requête batch, puis
 * à chaque créneau de {@link PRICE_REFRESH_HOURS} tant que l'onglet est actif.
 */
export function useCurrentPrices(tokens: PortfolioToken[]): PriceResult {
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchTrigger, setFetchTrigger] = useState(0);
  const [refreshingSymbols, setRefreshingSymbols] = useState<Set<string>>(new Set());
  const { active } = usePageActivity();
  // Passe d'un cran à chaque créneau atteint, pour relancer l'effet de collecte.
  const [slotTick, setSlotTick] = useState(0);
  // Dernier lot reçu, et pour quelles paires : on ne redemande les cours
  // qu'une fois un créneau passé, ou sur demande.
  const lastFetchRef = useRef<{ pairsKey: string; trigger: number; at: number } | null>(null);

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

  // Toutes les paires candidates à interroger, sous forme de clé : les
  // jetons sont recalculés souvent, leurs paires rarement. Suivre l'identité
  // des tableaux relançait une requête à chaque rendu dès qu'un tableau
  // amont n'était pas mémorisé.
  const pairsKey = useMemo(() => Array.from(pairToSymbol.keys()).join(","), [pairToSymbol]);
  const pairToSymbolRef = useRef(pairToSymbol);
  useEffect(() => {
    pairToSymbolRef.current = pairToSymbol;
  }, [pairToSymbol]);

  useEffect(() => {
    const allPairs = pairsKey ? pairsKey.split(",") : [];
    if (allPairs.length === 0) return;
    // Onglet caché ou délaissé : personne ne regarde les cours.
    if (!active) return;

    let cancelled = false;

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
        const fetchedAt = Date.now();
        lastFetchRef.current = { pairsKey, trigger: fetchTrigger, at: fetchedAt };

        // Mapper chaque résultat au bon token (on garde le premier prix trouvé par token)
        const prices: Record<string, number> = {};
        for (const item of data) {
          const tokenSymbol = pairToSymbolRef.current.get(item.symbol.toUpperCase());
          if (tokenSymbol && !prices[tokenSymbol]) {
            const parsedPrice = parseFloat(item.price);
            if (!isNaN(parsedPrice)) {
              prices[tokenSymbol] = parsedPrice;
            }
          }
        }

        // Fusion, et non remplacement : un lot partiel — une paire refusée
        // par la place de marché, par exemple — effacerait sinon des cours
        // parfaitement valides, dont ceux rechargés ligne par ligne.
        setCurrentPrices((current) => {
          const merged = { ...current, ...prices };
          writePriceCache({ pairsKey, at: fetchedAt, prices: merged });
          return merged;
        });
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Impossible de récupérer les prix.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const now = Date.now();
    // Premier passage du hook : on repart des cours enregistrés, si le
    // créneau en cours les couvre encore.
    if (lastFetchRef.current === null) {
      const cached = readPriceCache();
      if (cached && cached.pairsKey === pairsKey) {
        lastFetchRef.current = { pairsKey, trigger: fetchTrigger, at: cached.at };
        setCurrentPrices((current) => ({ ...cached.prices, ...current }));
      }
    }

    const last = lastFetchRef.current;
    const fresh =
      last !== null &&
      last.pairsKey === pairsKey &&
      last.trigger === fetchTrigger &&
      last.at >= lastRefreshSlot(now);
    if (!fresh) {
      setLoading(true);
      setError(null);
      fetchBatch();
    }

    const timer = window.setTimeout(() => setSlotTick((n) => n + 1), nextRefreshSlot(now) - now);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pairsKey, fetchTrigger, active, slotTick]);

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
        toast.success(`${symbol} : ${price.toLocaleString("fr-FR")} $`);
      } else {
        // Sans retour visible, un échec était indiscernable d'une absence
        // d'effet : impossible de savoir si l'actif est inconnu ou si
        // l'appel n'a pas abouti.
        toast.error(`Aucun cours trouvé pour ${symbol}`, {
          description: "Cet actif n'est coté sur aucune des paires interrogées.",
        });
      }
    } catch (err) {
      setError(errorMessage(err, "Impossible de récupérer le cours."));
      toast.error(`Cours de ${symbol} indisponible`, { description: errorMessage(err) });
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
