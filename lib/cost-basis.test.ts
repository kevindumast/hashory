import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeCostBasis, type CostBasisEvent } from "./cost-basis";

function close(actual: number, expected: number, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `attendu ${expected}, obtenu ${actual} (écart ${Math.abs(actual - expected)})`
  );
}

const buy = (quantity: number, valueUsd: number): CostBasisEvent => ({
  type: "BUY",
  quantity,
  valueUsd,
});
const sell = (quantity: number, valueUsd: number): CostBasisEvent => ({
  type: "SELL",
  quantity,
  valueUsd,
});
const deposit = (quantity: number): CostBasisEvent => ({ type: "DEPOSIT", quantity });
const withdrawal = (quantity: number): CostBasisEvent => ({ type: "WITHDRAWAL", quantity });

describe("prix de revient", () => {
  it("moyenne les achats successifs", () => {
    // 1 à 100, puis 1 à 200 : moyenne à 150.
    const result = computeCostBasis([buy(1, 100), buy(1, 200)], "BTC");
    close(result.avgCostBasis, 150);
    close(result.holdingQuantity, 2);
  });

  it("ignore un transfert entrant dans le calcul du prix", () => {
    // Le cœur du problème : les jetons reçus n'ont pas de coût connu et ne
    // doivent donc pas peser sur la moyenne des achats.
    const withTransfer = computeCostBasis([deposit(9), buy(1, 100)], "BTC");
    const withoutTransfer = computeCostBasis([buy(1, 100)], "BTC");

    close(withTransfer.avgCostBasis, 100);
    close(withTransfer.avgCostBasis, withoutTransfer.avgCostBasis);
    // La quantité détenue, elle, tient bien compte du transfert.
    close(withTransfer.holdingQuantity, 10);
    close(withTransfer.purchasedQuantity, 1);
  });

  it("donne le même prix quel que soit l'ordre du transfert", () => {
    const before = computeCostBasis([deposit(5), buy(2, 400)], "ETH");
    const after = computeCostBasis([buy(2, 400), deposit(5)], "ETH");
    close(before.avgCostBasis, 200);
    close(after.avgCostBasis, 200);
  });

  it("ignore un transfert sortant dans le calcul du prix", () => {
    const result = computeCostBasis([buy(2, 400), withdrawal(1)], "ETH");
    close(result.avgCostBasis, 200);
    close(result.holdingQuantity, 1);
    // Le retrait ne consomme aucune quantité achetée : les jetons existent
    // toujours, ailleurs.
    close(result.purchasedQuantity, 2);
  });

  it("n'attribue aucun prix à un actif jamais acheté", () => {
    const result = computeCostBasis([deposit(1000)], "KAS");
    assert.equal(result.avgCostBasis, 0);
    close(result.holdingQuantity, 1000);
  });
});

describe("résultat réalisé", () => {
  it("compte le gain au prix de revient moyen", () => {
    // Acheté 2 à 100, vendu 1 à 150 : gain de 50.
    const result = computeCostBasis([buy(2, 200), sell(1, 150)], "SOL");
    close(result.realizedPnlAvco, 50);
    close(result.avgCostBasis, 100);
    close(result.holdingQuantity, 1);
  });

  it("laisse le prix de revient inchangé après une vente partielle", () => {
    const result = computeCostBasis([buy(2, 200), sell(1, 500)], "SOL");
    close(result.avgCostBasis, 100);
    close(result.purchasedQuantity, 1);
  });

  it("compte une vente de jetons reçus à un coût nul", () => {
    // Origine inconnue : on majore le gain plutôt que d'inventer un coût.
    const result = computeCostBasis([deposit(5), sell(2, 300)], "TAO");
    close(result.realizedPnlAvco, 300);
    close(result.holdingQuantity, 3);
  });

  it("ne fait porter le coût qu'à la part réellement achetée", () => {
    // 1 acheté à 100, 4 reçus. Vente de 3 : une seule porte un coût.
    const result = computeCostBasis([buy(1, 100), deposit(4), sell(3, 600)], "TAO");
    close(result.realizedPnlAvco, 500);
    close(result.purchasedQuantity, 0);
    close(result.holdingQuantity, 2);
  });

  it("enregistre une perte", () => {
    const result = computeCostBasis([buy(1, 1000), sell(1, 400)], "ETH");
    close(result.realizedPnlAvco, -600);
  });
});

describe("frais", () => {
  it("retranche des frais prélevés dans l'actif acheté", () => {
    // 1 acheté pour 100, 0,1 prélevé en frais : 0,9 reçu, donc ~111,11.
    const result = computeCostBasis(
      [{ type: "BUY", quantity: 1, valueUsd: 100, fee: 0.1, feeAsset: "BTC" }],
      "BTC"
    );
    close(result.holdingQuantity, 0.9);
    close(result.avgCostBasis, 100 / 0.9, 1e-9);
  });

  it("ignore des frais prélevés dans une autre devise", () => {
    const result = computeCostBasis(
      [{ type: "BUY", quantity: 1, valueUsd: 100, fee: 5, feeAsset: "USDT" }],
      "BTC"
    );
    close(result.holdingQuantity, 1);
    close(result.avgCostBasis, 100);
  });
});

describe("cas dégénérés", () => {
  it("reste neutre sans événement", () => {
    const result = computeCostBasis([], "BTC");
    assert.equal(result.avgCostBasis, 0);
    assert.equal(result.realizedPnlAvco, 0);
  });

  it("ne descend pas sous zéro", () => {
    const result = computeCostBasis([buy(1, 100), sell(5, 500), withdrawal(10)], "BTC");
    assert.ok(result.holdingQuantity >= 0);
    assert.ok(result.purchasedQuantity >= 0);
  });

  it("se replie sur le cours quand la contre-valeur manque", () => {
    const result = computeCostBasis([{ type: "BUY", quantity: 2, price: 50 }], "BTC");
    close(result.avgCostBasis, 50);
  });
});
