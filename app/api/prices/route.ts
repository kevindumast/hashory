import { NextRequest, NextResponse } from 'next/server';


/** Devises de cotation à retirer pour retrouver l'actif de base. */
const QUOTE_SUFFIXES = /(USDT|USDC|BUSD|FDUSD|TUSD|DAI|USD|EUR|GBP)$/;

/* ─── Cache mémoire ───────────────────────────────────────────────
   Le dashboard redemande les mêmes symboles à chaque rafraîchissement.
   Un cache au niveau module suffit à absorber ces rafales : il vit le
   temps de l'instance serverless, reste borné, et n'appelle Binance ou
   CoinGecko que pour les symboles réellement périmés.
   ─────────────────────────────────────────────────────────────── */

const PRICE_TTL_MS = 60_000;
const MAX_CACHED_SYMBOLS = 500;

type CachedPrice = { price: string; fetchedAt: number };

const priceCache = new Map<string, CachedPrice>();

/**
 * Purge les entrées expirées, puis évince les plus anciennes si le cache
 * dépasse encore sa borne — l'ordre d'insertion d'une Map fait foi.
 */
function pruneCache(now: number): void {
  for (const [symbol, cached] of priceCache) {
    if (now - cached.fetchedAt >= PRICE_TTL_MS) {
      priceCache.delete(symbol);
    }
  }

  let overflow = priceCache.size - MAX_CACHED_SYMBOLS;
  if (overflow <= 0) return;

  for (const symbol of priceCache.keys()) {
    priceCache.delete(symbol);
    if (--overflow <= 0) break;
  }
}

/** Réinsère systématiquement en fin de Map pour garder l'ordre chronologique. */
function rememberPrice(symbol: string, price: string, fetchedAt: number): void {
  priceCache.delete(symbol);
  priceCache.set(symbol, { price, fetchedAt });
}

/** Prix encore frais pour ce symbole, sinon null (l'entrée périmée est jetée). */
function readFreshPrice(symbol: string, now: number): string | null {
  const cached = priceCache.get(symbol);
  if (!cached) return null;

  if (now - cached.fetchedAt >= PRICE_TTL_MS) {
    priceCache.delete(symbol);
    return null;
  }

  return cached.price;
}

/**
 * Instantané de tous les cours Binance, en un seul appel.
 *
 * Interroger une paire à la fois paraissait économe, mais le tableau de bord
 * en demande près d'une centaine : autant de requêtes simultanées, dont
 * Binance rejette une partie. Le symptôme était trompeur — quelques actifs
 * sans cours, différents à chaque chargement — parce que rien ne distingue
 * un actif inconnu d'un appel refusé.
 *
 * L'endpoint sans paramètre renvoie l'ensemble des paires d'un coup. Une
 * requête suffit donc, quel que soit le nombre d'actifs détenus.
 */
let binanceSnapshot: { fetchedAt: number; prices: Map<string, string> } | null = null;

async function fetchBinanceSnapshot(now: number): Promise<Map<string, string>> {
  if (binanceSnapshot && now - binanceSnapshot.fetchedAt < PRICE_TTL_MS) {
    return binanceSnapshot.prices;
  }

  try {
    const response = await fetch('https://api.binance.com/api/v3/ticker/price', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Binance a répondu ${response.status}`);

    const rows = (await response.json()) as Array<{ symbol: string; price: string }>;
    const prices = new Map(rows.map((row) => [row.symbol.toUpperCase(), row.price]));
    binanceSnapshot = { fetchedAt: now, prices };
    return prices;
  } catch (error) {
    console.error('[prices] instantané Binance indisponible', error);
    // Mieux vaut un instantané légèrement daté que plus aucun cours.
    return binanceSnapshot?.prices ?? new Map();
  }
}

/** Au-delà, CoinGecko tronque la réponse : on découpe la demande. */
const COINGECKO_BATCH = 50;

/**
 * Cours en dollars pour une liste de symboles, via CoinGecko.
 *
 * Le premier résultat rendu pour un symbole donné est retenu : l'endpoint
 * classe par capitalisation décroissante, donc c'est la pièce dominante qui
 * l'emporte lorsque plusieurs partagent le même symbole.
 */
async function fetchCoinGeckoBySymbols(symbols: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  if (symbols.length === 0) return prices;

  for (let index = 0; index < symbols.length; index += COINGECKO_BATCH) {
    const chunk = symbols.slice(index, index + COINGECKO_BATCH);
    const query = chunk.map((symbol) => symbol.toLowerCase()).join(',');

    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&symbols=${query}`,
        { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) }
      );
      if (!response.ok) continue;

      const rows = (await response.json()) as Array<{ symbol?: string; current_price?: number }>;
      if (!Array.isArray(rows)) continue;

      for (const row of rows) {
        if (!row.symbol || typeof row.current_price !== 'number') continue;
        const symbol = row.symbol.toUpperCase();
        if (!prices.has(symbol)) prices.set(symbol, row.current_price);
      }
    } catch (error) {
      console.error('[prices] repli CoinGecko indisponible', error);
    }
  }

  return prices;
}

export async function POST(request: NextRequest) {
  try {
    const { symbols } = await request.json();

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json([], { status: 200 });
    }

    const uniqueSymbols = Array.from(new Set(symbols.map((s: string) => s.toUpperCase())));
    const allResults: Array<{ symbol: string; price: string }> = [];
    const resolvedPairs = new Set<string>();

    const now = Date.now();
    pruneCache(now);

    // 0. Ce que le cache couvre déjà : aucun appel réseau pour ces symboles.
    const symbolsToFetch: string[] = [];
    for (const symbol of uniqueSymbols) {
      const cachedPrice = readFreshPrice(symbol, now);
      if (cachedPrice !== null) {
        allResults.push({ symbol, price: cachedPrice });
        resolvedPairs.add(symbol);
      } else {
        symbolsToFetch.push(symbol);
      }
    }

    // 1. Résolution depuis l'instantané Binance, en un seul appel réseau.
    if (symbolsToFetch.length > 0) {
      const snapshot = await fetchBinanceSnapshot(now);
      for (const symbol of symbolsToFetch) {
        const price = snapshot.get(symbol);
        if (price) {
          allResults.push({ symbol, price });
          resolvedPairs.add(symbol);
          rememberPrice(symbol, price, now);
        }
      }
    }

    // 2. Repli CoinGecko, interrogé par symbole.
    //
    // Binance est injoignable depuis la plupart des hébergeurs, dont les
    // plages d'adresses sont filtrées : en production, ce repli n'est pas un
    // secours mais la source principale. Il ne pouvait donc pas reposer sur
    // une liste de pièces écrite à la main — c'est ce qui privait de cours
    // tout actif absent de cette liste, quinze en tout.
    //
    // L'endpoint accepte directement des symboles et trie par capitalisation,
    // ce qui tranche naturellement le cas des symboles homonymes.
    //
    // Il rend par ailleurs toujours des dollars, quelle que soit la devise de
    // cotation de la paire d'origine. C'est ce que le reste de l'application
    // attend, et cela corrige au passage les paires libellées en euros, dont
    // le cours aurait autrement été pris pour des dollars.
    const missingPairs = symbolsToFetch.filter((pair) => !resolvedPairs.has(pair));

    if (missingPairs.length > 0) {
      const baseBySymbol = new Map<string, string[]>();
      for (const pair of missingPairs) {
        const base = pair.replace(QUOTE_SUFFIXES, '');
        if (!base) continue;
        const pairs = baseBySymbol.get(base) ?? [];
        pairs.push(pair);
        baseBySymbol.set(base, pairs);
      }

      const prices = await fetchCoinGeckoBySymbols(Array.from(baseBySymbol.keys()));

      for (const [base, pairs] of baseBySymbol) {
        const price = prices.get(base);
        if (price === undefined) continue;
        for (const pair of pairs) {
          allResults.push({ symbol: pair, price: String(price) });
          rememberPrice(pair, String(price), now);
        }
      }
    }

    return NextResponse.json(allResults);
  } catch (error) {
    console.error('[prices] Erreur:', error);
    return NextResponse.json([], { status: 200 });
  }
}
