/**
 * Valorisation : combien vaut un actif, en dollars et en euros, à une date.
 *
 * Trois sources, par ordre de préférence :
 *
 * 1. Le **pair** pour le cash : 1 $ pour le dollar et ses stablecoins,
 *    le change du jour pour l'euro et les stablecoins euro.
 * 2. Le **cours de clôture** du jour, ou à défaut le dernier connu avant.
 * 3. Le **prix implicite** des transactions de l'utilisateur, quand aucun
 *    cours de marché n'existe encore : un jeton acheté 100 USDC vaut 100 $
 *    le jour de l'achat, pas zéro. Sans ce repli, acheter un jeton absent
 *    de l'historique de cours passait pour une perte de 100 %.
 *
 * Aucune valeur n'est extrapolée vers le futur : un cours postérieur à la
 * date demandée n'était pas connu ce jour-là.
 */

import { createFxResolver, type FxPoint } from "./fx";
import {
  EUR_STABLECOINS,
  FIAT_CURRENCIES,
  USD_STABLECOINS,
  normalizeAsset,
  type Operation,
} from "./ledger";

const DAY_MS = 86_400_000;

export type PricePoint = { dayUtc: number; closeUsd: number };
export type PriceSeries = Record<string, PricePoint[]>;

export function startOfUtcDay(timestamp: number): number {
  return Math.floor(timestamp / DAY_MS) * DAY_MS;
}

export type PriceBook = {
  /** Cours en dollars à la date, ou `null` si rien ne permet de l'établir. */
  usd(asset: string, timestamp: number): number | null;
  /** Euros pour un dollar à la date, ou `null` sans historique de change. */
  eurPerUsd(timestamp: number): number | null;
  /** Cours en euros à la date. */
  eur(asset: string, timestamp: number): number | null;
};

/** Dernier point à la date ou avant, par dichotomie. */
function lastAtOrBefore(series: PricePoint[], day: number): PricePoint | null {
  let low = 0;
  let high = series.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (series[middle].dayUtc <= day) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found >= 0 ? series[found] : null;
}

function sortSeries(series: PriceSeries): PriceSeries {
  const sorted: PriceSeries = {};
  for (const [asset, points] of Object.entries(series)) {
    sorted[normalizeAsset(asset)] = points
      .filter((point) => point.closeUsd > 0 && Number.isFinite(point.closeUsd))
      .sort((a, b) => a.dayUtc - b.dayUtc);
  }
  return sorted;
}

export function createPriceBook(options: {
  prices: PriceSeries;
  fx: FxPoint[];
  /** Prix implicites des transactions (`impliedPrices`), en repli. */
  implied?: PriceSeries;
}): PriceBook {
  const market = sortSeries(options.prices);
  const implied = sortSeries(options.implied ?? {});
  const rateAt = createFxResolver(options.fx);

  const eurPerUsd = (timestamp: number): number | null => {
    const point = rateAt(timestamp);
    return point && point.eurPerUsd > 0 ? point.eurPerUsd : null;
  };

  const usd = (rawAsset: string, timestamp: number): number | null => {
    const asset = normalizeAsset(rawAsset);
    if (asset === "USD" || USD_STABLECOINS.has(asset)) return 1;
    if (asset === "EUR" || EUR_STABLECOINS.has(asset)) {
      const rate = eurPerUsd(timestamp);
      return rate ? 1 / rate : null;
    }
    if (FIAT_CURRENCIES.has(asset)) return null;

    const day = startOfUtcDay(timestamp);
    const fromMarket = market[asset] ? lastAtOrBefore(market[asset], day) : null;
    if (fromMarket) return fromMarket.closeUsd;
    const fromTrades = implied[asset] ? lastAtOrBefore(implied[asset], day) : null;
    return fromTrades ? fromTrades.closeUsd : null;
  };

  const eur = (rawAsset: string, timestamp: number): number | null => {
    const asset = normalizeAsset(rawAsset);
    if (asset === "EUR" || EUR_STABLECOINS.has(asset)) return 1;
    const price = usd(asset, timestamp);
    const rate = eurPerUsd(timestamp);
    return price !== null && rate !== null ? price * rate : null;
  };

  return { usd, eurPerUsd, eur };
}

/**
 * Le même carnet, exprimé en euros : `usd()` y rend des euros. Le moteur de
 * performance ne connaît pas la devise de ses montants ; lui passer ce
 * carnet donne une comptabilité en euros, chaque opération valorisée au
 * change de son jour. Un achat payé 30 € coûte alors 30 €, et non « 34,87 $ »
 * reconvertis au change d'aujourd'hui.
 */
export function inEuros(book: PriceBook): PriceBook {
  return {
    usd: book.eur,
    eur: book.eur,
    eurPerUsd: () => 1,
  };
}

/** Vrai pour le fiat et les stablecoins : valorisés au pair, sans cours. */
export function isCashLike(asset: string): boolean {
  const upper = normalizeAsset(asset);
  return FIAT_CURRENCIES.has(upper) || USD_STABLECOINS.has(upper) || EUR_STABLECOINS.has(upper);
}

/**
 * Prix implicites tirés des échanges contre du cash : un achat de 0,3 SOL
 * pour 32 USDC donne un cours de 106,7 $ ce jour-là. Moyenne pondérée par
 * les volumes quand un actif s'échange plusieurs fois dans la journée.
 */
export function impliedPrices(operations: Operation[], fx: FxPoint[]): PriceSeries {
  const cashBook = createPriceBook({ prices: {}, fx });
  const byAssetDay = new Map<string, Map<number, { usd: number; quantity: number }>>();

  for (const operation of operations) {
    if (operation.kind !== "exchange") continue;
    const { given, received } = operation;
    const givenIsCash = isCashLike(given.asset);
    const receivedIsCash = isCashLike(received.asset);
    if (givenIsCash === receivedIsCash) continue;

    const cash = givenIsCash ? given : received;
    const crypto = givenIsCash ? received : given;
    const cashUsd = cashBook.usd(cash.asset, operation.timestamp);
    if (cashUsd === null || !(crypto.quantity > 0)) continue;

    const day = startOfUtcDay(operation.timestamp);
    const days = byAssetDay.get(crypto.asset) ?? new Map<number, { usd: number; quantity: number }>();
    const entry = days.get(day) ?? { usd: 0, quantity: 0 };
    entry.usd += cash.quantity * cashUsd;
    entry.quantity += crypto.quantity;
    days.set(day, entry);
    byAssetDay.set(crypto.asset, days);
  }

  const series: PriceSeries = {};
  for (const [asset, days] of byAssetDay) {
    series[asset] = Array.from(days.entries())
      .map(([dayUtc, entry]) => ({ dayUtc, closeUsd: entry.usd / entry.quantity }))
      .sort((a, b) => a.dayUtc - b.dayUtc);
  }
  return series;
}

/** Actifs qu'il faut coter : ni fiat, ni stablecoin. */
export function assetsToPrice(operations: Operation[]): string[] {
  const assets = new Set<string>();
  for (const operation of operations) {
    const touched =
      operation.kind === "exchange"
        ? [operation.given.asset, operation.received.asset, operation.fee?.asset]
        : [operation.asset];
    for (const asset of touched) {
      if (asset && !isCashLike(asset)) assets.add(asset);
    }
  }
  return Array.from(assets).sort();
}
