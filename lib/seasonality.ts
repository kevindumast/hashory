/**
 * Rendements périodiques (saisonnalité).
 *
 * Deux principes comptables gouvernent ce module.
 *
 * 1. **Une conversion est deux mouvements.** Échanger A contre B, c'est céder
 *    A et acquérir B. Ne regarder qu'un seul des deux actifs — l'actif reçu,
 *    par exemple, y compris pour une vente — fait céder un actif qu'on n'a
 *    jamais détenu.
 * 2. **Le cash n'est pas un placement.** Monnaies fiat et stablecoins dollar
 *    sont tenus au pair : en acquérir n'est pas investir, en céder ne
 *    réalise aucun gain. Sans cette règle, convertir 28 € en 32 USDC
 *    passait pour une plus-value de 32 $ — soit +101 % sur le mois.
 *
 * 3. **Tout se compte en dollars, au change du jour.** Un achat payé 100 €
 *    vaut environ 113 $ : le prendre pour 100 $ sous-estime le capital
 *    investi et fait passer l'écart de change pour un gain.
 *
 * Toutes les fonctions sont pures : la vue ne fait que les appeler.
 */

const DAY_MS = 86_400_000;

/** Fiat et stablecoins adossés au dollar : valorisés au pair, jamais « investis ». */
export const CASH_ASSETS = new Set([
  "USD", "EUR", "GBP", "CHF", "JPY", "CAD", "AUD", "TRY", "BRL", "ARS",
  "USDT", "USDC", "BUSD", "FDUSD", "TUSD", "DAI", "USDG", "PYUSD",
]);

const USD_STABLECOINS = new Set(["USD", "USDT", "USDC", "BUSD", "FDUSD", "TUSD", "DAI", "USDG", "PYUSD"]);

/** Ordre significatif : les cotations les plus longues d'abord. */
const QUOTE_ASSETS = [
  "USDT", "USDC", "BUSD", "FDUSD", "TUSD", "PYUSD", "USDG", "DAI", "USD",
  "BTC", "ETH", "BNB", "EUR", "GBP", "CHF", "TRY", "AUD", "CAD", "BRL", "ARS",
];

export function isCashAsset(asset: string): boolean {
  return CASH_ASSETS.has(asset.toUpperCase());
}

export function extractBaseAsset(symbol: string): string {
  const upper = symbol.toUpperCase();
  for (const quote of QUOTE_ASSETS) {
    if (upper.endsWith(quote)) {
      const base = upper.slice(0, upper.length - quote.length);
      if (base) return base;
    }
  }
  return upper;
}

/** Le strict nécessaire d'une opération, quelle que soit sa source. */
export type SeasonalTrade = {
  tradeType?: "SPOT" | "CONVERT" | "FIAT" | "DUST";
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  quoteQuantity?: number;
  executedAt: number;
  fromAsset?: string;
  fromAmount?: number;
  toAsset?: string;
  toAmount?: number;
};

/** Mouvement sur un actif non monétaire, valorisé en dollars. */
export type TradeLeg = {
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  valueUsd: number;
  executedAt: number;
};

/** Euros pour un dollar au jour donné (`useFxRates`), ou `null` si inconnu. */
export type EurPerUsdAt = (timestamp: number) => number | null;

/** Contre-valeur en dollars d'un montant en cash, si sa devise est connue. */
function cashToUsd(
  amount: number,
  asset: string,
  timestamp: number,
  eurPerUsdAt?: EurPerUsdAt
): number | null {
  const upper = asset.toUpperCase();
  if (USD_STABLECOINS.has(upper)) return amount;
  if (upper === "EUR" && eurPerUsdAt) {
    const rate = eurPerUsdAt(timestamp);
    if (rate && rate > 0) return amount / rate;
  }
  return null;
}

/**
 * Contre-valeur en dollars d'une conversion : la jambe en cash fait foi
 * quand il y en a une (convertie au change du jour si c'est de l'euro),
 * sinon la cotation enregistrée.
 */
function convertValueUsd(trade: SeasonalTrade, eurPerUsdAt?: EurPerUsdAt): number {
  const fromUsd =
    trade.fromAsset && trade.fromAmount !== undefined
      ? cashToUsd(trade.fromAmount, trade.fromAsset, trade.executedAt, eurPerUsdAt)
      : null;
  if (fromUsd !== null) return fromUsd;
  const toUsd =
    trade.toAsset && trade.toAmount !== undefined
      ? cashToUsd(trade.toAmount, trade.toAsset, trade.executedAt, eurPerUsdAt)
      : null;
  if (toUsd !== null) return toUsd;
  return trade.quoteQuantity ?? trade.price * trade.quantity;
}

/**
 * Mouvements d'une opération sur les actifs non monétaires. Une conversion
 * en produit jusqu'à deux (cession de l'actif donné, acquisition de l'actif
 * reçu) ; une opération entre deux formes de cash n'en produit aucun.
 */
export function tradeLegs(trade: SeasonalTrade, eurPerUsdAt?: EurPerUsdAt): TradeLeg[] {
  if (trade.tradeType === "CONVERT" && trade.fromAsset && trade.toAsset) {
    const valueUsd = convertValueUsd(trade, eurPerUsdAt);
    const legs: TradeLeg[] = [];
    if (!isCashAsset(trade.fromAsset) && (trade.fromAmount ?? 0) > 0) {
      legs.push({
        asset: trade.fromAsset.toUpperCase(),
        side: "SELL",
        quantity: trade.fromAmount!,
        valueUsd,
        executedAt: trade.executedAt,
      });
    }
    if (!isCashAsset(trade.toAsset) && (trade.toAmount ?? 0) > 0) {
      legs.push({
        asset: trade.toAsset.toUpperCase(),
        side: "BUY",
        quantity: trade.toAmount!,
        valueUsd,
        executedAt: trade.executedAt,
      });
    }
    return legs;
  }

  const asset = extractBaseAsset(trade.symbol);
  if (isCashAsset(asset) || trade.quantity <= 0) return [];
  const quote = trade.symbol.toUpperCase().slice(asset.length);
  const quoteAmount = trade.quoteQuantity ?? trade.price * trade.quantity;
  return [
    {
      asset,
      side: trade.side,
      quantity: trade.quantity,
      valueUsd: cashToUsd(quoteAmount, quote, trade.executedAt, eurPerUsdAt) ?? quoteAmount,
      executedAt: trade.executedAt,
    },
  ];
}

function sortedLegs(trades: SeasonalTrade[], eurPerUsdAt?: EurPerUsdAt): TradeLeg[] {
  return trades
    .flatMap((trade) => tradeLegs(trade, eurPerUsdAt))
    .sort((a, b) => a.executedAt - b.executedAt);
}

/** Vrai si au moins une crypto a été cédée : sinon, il n'y a rien de « réalisé ». */
export function hasCryptoDisposal(trades: SeasonalTrade[]): boolean {
  return trades.some((trade) => tradeLegs(trade).some((leg) => leg.side === "SELL"));
}

/** Actifs non monétaires acquis, dont il faut l'historique de cours. */
export function acquiredCryptoAssets(trades: SeasonalTrade[]): string[] {
  const assets = new Set<string>();
  for (const trade of trades) {
    for (const leg of tradeLegs(trade)) if (leg.side === "BUY") assets.add(leg.asset);
  }
  return Array.from(assets);
}

function startOfUtcDay(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// ─── Valeur de marché (portefeuille sans cession) ──────────────────────────

export type SimpleSnap = { dayUtc: number; valueUsd: number; netInvestedUsd: number };
export type PriceHistory = Record<string, { dayUtc: number; closeUsd: number }[]>;

/**
 * Valeur quotidienne des positions crypto (quantités × cours de clôture) et
 * capital net engagé, pour un portefeuille qui ne fait qu'acheter.
 */
export function buildDcaSnapshots(
  trades: SeasonalTrade[],
  prices: PriceHistory,
  eurPerUsdAt?: EurPerUsdAt,
  now = Date.now()
): SimpleSnap[] {
  const legs = sortedLegs(trades, eurPerUsdAt);
  if (legs.length === 0) return [];

  const holdings = new Map<string, { qty: number; avgCost: number }>();
  const cursors = new Map<string, number>();
  let netInvestedUsd = 0;
  let index = 0;

  const priceAt = (asset: string, dayUtc: number): number => {
    const series = prices[asset];
    if (!series || series.length === 0) return 0;
    let cursor = cursors.get(asset) ?? -1;
    while (cursor + 1 < series.length && series[cursor + 1].dayUtc <= dayUtc) cursor++;
    cursors.set(asset, cursor);
    return cursor >= 0 ? series[cursor].closeUsd : 0;
  };

  const result: SimpleSnap[] = [];
  const lastDay = startOfUtcDay(now);

  for (let day = startOfUtcDay(legs[0].executedAt); day <= lastDay; day += DAY_MS) {
    while (index < legs.length && legs[index].executedAt < day + DAY_MS) {
      const leg = legs[index++];
      const position = holdings.get(leg.asset) ?? { qty: 0, avgCost: 0 };
      if (leg.side === "BUY") {
        const qty = position.qty + leg.quantity;
        holdings.set(leg.asset, {
          qty,
          avgCost: qty > 0 ? (position.qty * position.avgCost + leg.valueUsd) / qty : 0,
        });
        netInvestedUsd += leg.valueUsd;
      } else {
        const sold = Math.min(leg.quantity, position.qty);
        netInvestedUsd = Math.max(0, netInvestedUsd - sold * position.avgCost);
        holdings.set(leg.asset, { qty: position.qty - sold, avgCost: position.avgCost });
      }
    }

    let valueUsd = 0;
    for (const [asset, position] of holdings) {
      if (position.qty > 0) valueUsd += position.qty * priceAt(asset, day);
    }
    result.push({ dayUtc: day, valueUsd, netInvestedUsd });
  }
  return result;
}

/**
 * Rendement mensuel par la méthode de Dietz modifiée : chaque apport ou
 * retrait est pondéré par la part du mois pendant laquelle il a été investi.
 * Un achat le 4 septembre compte pour 27/30 du capital du mois, pas pour la
 * moitié — supposer tous les flux en milieu de mois doublait ici le
 * rendement d'un premier achat.
 */
export function computeMonthlyFromSnapshots(snaps: SimpleSnap[]): Map<number, (number | null)[]> {
  if (snaps.length === 0) return new Map();
  const sorted = [...snaps].sort((a, b) => a.dayUtc - b.dayUtc);
  const minYear = new Date(sorted[0].dayUtc).getUTCFullYear();
  const maxYear = new Date(sorted[sorted.length - 1].dayUtc).getUTCFullYear();
  const result = new Map<number, (number | null)[]>();

  for (let year = minYear; year <= maxYear; year++) {
    const months: (number | null)[] = [];
    for (let month = 0; month < 12; month++) {
      const lo = Date.UTC(year, month, 1);
      const hi = Date.UTC(year, month + 1, 1);
      const inMonth = sorted.filter((snap) => snap.dayUtc >= lo && snap.dayUtc < hi);
      if (inMonth.length === 0) {
        months.push(null);
        continue;
      }

      const before = [...sorted].reverse().find((snap) => snap.dayUtc < lo) ?? null;
      const beginValue = before?.valueUsd ?? 0;
      let previousInvested = before?.netInvestedUsd ?? 0;
      let flows = 0;
      let weightedFlows = 0;

      for (const snap of inMonth) {
        const flow = snap.netInvestedUsd - previousInvested;
        previousInvested = snap.netInvestedUsd;
        if (flow === 0) continue;
        // Le flux du jour est investi jusqu'à la fin du mois.
        const weight = (hi - snap.dayUtc) / (hi - lo);
        flows += flow;
        weightedFlows += flow * weight;
      }

      const endValue = inMonth[inMonth.length - 1].valueUsd;
      const denominator = beginValue + weightedFlows;
      if (Math.abs(denominator) < 1) {
        months.push(null);
        continue;
      }
      months.push(((endValue - beginValue - flows) / denominator) * 100);
    }
    result.set(year, months);
  }
  return result;
}

// ─── Résultat réalisé (portefeuille qui cède des cryptos) ──────────────────

export type TradePoint = { timestamp: number; realizedPnl: number; costBasis: number };

/**
 * Résultat réalisé cumulé et coût des positions ouvertes, jour par jour.
 *
 * Seule la quantité dont le prix de revient est connu réalise un résultat :
 * des jetons reçus par transfert puis vendus n'ont pas de coût ici, et
 * compter leur produit entier comme un gain gonflerait le rendement.
 */
export function buildTradeHistory(
  trades: SeasonalTrade[],
  eurPerUsdAt?: EurPerUsdAt
): TradePoint[] {
  const legs = sortedLegs(trades, eurPerUsdAt);
  const holdings = new Map<string, { qty: number; avgCost: number }>();
  let realizedPnl = 0;
  let costBasis = 0;
  const byDay = new Map<number, TradePoint>();

  for (const leg of legs) {
    const position = holdings.get(leg.asset) ?? { qty: 0, avgCost: 0 };
    if (leg.side === "BUY") {
      const qty = position.qty + leg.quantity;
      holdings.set(leg.asset, {
        qty,
        avgCost: qty > 0 ? (position.qty * position.avgCost + leg.valueUsd) / qty : 0,
      });
      costBasis += leg.valueUsd;
    } else {
      const matched = Math.min(leg.quantity, position.qty);
      if (matched > 0) {
        const proceeds = leg.valueUsd * (matched / leg.quantity);
        const cost = matched * position.avgCost;
        realizedPnl += proceeds - cost;
        costBasis = Math.max(0, costBasis - cost);
      }
      holdings.set(leg.asset, { qty: position.qty - matched, avgCost: position.avgCost });
    }
    const day = startOfUtcDay(leg.executedAt);
    byDay.set(day, { timestamp: day, realizedPnl, costBasis });
  }

  return Array.from(byDay.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/** Résultat réalisé du mois rapporté au coût des positions en début de mois. */
export function computeMonthlyFromTrades(history: TradePoint[]): Map<number, (number | null)[]> {
  if (history.length === 0) return new Map();
  const minYear = new Date(history[0].timestamp).getUTCFullYear();
  const maxYear = new Date(history[history.length - 1].timestamp).getUTCFullYear();
  const result = new Map<number, (number | null)[]>();

  for (let year = minYear; year <= maxYear; year++) {
    const months: (number | null)[] = [];
    for (let month = 0; month < 12; month++) {
      const lo = Date.UTC(year, month, 1);
      const hi = Date.UTC(year, month + 1, 1);
      const end = [...history].reverse().find((p) => p.timestamp >= lo && p.timestamp < hi) ?? null;
      if (!end) {
        months.push(null);
        continue;
      }
      const start = [...history].reverse().find((p) => p.timestamp < lo) ?? null;
      const gain = end.realizedPnl - (start?.realizedPnl ?? 0);
      const base = Math.max(start?.costBasis ?? end.costBasis, 1);
      months.push((gain / base) * 100);
    }
    result.set(year, months);
  }
  return result;
}

// ─── Agrégation ────────────────────────────────────────────────────────────

/** Les rendements se composent : +10 % puis +10 % font +21 %, pas +20 %. */
export function compoundReturns(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) return null;
  return (known.reduce((acc, v) => acc * (1 + v / 100), 1) - 1) * 100;
}

const QUARTER_MONTHS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]];

export function computeQuarterlyReturns(
  monthly: Map<number, (number | null)[]>
): Map<number, (number | null)[]> {
  const result = new Map<number, (number | null)[]>();
  for (const [year, months] of monthly) {
    result.set(year, QUARTER_MONTHS.map((quarter) => compoundReturns(quarter.map((m) => months[m]))));
  }
  return result;
}
