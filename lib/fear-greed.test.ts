import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TIMING_GAP_THRESHOLD,
  dailyTradeFlows,
  parseAlternativeMe,
  readTiming,
  timingProfile,
  zoneOf,
  type FearGreedPoint,
  type TradeFlowDay,
} from "./fear-greed";
import type { ExchangeOperation, Operation } from "./ledger";
import type { PriceBook } from "./valuation";

const DAY = 86_400_000;
const D0 = Date.UTC(2025, 0, 1);

/** Cours fixes : 1 $ pour la monnaie, 100 $ l'unité pour le reste. */
const book: PriceBook = {
  usd: (asset) => (["USD", "USDT", "USDC", "EUR"].includes(asset) ? 1 : 100),
  eurPerUsd: () => 1,
  eur: (asset) => (["USD", "USDT", "USDC", "EUR"].includes(asset) ? 1 : 100),
};

function exchange(
  dayOffset: number,
  given: [string, number],
  received: [string, number],
  origin: ExchangeOperation["origin"] = "spot"
): ExchangeOperation {
  return {
    kind: "exchange",
    id: `op-${dayOffset}-${given[0]}-${received[0]}`,
    account: "binance",
    timestamp: D0 + dayOffset * DAY + 3_600_000,
    given: { asset: given[0], quantity: given[1] },
    received: { asset: received[0], quantity: received[1] },
    origin,
  };
}

describe("zoneOf", () => {
  it("place les bornes dans la zone inférieure", () => {
    assert.equal(zoneOf(0), "extreme-fear");
    assert.equal(zoneOf(24), "extreme-fear");
    assert.equal(zoneOf(25), "fear");
    assert.equal(zoneOf(50), "neutral");
    assert.equal(zoneOf(75), "greed");
    assert.equal(zoneOf(76), "extreme-greed");
    assert.equal(zoneOf(100), "extreme-greed");
  });
});

describe("dailyTradeFlows", () => {
  it("compte les achats et ventes contre monnaie, cumulés par jour", () => {
    const operations: Operation[] = [
      exchange(0, ["USDT", 500], ["BTC", 5]),
      exchange(0, ["EUR", 200], ["ETH", 2]),
      exchange(2, ["BTC", 1], ["USDC", 100]),
    ];
    assert.deepEqual(dailyTradeFlows(operations, book), [
      { dayUtc: D0, boughtUsd: 700, soldUsd: 0 },
      { dayUtc: D0 + 2 * DAY, boughtUsd: 0, soldUsd: 100 },
    ]);
  });

  it("ignore les échanges crypto contre crypto, la poussière et les transferts", () => {
    const operations: Operation[] = [
      exchange(0, ["BTC", 1], ["ETH", 1]),
      exchange(0, ["USDT", 10], ["USDC", 10]),
      exchange(1, ["SHIB", 1], ["USDT", 1], "dust"),
      {
        kind: "deposit",
        id: "dep",
        account: "binance",
        timestamp: D0,
        asset: "USDT",
        quantity: 1000,
        fee: 0,
      },
    ];
    assert.deepEqual(dailyTradeFlows(operations, book), []);
  });
});

describe("timingProfile", () => {
  const index: FearGreedPoint[] = [
    { dayUtc: D0, value: 20 },
    { dayUtc: D0 + DAY, value: 50 },
    { dayUtc: D0 + 2 * DAY, value: 80 },
  ];
  const range = { fromDay: D0, toDay: D0 + 2 * DAY };

  it("pondère l'indice par les montants et le compare à la moyenne du marché", () => {
    const flows: TradeFlowDay[] = [
      { dayUtc: D0, boughtUsd: 300, soldUsd: 0 },
      { dayUtc: D0 + DAY, boughtUsd: 100, soldUsd: 0 },
      { dayUtc: D0 + 2 * DAY, boughtUsd: 0, soldUsd: 50 },
    ];
    const profile = timingProfile(flows, index, range);

    assert.equal(profile.marketAverage, 50);
    assert.equal(profile.buys.totalUsd, 400);
    assert.equal(profile.buys.days, 2);
    assert.equal(profile.buys.averageIndex, (20 * 300 + 50 * 100) / 400);
    assert.equal(profile.buys.shareByZone["extreme-fear"], 0.75);
    assert.equal(profile.buys.shareByZone.neutral, 0.25);
    assert.equal(profile.sells.averageIndex, 80);
    assert.equal(profile.uncoveredDays, 0);
  });

  it("écarte les jours hors période et signale ceux sans indice", () => {
    const flows: TradeFlowDay[] = [
      { dayUtc: D0 - 10 * DAY, boughtUsd: 100, soldUsd: 0 },
      { dayUtc: D0 + DAY, boughtUsd: 100, soldUsd: 0 },
    ];
    const profile = timingProfile(flows, index.slice(0, 1), { fromDay: D0 - 20 * DAY, toDay: D0 + DAY });
    assert.equal(profile.uncoveredDays, 2);
    assert.equal(profile.buys.averageIndex, null);
    assert.equal(profile.marketAverage, 20);

    const narrowed = timingProfile(flows, index, range);
    assert.equal(narrowed.buys.totalUsd, 100);
    assert.equal(narrowed.uncoveredDays, 0);
  });
});

describe("readTiming", () => {
  const side = (averageIndex: number | null) => ({
    totalUsd: 1,
    days: 1,
    averageIndex,
    shareByZone: { "extreme-fear": 0, fear: 0, neutral: 0, greed: 0, "extreme-greed": 0 },
  });

  it("acheter sous la moyenne ou vendre au-dessus, c'est aller à contre-courant", () => {
    assert.equal(readTiming("buy", side(30), 50), "against-the-crowd");
    assert.equal(readTiming("buy", side(70), 50), "with-the-crowd");
    assert.equal(readTiming("sell", side(70), 50), "against-the-crowd");
    assert.equal(readTiming("sell", side(30), 50), "with-the-crowd");
  });

  it("ne conclut rien sous le seuil ou sans données", () => {
    assert.equal(readTiming("buy", side(50 + TIMING_GAP_THRESHOLD - 1), 50), "in-line");
    assert.equal(readTiming("buy", side(null), 50), "unknown");
    assert.equal(readTiming("buy", side(40), null), "unknown");
  });
});

describe("parseAlternativeMe", () => {
  it("convertit les horodatages en jours UTC et écarte les entrées invalides", () => {
    const seconds = D0 / 1000;
    const points = parseAlternativeMe({
      data: [
        { value: "72", value_classification: "Greed", timestamp: String(seconds + 86_400) },
        { value: "15", value_classification: "Extreme Fear", timestamp: String(seconds) },
        { value: "abc", timestamp: String(seconds) },
        { value: "140", timestamp: String(seconds) },
      ],
    });
    assert.deepEqual(points, [
      { dayUtc: D0, value: 15 },
      { dayUtc: D0 + DAY, value: 72 },
    ]);
  });

  it("renvoie une liste vide pour une réponse inattendue", () => {
    assert.deepEqual(parseAlternativeMe(null), []);
    assert.deepEqual(parseAlternativeMe({ data: "oops" }), []);
  });
});
