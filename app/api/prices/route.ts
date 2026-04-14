import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { symbols } = await request.json();

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json([], { status: 200 });
    }

    // Deduplicate les symboles
    const uniqueSymbols = Array.from(new Set(symbols.map((s: string) => s.toUpperCase())));

    // Requête individuelles pour chaque symbole
    const allResults: Array<{ symbol: string; price: string }> = [];

    for (const symbol of uniqueSymbols) {
      try {
        const response = await fetch(
          `https://api.binance.com/api/v3/ticker/price?symbol=${symbol.toUpperCase()}`,
          {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(5000),
          }
        );

        if (response.ok) {
          const data = await response.json();
          allResults.push(data);
        }
      } catch (err) {
        // Continuer si un symbole échoue
        console.warn(`[Binance] Erreur pour ${symbol}:`, err instanceof Error ? err.message : 'erreur inconnue');
      }
    }

    console.log(`[Binance API] ${allResults.length}/${uniqueSymbols.length} prix récupérés`);
    return NextResponse.json(allResults);
  } catch (error) {
    console.error('[Binance API] Erreur:', error);
    return NextResponse.json([], { status: 200 });
  }
}
