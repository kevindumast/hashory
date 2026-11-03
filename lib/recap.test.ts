import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeRecap, recapYears, type CalendarView, type RecapOperation, type RecapValuation } from "./recap";
import { tradeFlows } from "./trade-flows";

/** Calendrier UTC : les tests ne dépendent pas du fuseau de la machine. */
const utc = (timestamp: number): CalendarView => {
  const date = new Date(timestamp);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    weekday: (date.getUTCDay() + 6) % 7,
    hour: date.getUTCHours(),
    dayKey: Math.floor(timestamp / 86_400_000),
  };
};

const at = (iso: string) => Date.parse(iso);

const PRICES: Record<string, number> = { BTC: 100_000, ETH: 4_000, SOL: 200 };
const valuation: RecapValuation = {
  priceUsd: (asset) => PRICES[asset] ?? null,
  usdPerEurAt: () => 1.1,
  usdPerEurNow: 1.2,
};

const buy = (iso: string, eur: number, btc: number, account = "Bitstack", fee?: number): RecapOperation => ({
  kind: "exchange",
  timestamp: at(iso),
  account,
  given: { asset: "EUR", quantity: eur },
  received: { asset: "BTC", quantity: btc },
  fee: fee ? { asset: "EUR", quantity: fee } : undefined,
});

function close(actual: number, expected: number, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≠ ${expected}`);
}

describe("tradeFlows", () => {
  it("lit un achat d'USDT par carte dans le bon sens, malgré le symbole USDTUSD", () => {
    const flows = tradeFlows({
      symbol: "USDTUSD",
      side: "BUY",
      quantity: 48.74,
      price: 1,
      fromAsset: "USD",
      fromAmount: 48.74,
      toAsset: "USDT",
      toAmount: 48.74,
    });
    assert.deepEqual(flows.given, { asset: "USD", quantity: 48.74 });
    assert.deepEqual(flows.received, { asset: "USDT", quantity: 48.74 });
  });

  it("découpe le symbole quand la plateforme ne donne pas les actifs", () => {
    const flows = tradeFlows({ symbol: "BTCUSDT", side: "SELL", quantity: 0.5, price: 60_000 });
    assert.deepEqual(flows.given, { asset: "BTC", quantity: 0.5 });
    assert.deepEqual(flows.received, { asset: "USDT", quantity: 30_000 });
    assert.equal(flows.pairKnown, true);
  });
});

describe("computeRecap", () => {
  it("ne retient que l'année demandée et liste les années", () => {
    const ops = [buy("2025-03-01T10:00:00Z", 30, 0.001), buy("2026-03-01T10:00:00Z", 30, 0.001)];
    assert.deepEqual(recapYears(ops, utc), [2026, 2025]);
    assert.equal(computeRecap(ops, 2026, valuation, utc).operationCount, 1);
  });

  it("chiffre l'argent placé au change du jour et les frais en monnaie", () => {
    const recap = computeRecap([buy("2026-01-05T20:00:00Z", 100, 0.001, "Bitstack", 1)], 2026, valuation, utc);
    close(recap.investedUsd, 110);
    close(recap.fees.totalUsd, 1.1);
    assert.equal(recap.fees.cryptoUsd, 0);
    assert.equal(recap.largestPurchase?.asset, "BTC");
  });

  it("chiffre les frais en crypto au cours d'aujourd'hui", () => {
    const op: RecapOperation = {
      kind: "withdrawal",
      timestamp: at("2026-02-01T12:00:00Z"),
      account: "Binance",
      asset: "BTC",
      quantity: 0.01,
      fee: 0.0001,
    };
    const recap = computeRecap([op], 2026, valuation, utc);
    close(recap.fees.totalUsd, 10);
    close(recap.fees.cryptoUsd, 10);
  });

  it("rejuge une vente au cours d'aujourd'hui", () => {
    const sale: RecapOperation = {
      kind: "exchange",
      timestamp: at("2026-04-01T12:00:00Z"),
      account: "Kraken",
      given: { asset: "ETH", quantity: 1 },
      received: { asset: "USDC", quantity: 3_000 },
    };
    const recap = computeRecap([sale], 2026, valuation, utc);
    assert.equal(recap.verdicts.items.length, 1);
    // 1 ETH vaut 4 000 $ aujourd'hui : garder aurait rapporté 1 000 $ de plus.
    close(recap.verdicts.totalDeltaUsd, -1_000);
    close(recap.cashedOutUsd, 3_000);
  });

  it("rejuge un échange crypto contre crypto des deux côtés", () => {
    const swap: RecapOperation = {
      kind: "exchange",
      timestamp: at("2026-04-01T12:00:00Z"),
      account: "Binance",
      given: { asset: "SOL", quantity: 10 },
      received: { asset: "ETH", quantity: 1 },
    };
    const recap = computeRecap([swap], 2026, valuation, utc);
    close(recap.verdicts.items[0].deltaUsd, 4_000 - 2_000);
  });

  it("compte à part les cessions sans cours", () => {
    const sale: RecapOperation = {
      kind: "exchange",
      timestamp: at("2026-04-01T12:00:00Z"),
      account: "KuCoin",
      given: { asset: "RIO", quantity: 75 },
      received: { asset: "USDT", quantity: 66 },
    };
    const recap = computeRecap([sale], 2026, valuation, utc);
    assert.equal(recap.verdicts.items.length, 0);
    assert.equal(recap.verdicts.unpricedCount, 1);
  });

  it("repère un investissement programmé le même jour de la semaine", () => {
    // Dix samedis de suite.
    const ops = Array.from({ length: 10 }, (_, i) =>
      buy(new Date(at("2026-01-03T20:00:00Z") + i * 7 * 86_400_000).toISOString(), 30, 0.0003)
    );
    const recap = computeRecap(ops, 2026, valuation, utc);
    const dca = recap.profiles.find((p) => p.id === "dca");
    assert.ok(dca);
    assert.match(dca.description, /samedi/);
    assert.ok(recap.profiles.some((p) => p.id === "diamond"));
    assert.ok(recap.profiles.some((p) => p.id === "weekend"));
    assert.equal(recap.longestPauseDays, 6);
    assert.equal(recap.heatmap[5][20], 10);
  });

  it("ne compte comme découverte que la première acquisition d'un actif", () => {
    const ops = [buy("2025-06-01T10:00:00Z", 30, 0.001), buy("2026-06-01T10:00:00Z", 30, 0.001)];
    const eth: RecapOperation = {
      kind: "deposit",
      timestamp: at("2026-07-01T10:00:00Z"),
      account: "ethereum",
      asset: "ETH",
      quantity: 0.5,
    };
    assert.deepEqual(computeRecap([...ops, eth], 2026, valuation, utc).discoveries, ["ETH"]);
    assert.deepEqual(computeRecap([...ops, eth], 2025, valuation, utc).discoveries, ["BTC"]);
  });
});
