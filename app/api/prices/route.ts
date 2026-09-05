import { NextRequest, NextResponse } from 'next/server';

// Symbol → CoinGecko coin id (fallback si Binance n'a pas la paire)
const GECKO_IDS: Record<string, string> = {
  KAS: 'kaspa',
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  BNB: 'binancecoin',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  DOT: 'polkadot',
  MATIC: 'matic-network',
  AVAX: 'avalanche-2',
  TRX: 'tron',
  LINK: 'chainlink',
  LTC: 'litecoin',
  TON: 'the-open-network',
};

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

async function fetchBinance(symbol: string): Promise<{ symbol: string; price: string } | null> {
  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!response.ok) return null;
    return (await response.json()) as { symbol: string; price: string };
  } catch {
    return null;
  }
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

    // 1. Tentative Binance sur les symboles manquants
    const binanceResults = await Promise.all(
      symbolsToFetch.map(async (symbol) => ({ symbol, data: await fetchBinance(symbol) }))
    );
    for (const { symbol, data } of binanceResults) {
      if (data) {
        allResults.push(data);
        resolvedPairs.add(data.symbol.toUpperCase());
        rememberPrice(symbol, data.price, now);
      }
    }

    // 2. Fallback CoinGecko pour les paires non résolues
    const missingPairs = symbolsToFetch.filter((pair) => !resolvedPairs.has(pair));
    const pairToBase: Record<string, string> = {};
    const geckoIdsToFetch: string[] = [];

    for (const pair of missingPairs) {
      // Kraken cote en EUR et en GBP : sans ces suffixes, la base ne peut pas
      // être isolée et le repli échoue silencieusement.
      const base = pair.replace(/(USDT|USDC|BUSD|FDUSD|TUSD|DAI|USD|EUR|GBP)$/, '');
      const geckoId = GECKO_IDS[base];
      if (geckoId) {
        pairToBase[pair] = geckoId;
        geckoIdsToFetch.push(geckoId);
      }
    }

    if (geckoIdsToFetch.length > 0) {
      const geckoResponse = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${Array.from(new Set(geckoIdsToFetch)).join(',')}&vs_currencies=usd`,
        {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(5000),
        }
      ).catch(() => null);

      if (geckoResponse?.ok) {
        const geckoData = (await geckoResponse.json()) as Record<string, { usd: number }>;
        for (const [pair, geckoId] of Object.entries(pairToBase)) {
          const entry = geckoData[geckoId];
          if (entry && typeof entry.usd === 'number') {
            const price = String(entry.usd);
            allResults.push({ symbol: pair, price });
            rememberPrice(pair, price, now);
          }
        }
      }
    }

    return NextResponse.json(allResults);
  } catch (error) {
    console.error('[prices] Erreur:', error);
    return NextResponse.json([], { status: 200 });
  }
}
