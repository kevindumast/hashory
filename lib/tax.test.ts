import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ANNUAL_EXEMPTION_EUR,
  PFU_RATE,
  capitalShareOfSale,
  compareStates,
  isBelowAnnualExemption,
  proceedsForNetTarget,
  taxOnSale,
  type PortfolioTaxState,
} from "./tax";

function close(actual: number, expected: number, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `attendu ${expected}, obtenu ${actual} (écart ${Math.abs(actual - expected)})`
  );
}

/** Portefeuille de 100 000, constitué pour 40 000 : 60 % de plus-value latente. */
const state: PortfolioTaxState = { portfolioValue: 100_000, totalAcquisitionCost: 40_000 };

describe("imposition d'une cession", () => {
  it("applique l'assiette proportionnelle du 150 VH bis", () => {
    // Céder 10 000 sur un portefeuille de 100 000 impute 10 % du prix
    // d'acquisition, soit 4 000. Plus-value : 6 000. Impôt : 1 800.
    const result = taxOnSale(10_000, state);
    close(result.costBasis, 4_000);
    close(result.gain, 6_000);
    close(result.tax, 1_800);
    close(result.net, 8_200);
    close(result.effectiveRate, 0.18);
  });

  it("n'impose pas au prorata du seul actif vendu", () => {
    // Contre-exemple : une méthode par ligne imposerait le gain de l'actif.
    // Ici l'assiette dépend du portefeuille entier, donc du ratio 40/100.
    const result = taxOnSale(10_000, state);
    assert.notEqual(result.gain, 10_000, "le gain n'est pas la totalité de la cession");
    close(result.gain, 10_000 * (1 - 0.4));
  });

  it("réduit le prix d'acquisition restant à proportion", () => {
    const result = taxOnSale(25_000, state);
    close(result.costBasis, 10_000);
    close(result.remainingAcquisitionCost, 30_000);
  });

  it("ne taxe pas une moins-value latente", () => {
    const losing: PortfolioTaxState = { portfolioValue: 50_000, totalAcquisitionCost: 80_000 };
    const result = taxOnSale(10_000, losing);
    assert.ok(result.gain < 0);
    assert.equal(result.tax, 0);
    close(result.net, 10_000);
  });

  it("borne la cession à la valeur du portefeuille", () => {
    const result = taxOnSale(500_000, state);
    close(result.proceeds, 100_000);
    close(result.gain, 60_000);
    close(result.tax, 18_000);
  });

  it("reste neutre sur les cas dégénérés", () => {
    assert.equal(taxOnSale(0, state).tax, 0);
    assert.equal(taxOnSale(-100, state).tax, 0);
    assert.equal(taxOnSale(1_000, { portfolioValue: 0, totalAcquisitionCost: 0 }).tax, 0);
  });

  it("impose la totalité quand rien n'a été investi", () => {
    // Portefeuille entièrement issu d'un airdrop : prix d'acquisition nul.
    const gifted: PortfolioTaxState = { portfolioValue: 10_000, totalAcquisitionCost: 0 };
    const result = taxOnSale(1_000, gifted);
    close(result.gain, 1_000);
    close(result.tax, 300);
  });
});

describe("cession nécessaire pour un net visé", () => {
  it("inverse exactement la formule", () => {
    const target = 8_200;
    const result = proceedsForNetTarget(target, state);
    assert.ok(result !== null);
    // On doit retrouver la cession de 10 000 du cas direct.
    close(result.proceeds, 10_000, 1e-6);
    close(result.net, target, 1e-6);
  });

  it("boucle avec le calcul direct sur une plage de montants", () => {
    // Propriété : pour tout net visé atteignable, taxOnSale(P).net === net.
    for (const target of [100, 1_000, 12_345.67, 50_000]) {
      const inverse = proceedsForNetTarget(target, state);
      assert.ok(inverse !== null, `objectif ${target} devrait être atteignable`);
      const direct = taxOnSale(inverse.proceeds, state);
      close(direct.net, target, 1e-6);
    }
  });

  it("cède au centime près quand le portefeuille est en moins-value", () => {
    const losing: PortfolioTaxState = { portfolioValue: 50_000, totalAcquisitionCost: 80_000 };
    const result = proceedsForNetTarget(10_000, losing);
    assert.ok(result !== null);
    close(result.proceeds, 10_000, 1e-9);
    assert.equal(result.tax, 0);
  });

  it("refuse un objectif hors d'atteinte", () => {
    // Le net maximal vaut 100 000 − 18 000 = 82 000.
    assert.equal(proceedsForNetTarget(90_000, state), null);
    assert.notEqual(proceedsForNetTarget(82_000, state), null);
  });

  it("rejette les objectifs nuls ou négatifs", () => {
    assert.equal(proceedsForNetTarget(0, state), null);
    assert.equal(proceedsForNetTarget(-500, state), null);
    assert.equal(proceedsForNetTarget(1_000, { portfolioValue: 0, totalAcquisitionCost: 0 }), null);
  });

  it("exige de céder davantage quand la plus-value latente est forte", () => {
    const modest: PortfolioTaxState = { portfolioValue: 100_000, totalAcquisitionCost: 90_000 };
    const strong: PortfolioTaxState = { portfolioValue: 100_000, totalAcquisitionCost: 10_000 };

    const forModest = proceedsForNetTarget(10_000, modest);
    const forStrong = proceedsForNetTarget(10_000, strong);
    assert.ok(forModest !== null && forStrong !== null);
    assert.ok(
      forStrong.proceeds > forModest.proceeds,
      "plus la plus-value latente est forte, plus il faut céder pour le même net"
    );
  });
});

describe("lecture du portefeuille", () => {
  it("isole la part de capital dans une cession", () => {
    close(capitalShareOfSale(state), 0.4);
    // Un portefeuille en moins-value ne peut pas rendre plus que 100 % de capital.
    close(capitalShareOfSale({ portfolioValue: 50_000, totalAcquisitionCost: 80_000 }), 1);
    assert.equal(capitalShareOfSale({ portfolioValue: 0, totalAcquisitionCost: 10 }), 0);
  });

  it("applique le seuil annuel d'exonération", () => {
    assert.equal(isBelowAnnualExemption(300), true);
    assert.equal(isBelowAnnualExemption(ANNUAL_EXEMPTION_EUR), false);
    assert.equal(isBelowAnnualExemption(1_000), false);
  });

  it("montre l'effet de la valeur globale sur une cession identique", () => {
    // Même montant cédé, même prix d'acquisition : seul le marché a bougé.
    const comparison = compareStates(
      10_000,
      { portfolioValue: 80_000, totalAcquisitionCost: 40_000 },
      { portfolioValue: 200_000, totalAcquisitionCost: 40_000 }
    );
    // Portefeuille plus valorisé = moindre part de capital imputée = plus d'impôt.
    assert.ok(comparison.taxDelta > 0);
    close(comparison.before.tax, 10_000 * (1 - 0.5) * PFU_RATE);
    close(comparison.after.tax, 10_000 * (1 - 0.2) * PFU_RATE);
  });
});
