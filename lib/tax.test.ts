import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ANNUAL_EXEMPTION_EUR,
  PFU_RATE,
  capitalShareOfSale,
  computeCessionChain,
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

describe("chaîne des cessions", () => {
  const day = (index: number) => Date.UTC(2025, 0, 1) + index * 86_400_000;

  /** Historique de prix complet pour les cas nominaux. */
  const fullPrices: Record<string, number> = { BTC: 40_000, ETH: 10_000 };
  const priceAt = (asset: string) => fullPrices[asset] ?? null;

  const baseEvents = [
    { timestamp: day(0), asset: "BTC", qtyDelta: 1, valueUsd: 10_000, isTaxableSell: false, source: "trade" as const },
    { timestamp: day(1), asset: "ETH", qtyDelta: 1, valueUsd: 5_000, isTaxableSell: false, source: "trade" as const },
  ];

  it("retient la valeur de marché du portefeuille, pas son prix de revient", () => {
    // Portefeuille : 1 BTC à 40 000 + 1 ETH à 10 000 = 50 000 de valeur,
    // pour 15 000 de prix d'acquisition. Cession de 0,5 BTC à 20 000.
    const chain = computeCessionChain(
      [
        ...baseEvents,
        { timestamp: day(10), asset: "BTC", qtyDelta: -0.5, valueUsd: 20_000, isTaxableSell: true, source: "trade" },
      ],
      priceAt
    );

    assert.equal(chain.cessions.length, 1);
    const cession = chain.cessions[0];

    close(cession.portfolioValueUsd, 50_000, 1e-6);
    // 15 000 × 20 000 / 50 000 = 6 000
    close(cession.costBasisUsd, 6_000, 1e-6);
    close(cession.gainLossUsd, 14_000, 1e-6);
    close(cession.valuationCoverage, 1, 1e-9);

    // L'ancienne approximation retenait le prix de revient résiduel (10 000)
    // au lieu de la valeur de marché résiduelle (30 000), soit un
    // dénominateur de 30 000 et une plus-value de seulement 10 000.
    const approximatedCostBasis = (15_000 * 20_000) / (20_000 + 10_000);
    const approximatedGain = 20_000 - approximatedCostBasis;
    assert.ok(
      cession.gainLossUsd > approximatedGain,
      "la valeur de marché révèle une plus-value supérieure à l'approximation"
    );
    close(approximatedGain, 10_000, 1e-6);
  });

  it("valorise l'actif cédé au prix implicite de sa propre vente", () => {
    // Le cours de clôture dit 40 000, la vente s'est faite à 60 000 :
    // c'est le prix réellement obtenu qui fait foi pour la ligne cédée.
    const chain = computeCessionChain(
      [
        ...baseEvents,
        { timestamp: day(10), asset: "BTC", qtyDelta: -0.5, valueUsd: 30_000, isTaxableSell: true, source: "trade" },
      ],
      priceAt
    );
    // 1 BTC valorisé à 60 000 + 1 ETH à 10 000 = 70 000
    close(chain.cessions[0].portfolioValueUsd, 70_000, 1e-6);
  });

  it("signale un repli et reste conservateur quand un cours manque", () => {
    // Aucun historique : tout se replie sur le prix de revient.
    const chain = computeCessionChain(
      [
        ...baseEvents,
        { timestamp: day(10), asset: "BTC", qtyDelta: -0.5, valueUsd: 20_000, isTaxableSell: true, source: "trade" },
      ],
      () => null
    );

    const cession = chain.cessions[0];
    assert.equal(chain.hasIncompleteValuation, true);
    assert.ok(cession.valuationCoverage < 1);

    // Le repli minore la valeur globale, donc la plus-value : c'est un plancher.
    const complete = computeCessionChain(
      [
        ...baseEvents,
        { timestamp: day(10), asset: "BTC", qtyDelta: -0.5, valueUsd: 20_000, isTaxableSell: true, source: "trade" },
      ],
      priceAt
    );
    assert.ok(cession.gainLossUsd < complete.cessions[0].gainLossUsd);
  });

  it("n'impose pas une conversion crypto contre crypto", () => {
    const chain = computeCessionChain(
      [
        ...baseEvents,
        { timestamp: day(5), asset: "BTC", qtyDelta: -0.5, valueUsd: 20_000, isTaxableSell: false, source: "convert" },
        { timestamp: day(5), asset: "ETH", qtyDelta: 2, valueUsd: 20_000, isTaxableSell: false, source: "convert" },
      ],
      priceAt
    );
    assert.equal(chain.cessions.length, 0);
    // 15 000 acquis, 5 000 sortis avec le BTC converti, 20 000 réacquis.
    close(chain.finalAcquisitionCost, 30_000, 1e-6);
  });

  it("réintègre le prix de revient d'une cession à la suivante", () => {
    const chain = computeCessionChain(
      [
        ...baseEvents,
        { timestamp: day(10), asset: "BTC", qtyDelta: -0.5, valueUsd: 20_000, isTaxableSell: true, source: "trade" },
        { timestamp: day(20), asset: "ETH", qtyDelta: -0.5, valueUsd: 5_000, isTaxableSell: true, source: "trade" },
      ],
      priceAt
    );

    assert.equal(chain.cessions.length, 2);
    // Après la première cession : 15 000 − 6 000 = 9 000 restants.
    // Portefeuille : 0,5 BTC à 40 000 + 1 ETH à 10 000 = 30 000.
    // Prix de revient : 9 000 × 5 000 / 30 000 = 1 500.
    close(chain.cessions[1].portfolioValueUsd, 30_000, 1e-6);
    close(chain.cessions[1].costBasisUsd, 1_500, 1e-6);
    close(chain.finalAcquisitionCost, 7_500, 1e-6);
  });

  it("ne cède pas plus que ce qui est détenu", () => {
    const chain = computeCessionChain(
      [
        { timestamp: day(0), asset: "BTC", qtyDelta: 1, valueUsd: 10_000, isTaxableSell: false, source: "trade" },
        { timestamp: day(10), asset: "BTC", qtyDelta: -5, valueUsd: 40_000, isTaxableSell: true, source: "trade" },
      ],
      priceAt
    );
    close(chain.cessions[0].quantity, 1, 1e-9);
  });

  it("ignore une cession sur un actif jamais détenu", () => {
    const chain = computeCessionChain(
      [{ timestamp: day(0), asset: "DOGE", qtyDelta: -100, valueUsd: 500, isTaxableSell: true, source: "trade" }],
      priceAt
    );
    assert.equal(chain.cessions.length, 0);
    assert.equal(chain.finalAcquisitionCost, 0);
  });
});
