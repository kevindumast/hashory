import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildLedger } from "./ledger";
import { assetsToPrice, createPriceBook, impliedPrices } from "./valuation";
import { krakenInput } from "./test-fixtures";

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const close = (actual: number | null, expected: number, epsilon = 1e-9) =>
  assert.ok(actual !== null && Math.abs(actual - expected) <= epsilon, `${actual} ≠ ${expected}`);

const fx = [
  { dayUtc: day("2026-09-01"), eurPerUsd: 0.9 },
  { dayUtc: day("2026-09-10"), eurPerUsd: 0.8 },
];

describe("valorisation", () => {
  const book = createPriceBook({
    prices: { BTC: [{ dayUtc: day("2026-09-02"), closeUsd: 100_000 }, { dayUtc: day("2026-09-05"), closeUsd: 110_000 }] },
    fx,
  });

  it("tient le dollar et ses stablecoins au pair", () => {
    assert.equal(book.usd("USD", 0), 1);
    assert.equal(book.usd("USDC", 0), 1);
    assert.equal(book.usd("fdusd", 0), 1);
  });

  it("convertit l'euro au change du jour", () => {
    close(book.usd("EUR", day("2026-09-03")), 1 / 0.9);
    close(book.usd("EUR", day("2026-09-12")), 1 / 0.8);
    assert.equal(book.eur("EUR", 0), 1);
  });

  it("retient le dernier cours connu, jamais un cours futur", () => {
    close(book.usd("BTC", day("2026-09-04")), 100_000);
    close(book.usd("BTC", day("2026-09-05") + 3_600_000), 110_000);
    assert.equal(book.usd("BTC", day("2026-09-01")), null);
  });

  it("donne le cours en euros", () => {
    close(book.eur("BTC", day("2026-09-04")), 90_000);
  });

  it("ne cote pas une devise sans change connu", () => {
    assert.equal(book.usd("GBP", day("2026-09-04")), null);
  });
});

describe("prix implicites", () => {
  it("cote un jeton à son prix d'achat quand le marché ne le cote pas encore", () => {
    const operations = buildLedger(krakenInput);
    const implied = impliedPrices(operations, [{ dayUtc: day("2026-09-01"), eurPerUsd: 0.86 }]);
    // 32,15 USDC pour 0,3058 SOL.
    close(implied.SOL[0].closeUsd, 32.15 / 0.3058);

    const book = createPriceBook({ prices: {}, fx: [], implied });
    close(book.usd("SOL", day("2026-09-20")), 32.15 / 0.3058);
  });

  it("préfère toujours le cours de marché au prix implicite", () => {
    const book = createPriceBook({
      prices: { SOL: [{ dayUtc: day("2026-09-04"), closeUsd: 101.5 }] },
      fx: [],
      implied: { SOL: [{ dayUtc: day("2026-09-04"), closeUsd: 105 }] },
    });
    close(book.usd("SOL", day("2026-09-04")), 101.5);
  });

  it("ne cote que les actifs qui ne sont ni fiat ni stablecoin", () => {
    assert.deepEqual(assetsToPrice(buildLedger(krakenInput)), ["SOL"]);
  });
});
