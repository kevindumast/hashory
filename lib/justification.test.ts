import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildLedger, type LedgerInput } from "./ledger";
import { computeCessionChain, suggestCounterparts } from "./tax-chain";
import { createPriceBook, type PriceSeries } from "./valuation";

const DAY_MS = 86_400_000;
const day = (index: number) => Date.UTC(2025, 0, 1) + index * DAY_MS;
const prices: PriceSeries = {
  BTC: Array.from({ length: 365 }, (_, index) => ({ dayUtc: day(index), closeUsd: 100_000 })),
};
const fx = [{ dayUtc: day(0), eurPerUsd: 0.5 }];

const input: LedgerInput = {
  trades: [
    {
      id: "sell",
      account: "cex",
      symbol: "BTCEUR",
      side: "SELL",
      quantity: 0.01,
      price: 50_000,
      quoteQuantity: 500,
      executedAt: day(10),
    },
  ],
  deposits: [{ id: "dep", account: "cex", asset: "BTC", amount: 0.01, timestamp: day(1), txId: "abc" }],
  withdrawals: [],
};

describe("pointage manuel", () => {
  it("sans pointage, le jeton reçu coûte zéro et toute la cession est une plus-value", () => {
    const chain = computeCessionChain(buildLedger(input), createPriceBook({ prices, fx }));
    assert.equal(chain.cessions[0].gainLossEur, 500);
    assert.equal(chain.unknownCostInflows.length, 1);
    assert.equal(chain.unknownCostInflows[0].id, "dep");
  });

  it("un achat ailleurs pointé entre dans le prix total d'acquisition", () => {
    const chain = computeCessionChain(buildLedger(input), createPriceBook({ prices, fx }), [
      { operationId: "dep", direction: "in", category: "purchase", costEur: 300, note: "Facture Coinhouse" },
    ]);
    assert.equal(chain.cessions[0].costBasisEur, 300);
    assert.equal(chain.cessions[0].gainLossEur, 200);
    assert.equal(chain.unknownCostInflows[0].justification?.note, "Facture Coinhouse");
    assert.equal(chain.acquisitions.find((a) => a.kind === "justified")?.costEur, 300);
  });

  it("un airdrop pointé garde un coût nul", () => {
    const chain = computeCessionChain(buildLedger(input), createPriceBook({ prices, fx }), [
      { operationId: "dep", direction: "in", category: "gift", costEur: 300 },
    ]);
    assert.equal(chain.cessions[0].gainLossEur, 500);
    assert.equal(chain.unknownCostInflows[0].justification?.category, "gift");
  });

  it("un transfert interne déclaré fait suivre le coût d'un compte à l'autre", () => {
    const linked: LedgerInput = {
      ...input,
      trades: [
        { id: "buy", account: "bank", symbol: "BTCEUR", side: "BUY", quantity: 0.01, price: 30_000, quoteQuantity: 300, executedAt: day(0) },
        ...input.trades,
      ],
      // Envoyé dix jours avant : trop tôt pour le rapprochement automatique.
      withdrawals: [{ id: "out", account: "bank", asset: "BTC", amount: 0.01, timestamp: day(-9), txId: "x" }],
      justifications: [{ operationId: "dep", direction: "in", category: "internal", linkedOperationId: "out" }],
    };
    linked.trades[0].executedAt = day(-10);
    const chain = computeCessionChain(buildLedger(linked), createPriceBook({ prices, fx }), linked.justifications);
    assert.equal(chain.unknownCostInflows.length, 0);
    assert.equal(chain.untrackedOutflows.length, 0);
    assert.equal(chain.cessions[0].gainLossEur, 200);
  });

  it("propose l'envoi jumeau probable d'une entrée d'origine inconnue", () => {
    const { inflows } = suggestCounterparts(
      [{ id: "in", date: day(5), account: "b", asset: "ETH", quantity: 0.995, valueEur: 2000, reason: "untracked-deposit" }],
      [
        { id: "far", date: day(-60), account: "a", asset: "ETH", quantity: 1, valueEur: 2000 },
        { id: "near", date: day(1), account: "a", asset: "ETH", quantity: 1, valueEur: 2000 },
      ]
    );
    assert.equal(inflows.get("in")?.id, "near");
  });
});
