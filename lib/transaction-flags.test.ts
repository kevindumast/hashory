import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isTaxableDisposal, reviewReasons } from "./transaction-flags";

describe("cession imposable", () => {
  it("retient une crypto cédée contre une monnaie ayant cours légal", () => {
    assert.equal(isTaxableDisposal({ currency: "BTC", quantity: 0.1 }, { currency: "EUR", quantity: 6000 }), true);
    assert.equal(isTaxableDisposal({ currency: "ETH", quantity: 1 }, { currency: "usd", quantity: 3000 }), true);
  });

  it("écarte les échanges crypto contre crypto, stablecoins compris", () => {
    assert.equal(isTaxableDisposal({ currency: "BTC", quantity: 0.1 }, { currency: "USDT", quantity: 6000 }), false);
    assert.equal(isTaxableDisposal({ currency: "SOL", quantity: 3 }, { currency: "ETH", quantity: 0.2 }), false);
  });

  it("écarte un achat contre euros et les simples transferts", () => {
    assert.equal(isTaxableDisposal({ currency: "EUR", quantity: 100 }, { currency: "BTC", quantity: 0.001 }), false);
    assert.equal(isTaxableDisposal(undefined, { currency: "EUR", quantity: 100 }), false);
    assert.equal(isTaxableDisposal({ currency: "SOL", quantity: 0.4 }, undefined), false);
  });
});

describe("lignes à vérifier", () => {
  const base = { type: "deposit" as const, pairKnown: true, pricesLoaded: true };

  it("signale une entrée infime, pas une sortie", () => {
    assert.deepEqual(reviewReasons({ ...base, valueUsd: 0.0001 }), ["dust"]);
    assert.deepEqual(reviewReasons({ ...base, type: "withdrawal", valueUsd: 0.0001 }), []);
    assert.deepEqual(reviewReasons({ ...base, valueUsd: 12 }), []);
  });

  it("n'accuse une valorisation manquante qu'une fois les cours chargés", () => {
    assert.deepEqual(reviewReasons({ ...base, valueUsd: null, pricesLoaded: false }), []);
    assert.deepEqual(reviewReasons({ ...base, valueUsd: null }), ["unvalued"]);
  });

  it("signale une paire non reconnue sans doubler le motif", () => {
    assert.deepEqual(reviewReasons({ ...base, type: "trade", pairKnown: false, valueUsd: null }), ["unknown-pair"]);
  });
});
