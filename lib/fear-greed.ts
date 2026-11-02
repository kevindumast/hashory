/**
 * Indice Fear & Greed, confronté aux décisions du portefeuille.
 *
 * L'indice seul dit l'humeur du marché, pas la vôtre. Ce module le croise
 * avec les achats et les ventes réellement passés : achetez-vous quand tout
 * le monde a peur, ou quand tout le monde s'emballe ? Tout y est pur et
 * testé ; la collecte de l'indice vit dans `convex/fearGreed.ts`.
 */

import type { Operation } from "./ledger";
import { exchangeValueUsd } from "./portfolio-history";
import { isCashLike, startOfUtcDay, type PriceBook } from "./valuation";

export type FearGreedPoint = { dayUtc: number; value: number };

export type FearGreedZone = "extreme-fear" | "fear" | "neutral" | "greed" | "extreme-greed";

/**
 * Découpage de l'échelle 0–100, borne haute incluse. Les seuils suivent
 * ceux de la source (alternative.me) à quelques points près : on les fixe
 * ici pour que l'historique entier se lise avec la même grille.
 */
export const FEAR_GREED_ZONES: { id: FearGreedZone; label: string; min: number; max: number }[] = [
  { id: "extreme-fear", label: "Peur extrême", min: 0, max: 24 },
  { id: "fear", label: "Peur", min: 25, max: 44 },
  { id: "neutral", label: "Neutre", min: 45, max: 55 },
  { id: "greed", label: "Avidité", min: 56, max: 75 },
  { id: "extreme-greed", label: "Avidité extrême", min: 76, max: 100 },
];

export function zoneOf(value: number): FearGreedZone {
  for (const zone of FEAR_GREED_ZONES) {
    if (value <= zone.max) return zone.id;
  }
  return "extreme-greed";
}

export function zoneLabel(zone: FearGreedZone): string {
  return FEAR_GREED_ZONES.find((entry) => entry.id === zone)?.label ?? zone;
}

// ─── Décisions du portefeuille ───────────────────────────────────────────

export type TradeFlowDay = {
  dayUtc: number;
  /** Monnaie ou stablecoin échangés contre un actif risqué, en dollars. */
  boughtUsd: number;
  /** Actif risqué rendu contre monnaie ou stablecoin, en dollars. */
  soldUsd: number;
};

/**
 * Achats et ventes du portefeuille, cumulés par jour.
 *
 * Seuls comptent les échanges qui changent l'exposition au marché : de la
 * monnaie vers un actif (achat), ou l'inverse (vente). Un échange entre
 * deux cryptos ne dit rien de l'humeur à laquelle on cède, et les
 * conversions de poussière ne sont pas des décisions.
 */
export function dailyTradeFlows(operations: Operation[], book: PriceBook): TradeFlowDay[] {
  const byDay = new Map<number, TradeFlowDay>();

  for (const operation of operations) {
    if (operation.kind !== "exchange" || operation.origin === "dust") continue;
    const givesCash = isCashLike(operation.given.asset);
    const receivesCash = isCashLike(operation.received.asset);
    if (givesCash === receivesCash) continue;

    const valueUsd = exchangeValueUsd(operation, book);
    if (!Number.isFinite(valueUsd) || valueUsd <= 0) continue;

    const dayUtc = startOfUtcDay(operation.timestamp);
    const day = byDay.get(dayUtc) ?? { dayUtc, boughtUsd: 0, soldUsd: 0 };
    if (givesCash) day.boughtUsd += valueUsd;
    else day.soldUsd += valueUsd;
    byDay.set(dayUtc, day);
  }

  return Array.from(byDay.values()).sort((a, b) => a.dayUtc - b.dayUtc);
}

// ─── Lecture croisée ─────────────────────────────────────────────────────

export type SideTiming = {
  /** Montant couvert par l'indice, en dollars. */
  totalUsd: number;
  /** Jours d'opération couverts par l'indice. */
  days: number;
  /** Indice moyen au moment des opérations, pondéré par les montants. */
  averageIndex: number | null;
  /** Part des montants passés dans chaque zone. */
  shareByZone: Record<FearGreedZone, number>;
};

export type TimingProfile = {
  buys: SideTiming;
  sells: SideTiming;
  /** Indice moyen du marché sur la même période : la référence. */
  marketAverage: number | null;
  /** Jours d'opération sans valeur d'indice (avant février 2018, ou trou). */
  uncoveredDays: number;
};

function emptyShares(): Record<FearGreedZone, number> {
  return { "extreme-fear": 0, fear: 0, neutral: 0, greed: 0, "extreme-greed": 0 };
}

function summarize(entries: { value: number; amountUsd: number }[]): SideTiming {
  const shareByZone = emptyShares();
  const totalUsd = entries.reduce((sum, entry) => sum + entry.amountUsd, 0);
  if (totalUsd <= 0) return { totalUsd: 0, days: 0, averageIndex: null, shareByZone };

  let weighted = 0;
  for (const entry of entries) {
    weighted += entry.value * entry.amountUsd;
    shareByZone[zoneOf(entry.value)] += entry.amountUsd / totalUsd;
  }
  return { totalUsd, days: entries.length, averageIndex: weighted / totalUsd, shareByZone };
}

/**
 * Confronte les décisions à l'humeur du marché sur une période.
 *
 * La référence n'est pas 50 mais l'humeur moyenne de la période : sur une
 * année d'euphorie, acheter à 60 reste acheter plutôt dans le creux.
 */
export function timingProfile(
  flows: TradeFlowDay[],
  index: FearGreedPoint[],
  range: { fromDay: number; toDay: number }
): TimingProfile {
  const valueByDay = new Map(index.map((point) => [point.dayUtc, point.value]));

  const buys: { value: number; amountUsd: number }[] = [];
  const sells: { value: number; amountUsd: number }[] = [];
  let uncoveredDays = 0;

  for (const flow of flows) {
    if (flow.dayUtc < range.fromDay || flow.dayUtc > range.toDay) continue;
    const value = valueByDay.get(flow.dayUtc);
    if (value === undefined) {
      uncoveredDays += 1;
      continue;
    }
    if (flow.boughtUsd > 0) buys.push({ value, amountUsd: flow.boughtUsd });
    if (flow.soldUsd > 0) sells.push({ value, amountUsd: flow.soldUsd });
  }

  const inRange = index.filter((point) => point.dayUtc >= range.fromDay && point.dayUtc <= range.toDay);
  const marketAverage =
    inRange.length > 0 ? inRange.reduce((sum, point) => sum + point.value, 0) / inRange.length : null;

  return { buys: summarize(buys), sells: summarize(sells), marketAverage, uncoveredDays };
}

/** Écart, en points d'indice, en deçà duquel on ne tire aucune conclusion. */
export const TIMING_GAP_THRESHOLD = 8;

export type TimingReading = "against-the-crowd" | "with-the-crowd" | "in-line" | "unknown";

/**
 * Lecture d'un côté (achats ou ventes) face au marché. Acheter sous la
 * moyenne, ou vendre au-dessus, c'est aller à contre-courant.
 */
export function readTiming(side: "buy" | "sell", timing: SideTiming, marketAverage: number | null): TimingReading {
  if (timing.averageIndex === null || marketAverage === null) return "unknown";
  const gap = timing.averageIndex - marketAverage;
  if (Math.abs(gap) < TIMING_GAP_THRESHOLD) return "in-line";
  const buysLow = side === "buy" && gap < 0;
  const sellsHigh = side === "sell" && gap > 0;
  return buysLow || sellsHigh ? "against-the-crowd" : "with-the-crowd";
}

/** Normalise la réponse de alternative.me : `{ data: [{ value, timestamp }] }`. */
export function parseAlternativeMe(payload: unknown): FearGreedPoint[] {
  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const points: FearGreedPoint[] = [];
  for (const entry of data) {
    const value = Number((entry as { value?: unknown })?.value);
    const seconds = Number((entry as { timestamp?: unknown })?.timestamp);
    if (!Number.isFinite(value) || !Number.isFinite(seconds) || value < 0 || value > 100) continue;
    points.push({ dayUtc: startOfUtcDay(seconds * 1000), value: Math.round(value) });
  }
  return points.sort((a, b) => a.dayUtc - b.dayUtc);
}
