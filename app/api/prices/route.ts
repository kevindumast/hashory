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

    // 1. Tentative Binance
    const binanceResults = await Promise.all(uniqueSymbols.map(fetchBinance));
    for (const result of binanceResults) {
      if (result) {
        allResults.push(result);
        resolvedPairs.add(result.symbol.toUpperCase());
      }
    }

    // 2. Fallback CoinGecko pour les paires non résolues
    const missingPairs = uniqueSymbols.filter((pair) => !resolvedPairs.has(pair));
    const pairToBase: Record<string, string> = {};
    const geckoIdsToFetch: string[] = [];

    for (const pair of missingPairs) {
      const base = pair.replace(/(USDT|USDC|BUSD|USD|FDUSD|TUSD|DAI)$/, '');
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
            allResults.push({ symbol: pair, price: String(entry.usd) });
          }
        }
      }
    }

    console.log(`[prices] ${allResults.length}/${uniqueSymbols.length} prix récupérés`);
    return NextResponse.json(allResults);
  } catch (error) {
    console.error('[prices] Erreur:', error);
    return NextResponse.json([], { status: 200 });
  }
}
