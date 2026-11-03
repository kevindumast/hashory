/**
 * Rétrospective annuelle : ce que l'année dit de vos habitudes, de vos frais
 * et de vos décisions.
 *
 * Tout est calculé à partir des opérations déjà chargées par le tableau de
 * bord et des cours du jour : aucune lecture supplémentaire en base.
 */

import { EUR_STABLECOINS, USD_STABLECOINS, isFiat, normalizeAsset, type Amount } from "./ledger";

export type RecapOperation =
  | {
      kind: "exchange";
      timestamp: number;
      account: string;
      given: Amount;
      received: Amount;
      fee?: Amount;
    }
  | {
      kind: "deposit" | "withdrawal";
      timestamp: number;
      account: string;
      asset: string;
      quantity: number;
      fee?: number;
    };

/** Cours et change utilisés pour chiffrer en dollars. */
export type RecapValuation = {
  /** Cours actuel d'un actif, en dollars ; null s'il est inconnu. */
  priceUsd: (asset: string) => number | null;
  /** Dollars pour un euro au jour donné ; null s'il est inconnu. */
  usdPerEurAt: (timestamp: number) => number | null;
  /** Dollars pour un euro aujourd'hui. */
  usdPerEurNow: number | null;
};

/** Lecture calendaire d'un instant, dans le fuseau de l'utilisateur. */
export type CalendarView = {
  year: number;
  /** 0 = janvier. */
  month: number;
  /** 0 = lundi, 6 = dimanche. */
  weekday: number;
  hour: number;
  /** Identifiant du jour civil, croissant d'une unité par jour. */
  dayKey: number;
};

export const localCalendar = (timestamp: number): CalendarView => {
  const date = new Date(timestamp);
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    weekday: (date.getDay() + 6) % 7,
    hour: date.getHours(),
    dayKey: Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000),
  };
};

export const WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

// ─── Valorisation ─────────────────────────────────────────────────────────

const isUsdMoney = (asset: string) => asset === "USD" || USD_STABLECOINS.has(asset);
const isEurMoney = (asset: string) => asset === "EUR" || EUR_STABLECOINS.has(asset);

/** Monnaie ou stablecoin : sa valeur ne dépend pas du marché crypto. */
export function isMoney(asset: string): boolean {
  const normalized = normalizeAsset(asset);
  return isFiat(normalized) || USD_STABLECOINS.has(normalized) || EUR_STABLECOINS.has(normalized);
}

/** Valeur en dollars d'une somme d'argent au jour donné ; null pour un actif volatil. */
function moneyValueAt(amount: Amount, timestamp: number, valuation: RecapValuation): number | null {
  const asset = normalizeAsset(amount.asset);
  if (isUsdMoney(asset)) return amount.quantity;
  if (isEurMoney(asset)) {
    const rate = valuation.usdPerEurAt(timestamp);
    return rate === null ? null : amount.quantity * rate;
  }
  return null;
}

/** Valeur en dollars aujourd'hui : cours du jour pour une crypto, change du jour pour l'euro. */
function valueToday(amount: Amount, valuation: RecapValuation): number | null {
  const asset = normalizeAsset(amount.asset);
  if (isUsdMoney(asset)) return amount.quantity;
  if (isEurMoney(asset)) return valuation.usdPerEurNow === null ? null : amount.quantity * valuation.usdPerEurNow;
  if (isFiat(asset)) return null;
  const price = valuation.priceUsd(asset);
  return price === null ? null : amount.quantity * price;
}

// ─── Résultat ─────────────────────────────────────────────────────────────

export type Verdict = {
  timestamp: number;
  account: string;
  given: Amount;
  received: Amount;
  /** Ce que vaudrait aujourd'hui ce qui a été cédé. */
  givenTodayUsd: number;
  /** Ce que vaut aujourd'hui ce qui a été obtenu. */
  receivedTodayUsd: number;
  /** Positif : la décision a payé. Négatif : garder aurait mieux valu. */
  deltaUsd: number;
};

export type Profile = { id: string; title: string; description: string; strength: number };

export type Recap = {
  year: number;
  operationCount: number;
  exchangeCount: number;
  depositCount: number;
  withdrawalCount: number;
  activeDays: number;
  /** Plus long intervalle sans opération entre deux jours actifs, en jours. */
  longestPauseDays: number | null;
  busiestDay: { timestamp: number; count: number } | null;
  /** Opérations par mois, janvier en tête. */
  monthly: number[];
  /** Opérations par jour de semaine (lundi en tête) et par heure. */
  heatmap: number[][];
  /** Argent placé : monnaie et stablecoins cédés contre des cryptos, au change du jour. */
  investedUsd: number;
  /** Argent récupéré : monnaie et stablecoins obtenus en cédant des cryptos. */
  cashedOutUsd: number;
  topAssets: { asset: string; count: number }[];
  /** Actifs détenus pour la première fois cette année. */
  discoveries: string[];
  accounts: { account: string; count: number }[];
  fees: {
    totalUsd: number;
    /** Part des frais payés en crypto, chiffrés au cours d'aujourd'hui. */
    cryptoUsd: number;
    unpricedCount: number;
    byAccount: { account: string; usd: number }[];
  };
  largestPurchase: { timestamp: number; account: string; asset: string; quantity: number; usd: number } | null;
  verdicts: {
    items: Verdict[];
    totalDeltaUsd: number;
    /** Cessions qu'aucun cours ne permet de rejuger. */
    unpricedCount: number;
  };
  profiles: Profile[];
};

const DUST_USD = 1;

function sortedCounts(map: Map<string, number>): { key: string; value: number }[] {
  return [...map.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
}

/** Années couvertes par les opérations, de la plus récente à la plus ancienne. */
export function recapYears(operations: RecapOperation[], calendar: (t: number) => CalendarView = localCalendar): number[] {
  return [...new Set(operations.map((op) => calendar(op.timestamp).year))].sort((a, b) => b - a);
}

function assetsOf(op: RecapOperation): string[] {
  return op.kind === "exchange"
    ? [normalizeAsset(op.given.asset), normalizeAsset(op.received.asset)]
    : [normalizeAsset(op.asset)];
}

/** Actifs entrant dans le portefeuille lors d'une opération. */
function acquiredBy(op: RecapOperation): string | null {
  if (op.kind === "exchange") return normalizeAsset(op.received.asset);
  if (op.kind === "deposit") return normalizeAsset(op.asset);
  return null;
}

export function computeRecap(
  operations: RecapOperation[],
  year: number,
  valuation: RecapValuation,
  calendar: (t: number) => CalendarView = localCalendar
): Recap {
  const sorted = [...operations].sort((a, b) => a.timestamp - b.timestamp);

  // Première acquisition de chaque actif, toutes années confondues.
  const firstSeenYear = new Map<string, number>();
  for (const op of sorted) {
    const asset = acquiredBy(op);
    if (asset && !isMoney(asset) && !firstSeenYear.has(asset)) firstSeenYear.set(asset, calendar(op.timestamp).year);
  }

  const ops = sorted.filter((op) => calendar(op.timestamp).year === year);

  const monthly = Array.from({ length: 12 }, () => 0);
  const heatmap = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  const perDay = new Map<number, { count: number; timestamp: number }>();
  const assetCounts = new Map<string, number>();
  const accountCounts = new Map<string, number>();
  const feeByAccount = new Map<string, number>();
  const fiatBuyWeekdays = Array.from({ length: 7 }, () => 0);

  let exchangeCount = 0;
  let depositCount = 0;
  let withdrawalCount = 0;
  let investedUsd = 0;
  let cashedOutUsd = 0;
  let feeTotal = 0;
  let feeCrypto = 0;
  let feeUnpriced = 0;
  let nightOps = 0;
  let morningOps = 0;
  let weekendOps = 0;
  let disposals = 0;
  let fiatBuys = 0;
  let largestPurchase: Recap["largestPurchase"] = null;
  const verdicts: Verdict[] = [];
  let verdictUnpriced = 0;

  const addFee = (account: string, fee: Amount, timestamp: number) => {
    if (!(fee.quantity > 0)) return;
    const atTime = moneyValueAt(fee, timestamp, valuation);
    const usd = atTime ?? valueToday(fee, valuation);
    if (usd === null) {
      feeUnpriced += 1;
      return;
    }
    feeTotal += usd;
    if (atTime === null) feeCrypto += usd;
    feeByAccount.set(account, (feeByAccount.get(account) ?? 0) + usd);
  };

  for (const op of ops) {
    const cal = calendar(op.timestamp);
    monthly[cal.month] += 1;
    heatmap[cal.weekday][cal.hour] += 1;
    const day = perDay.get(cal.dayKey);
    perDay.set(cal.dayKey, { count: (day?.count ?? 0) + 1, timestamp: day?.timestamp ?? op.timestamp });
    if (cal.hour >= 22 || cal.hour < 6) nightOps += 1;
    if (cal.hour >= 6 && cal.hour < 9) morningOps += 1;
    if (cal.weekday >= 5) weekendOps += 1;
    accountCounts.set(op.account, (accountCounts.get(op.account) ?? 0) + 1);
    for (const asset of new Set(assetsOf(op))) {
      if (!isMoney(asset)) assetCounts.set(asset, (assetCounts.get(asset) ?? 0) + 1);
    }

    if (op.kind !== "exchange") {
      if (op.kind === "deposit") depositCount += 1;
      else withdrawalCount += 1;
      if (op.fee) addFee(op.account, { asset: op.asset, quantity: op.fee }, op.timestamp);
      continue;
    }

    exchangeCount += 1;
    if (op.fee) addFee(op.account, op.fee, op.timestamp);

    const givenIsMoney = isMoney(op.given.asset);
    const receivedIsMoney = isMoney(op.received.asset);

    if (givenIsMoney && !receivedIsMoney) {
      const usd = moneyValueAt(op.given, op.timestamp, valuation);
      if (usd !== null) {
        investedUsd += usd;
        if (!largestPurchase || usd > largestPurchase.usd) {
          largestPurchase = {
            timestamp: op.timestamp,
            account: op.account,
            asset: normalizeAsset(op.received.asset),
            quantity: op.received.quantity,
            usd,
          };
        }
      }
      if (isFiat(normalizeAsset(op.given.asset))) {
        fiatBuys += 1;
        fiatBuyWeekdays[cal.weekday] += 1;
      }
    }

    if (!givenIsMoney) {
      disposals += 1;
      if (receivedIsMoney) {
        const usd = moneyValueAt(op.received, op.timestamp, valuation);
        if (usd !== null) cashedOutUsd += usd;
      }
      // Le verdict : ce qui a été cédé, et ce qui a été obtenu, au cours d'aujourd'hui.
      const givenToday = valueToday(op.given, valuation);
      const receivedToday = valueToday(op.received, valuation);
      if (givenToday === null || receivedToday === null) {
        verdictUnpriced += 1;
      } else if (Math.max(givenToday, receivedToday) >= DUST_USD) {
        verdicts.push({
          timestamp: op.timestamp,
          account: op.account,
          given: { asset: normalizeAsset(op.given.asset), quantity: op.given.quantity },
          received: { asset: normalizeAsset(op.received.asset), quantity: op.received.quantity },
          givenTodayUsd: givenToday,
          receivedTodayUsd: receivedToday,
          deltaUsd: receivedToday - givenToday,
        });
      }
    }
  }

  // Plus longue pause entre deux jours actifs.
  const days = [...perDay.keys()].sort((a, b) => a - b);
  let longestPauseDays: number | null = null;
  for (let i = 1; i < days.length; i++) {
    const gap = days[i] - days[i - 1] - 1;
    if (longestPauseDays === null || gap > longestPauseDays) longestPauseDays = gap;
  }

  let busiestDay: Recap["busiestDay"] = null;
  for (const entry of perDay.values()) {
    if (!busiestDay || entry.count > busiestDay.count) busiestDay = { timestamp: entry.timestamp, count: entry.count };
  }

  const total = ops.length;
  const distinctAssets = assetCounts.size;
  const profiles: Profile[] = [];
  if (total >= 10 && nightOps / total >= 0.25) {
    profiles.push({
      id: "night",
      title: "Oiseau de nuit",
      description: `${Math.round((nightOps / total) * 100)} % de vos opérations entre 22 h et 6 h.`,
      strength: nightOps / total,
    });
  }
  if (total >= 10 && morningOps / total >= 0.25) {
    profiles.push({
      id: "morning",
      title: "Lève-tôt",
      description: `${Math.round((morningOps / total) * 100)} % de vos opérations entre 6 h et 9 h.`,
      strength: morningOps / total,
    });
  }
  if (total >= 10 && weekendOps / total >= 0.4) {
    profiles.push({
      id: "weekend",
      title: "Investisseur du week-end",
      description: `${Math.round((weekendOps / total) * 100)} % de vos opérations le samedi ou le dimanche.`,
      strength: weekendOps / total,
    });
  }
  const favouriteWeekday = fiatBuyWeekdays.indexOf(Math.max(...fiatBuyWeekdays));
  const weekdayShare = fiatBuys > 0 ? fiatBuyWeekdays[favouriteWeekday] / fiatBuys : 0;
  if (fiatBuys >= 6 && weekdayShare >= 0.6) {
    profiles.push({
      id: "dca",
      title: "Investissement programmé",
      description: `${fiatBuys} achats en monnaie, dont ${Math.round(weekdayShare * 100)} % le ${WEEKDAYS[favouriteWeekday]} : la régularité plutôt que le timing.`,
      strength: weekdayShare,
    });
  }
  if (distinctAssets >= 15) {
    profiles.push({
      id: "collector",
      title: "Collectionneur",
      description: `${distinctAssets} cryptos différentes touchées dans l'année.`,
      strength: Math.min(1, distinctAssets / 30),
    });
  }
  if (exchangeCount > 0 && disposals === 0) {
    profiles.push({
      id: "diamond",
      title: "Mains de diamant",
      description: "Aucune crypto cédée de l'année : vous n'avez fait qu'accumuler.",
      strength: 1,
    });
  }
  profiles.sort((a, b) => b.strength - a.strength);

  return {
    year,
    operationCount: total,
    exchangeCount,
    depositCount,
    withdrawalCount,
    activeDays: perDay.size,
    longestPauseDays,
    busiestDay,
    monthly,
    heatmap,
    investedUsd,
    cashedOutUsd,
    topAssets: sortedCounts(assetCounts).slice(0, 5).map(({ key, value }) => ({ asset: key, count: value })),
    discoveries: [...firstSeenYear.entries()]
      .filter(([, firstYear]) => firstYear === year)
      .map(([asset]) => asset)
      .sort(),
    accounts: sortedCounts(accountCounts).map(({ key, value }) => ({ account: key, count: value })),
    fees: {
      totalUsd: feeTotal,
      cryptoUsd: feeCrypto,
      unpricedCount: feeUnpriced,
      byAccount: sortedCounts(feeByAccount).map(({ key, value }) => ({ account: key, usd: value })),
    },
    largestPurchase,
    verdicts: {
      items: verdicts,
      totalDeltaUsd: verdicts.reduce((sum, v) => sum + v.deltaUsd, 0),
      unpricedCount: verdictUnpriced,
    },
    profiles,
  };
}
