import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  annualize,
  beta,
  calmarRatio,
  cashFlowsFromPoints,
  compound,
  concentration,
  correlation,
  dailyReturns,
  downsideDeviation,
  drawdownProfile,
  growthIndex,
  jensenAlpha,
  moneyWeightedReturn,
  sharpeRatio,
  shockImpact,
  sortinoRatio,
  standardDeviation,
  volatility,
  type ValuePoint,
} from "./performance";

const DAY = 86_400_000;
const day = (index: number) => Date.UTC(2025, 0, 1) + index * DAY;

/** Tolérance par défaut : les comparaisons de flottants ne sont jamais exactes. */
function close(actual: number, expected: number, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `attendu ${expected}, obtenu ${actual} (écart ${Math.abs(actual - expected)})`
  );
}

describe("écart-type", () => {
  it("utilise le dénominateur d'échantillon", () => {
    // Population : 2. Échantillon (n − 1) : 2.5 → racine ≈ 1.5811388
    close(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9]), 2.13808993, 1e-8);
  });

  it("retourne zéro en dessous de deux points", () => {
    assert.equal(standardDeviation([]), 0);
    assert.equal(standardDeviation([42]), 0);
  });
});

describe("rendements pondérés par le temps", () => {
  it("neutralise un apport en cours de période", () => {
    // 100 → 110 (+10 %), puis apport de 500 et clôture à 660.
    // Sans neutralisation on lirait +500 % le second jour.
    const points: ValuePoint[] = [
      { dayUtc: day(0), valueUsd: 100, netInvestedUsd: 100 },
      { dayUtc: day(1), valueUsd: 110, netInvestedUsd: 100 },
      { dayUtc: day(2), valueUsd: 660, netInvestedUsd: 600 },
    ];

    const returns = dailyReturns(points);
    assert.equal(returns.length, 2);
    close(returns[0].value, 0.1);
    // (660 − 500) / 110 − 1 ≈ +45,45 %
    close(returns[1].value, 160 / 110 - 1);
  });

  it("ignore les jours partant d'une valeur nulle", () => {
    const points: ValuePoint[] = [
      { dayUtc: day(0), valueUsd: 0, netInvestedUsd: 0 },
      { dayUtc: day(1), valueUsd: 1000, netInvestedUsd: 1000 },
      { dayUtc: day(2), valueUsd: 1100, netInvestedUsd: 1000 },
    ];

    const returns = dailyReturns(points);
    assert.equal(returns.length, 1);
    close(returns[0].value, 0.1);
  });

  it("compose correctement", () => {
    close(compound([0.1, 0.1]), 0.21, 1e-12);
    close(compound([0.5, -0.5]), -0.25, 1e-12);
    assert.equal(compound([]), 0);
  });

  it("annualise une performance partielle", () => {
    // +10 % sur 365 jours reste +10 %.
    close(annualize(0.1, 365), 0.1, 1e-12);
    // +10 % en 182,5 jours équivaut à +21 % sur l'année.
    close(annualize(0.1, 365 / 2), 0.21, 1e-12);
  });

  it("plafonne à −100 % quand le capital est effacé", () => {
    assert.equal(annualize(-1, 200), -1);
  });
});

describe("volatilité et ratios", () => {
  it("annualise la volatilité quotidienne", () => {
    const returns = [0.01, -0.01, 0.02, -0.02, 0.015];
    close(volatility(returns), standardDeviation(returns) * Math.sqrt(365), 1e-12);
  });

  it("ne compte que la baisse dans la déviation baissière", () => {
    const onlyUp = [0.01, 0.02, 0.03];
    assert.equal(downsideDeviation(onlyUp), 0);

    const mixed = [0.05, -0.02, 0.04, -0.01];
    assert.ok(downsideDeviation(mixed) > 0);
    // La hausse gonfle la volatilité totale mais pas la déviation baissière.
    assert.ok(downsideDeviation(mixed) < volatility(mixed));
  });

  it("calcule Sharpe, Sortino et Calmar", () => {
    close(sharpeRatio(0.3, 0.6), 0.5, 1e-12);
    close(sharpeRatio(0.3, 0.6, 0.03), 0.45, 1e-12);
    close(sortinoRatio(0.3, 0.2), 1.5, 1e-12);
    close(calmarRatio(0.4, -0.5), 0.8, 1e-12);
  });

  it("retourne zéro plutôt que l'infini quand le dénominateur s'annule", () => {
    assert.equal(sharpeRatio(0.3, 0), 0);
    assert.equal(sortinoRatio(0.3, 0), 0);
    assert.equal(calmarRatio(0.3, 0), 0);
  });
});

describe("pertes maximales", () => {
  it("mesure la baisse, son creux et sa récupération", () => {
    const series = [
      { dayUtc: day(0), value: 100 },
      { dayUtc: day(1), value: 120 },
      { dayUtc: day(2), value: 60 },
      { dayUtc: day(3), value: 90 },
      { dayUtc: day(4), value: 130 },
    ];

    const profile = drawdownProfile(series);
    close(profile.maxDrawdown, -0.5, 1e-12);
    assert.equal(profile.peakDayUtc, day(1));
    assert.equal(profile.troughDayUtc, day(2));
    assert.equal(profile.recoveryDayUtc, day(4));
    assert.equal(profile.currentDrawdown, 0);
  });

  it("signale une baisse toujours en cours", () => {
    const series = [
      { dayUtc: day(0), value: 100 },
      { dayUtc: day(1), value: 200 },
      { dayUtc: day(2), value: 150 },
    ];

    const profile = drawdownProfile(series);
    close(profile.maxDrawdown, -0.25, 1e-12);
    close(profile.currentDrawdown, -0.25, 1e-12);
    assert.equal(profile.recoveryDayUtc, null);
    assert.equal(profile.longestUnderwaterDays, 1);
  });

  it("ne voit aucune perte sur une série monotone", () => {
    const series = [1, 2, 3, 4].map((value, index) => ({ dayUtc: day(index), value }));
    const profile = drawdownProfile(series);
    assert.equal(profile.maxDrawdown, 0);
    assert.equal(profile.longestUnderwaterDays, 0);
  });

  it("mesure le risque sur l'indice de croissance, pas sur la valeur brute", () => {
    // Le portefeuille perd la moitié de sa valeur, puis un apport la restaure.
    // Sur la valeur brute la baisse semble effacée ; elle ne l'est pas.
    const points: ValuePoint[] = [
      { dayUtc: day(0), valueUsd: 1000, netInvestedUsd: 1000 },
      { dayUtc: day(1), valueUsd: 500, netInvestedUsd: 1000 },
      { dayUtc: day(2), valueUsd: 1000, netInvestedUsd: 1500 },
    ];

    const rawProfile = drawdownProfile(
      points.map((point) => ({ dayUtc: point.dayUtc, value: point.valueUsd }))
    );
    const indexProfile = drawdownProfile(
      growthIndex(dailyReturns(points), 100, points[0].dayUtc)
    );

    close(rawProfile.maxDrawdown, -0.5, 1e-12);
    assert.equal(rawProfile.currentDrawdown, 0, "la valeur brute croit la baisse récupérée");

    // L'indice, lui, reste à −50 % : l'apport n'a rien réparé.
    close(indexProfile.currentDrawdown, -0.5, 1e-12);
    close(indexProfile.maxDrawdown, -0.5, 1e-12);
  });

  it("compte une baisse survenue dès le premier jour", () => {
    // Sans point d'origine, la série commencerait au creux : celui-ci
    // deviendrait le sommet et la perte serait comptée pour nulle.
    const points: ValuePoint[] = [
      { dayUtc: day(0), valueUsd: 1000, netInvestedUsd: 1000 },
      { dayUtc: day(1), valueUsd: 700, netInvestedUsd: 1000 },
    ];
    const returns = dailyReturns(points);

    assert.equal(drawdownProfile(growthIndex(returns)).maxDrawdown, 0);
    close(
      drawdownProfile(growthIndex(returns, 100, points[0].dayUtc)).maxDrawdown,
      -0.3,
      1e-12
    );
  });
});

describe("rendement pondéré par les flux", () => {
  it("retrouve un taux connu sur un placement simple", () => {
    // 1000 placés, 1100 récupérés un an plus tard : 10 %.
    const rate = moneyWeightedReturn([
      { dayUtc: day(0), amountUsd: -1000 },
      { dayUtc: day(365), amountUsd: 1100 },
    ]);
    assert.ok(rate !== null);
    close(rate, 0.1, 1e-6);
  });

  it("pénalise un apport tardif avant une baisse", () => {
    // Deux investisseurs finissent avec la même somme, mais celui qui a
    // massivement renforcé juste avant la chute a un TRI bien plus faible.
    const early = moneyWeightedReturn([
      { dayUtc: day(0), amountUsd: -1000 },
      { dayUtc: day(300), amountUsd: -100 },
      { dayUtc: day(365), amountUsd: 1300 },
    ]);
    const late = moneyWeightedReturn([
      { dayUtc: day(0), amountUsd: -100 },
      { dayUtc: day(300), amountUsd: -1000 },
      { dayUtc: day(365), amountUsd: 1300 },
    ]);

    assert.ok(early !== null && late !== null);
    assert.ok(late > early, "renforcer tard sur une hausse améliore le TRI");
  });

  it("refuse de statuer sans changement de signe", () => {
    assert.equal(
      moneyWeightedReturn([
        { dayUtc: day(0), amountUsd: -100 },
        { dayUtc: day(30), amountUsd: -100 },
      ]),
      null
    );
    assert.equal(moneyWeightedReturn([{ dayUtc: day(0), amountUsd: -100 }]), null);
  });

  it("gère une perte quasi totale", () => {
    const rate = moneyWeightedReturn([
      { dayUtc: day(0), amountUsd: -1000 },
      { dayUtc: day(365), amountUsd: 10 },
    ]);
    assert.ok(rate !== null);
    close(rate, -0.99, 1e-4);
  });

  it("construit les flux depuis la série de valorisation", () => {
    const points: ValuePoint[] = [
      { dayUtc: day(0), valueUsd: 1000, netInvestedUsd: 1000 },
      { dayUtc: day(1), valueUsd: 1050, netInvestedUsd: 1000 },
      { dayUtc: day(2), valueUsd: 1600, netInvestedUsd: 1500 },
    ];

    const flows = cashFlowsFromPoints(points);
    assert.deepEqual(flows, [
      { dayUtc: day(0), amountUsd: -1000 },
      { dayUtc: day(2), amountUsd: -500 },
      { dayUtc: day(2), amountUsd: 1600 },
    ]);
  });
});

describe("comparaison à une référence", () => {
  it("donne un bêta de 1 face à elle-même", () => {
    const returns = [0.01, -0.02, 0.03, 0.005, -0.01];
    close(beta(returns, returns), 1, 1e-12);
    close(correlation(returns, returns), 1, 1e-12);
  });

  it("détecte une exposition amplifiée", () => {
    const benchmark = [0.01, -0.02, 0.03, -0.015];
    const amplified = benchmark.map((value) => value * 2);
    close(beta(amplified, benchmark), 2, 1e-12);
    close(correlation(amplified, benchmark), 1, 1e-12);
  });

  it("détecte une corrélation inverse", () => {
    const benchmark = [0.01, -0.02, 0.03, -0.015];
    const inverse = benchmark.map((value) => -value);
    close(correlation(inverse, benchmark), -1, 1e-12);
  });

  it("isole l'alpha de l'exposition au marché", () => {
    // Un portefeuille de bêta 2 sur un marché à +20 % « devrait » faire +40 %.
    // À +40 % il n'y a aucun alpha : seulement du risque directionnel.
    close(jensenAlpha(0.4, 0.2, 2), 0, 1e-12);
    close(jensenAlpha(0.5, 0.2, 2), 0.1, 1e-12);
  });
});

describe("concentration", () => {
  it("mesure la vraie diversification, pas le nombre de lignes", () => {
    const balanced = concentration([
      { key: "A", valueUsd: 250 },
      { key: "B", valueUsd: 250 },
      { key: "C", valueUsd: 250 },
      { key: "D", valueUsd: 250 },
    ]);
    close(balanced.hhi, 0.25, 1e-12);
    close(balanced.effectiveCount, 4, 1e-12);

    // Vingt lignes, mais une seule pèse 81 % : diversification illusoire.
    const lopsided = concentration([
      { key: "BTC", valueUsd: 810 },
      ...Array.from({ length: 19 }, (_, index) => ({ key: `T${index}`, valueUsd: 10 })),
    ]);
    assert.equal(lopsided.weights.length, 20);
    assert.ok(lopsided.effectiveCount < 1.6, `nombre effectif ${lopsided.effectiveCount}`);
    close(lopsided.topWeight, 0.81, 1e-12);
  });

  it("trie par poids décroissant et cumule les trois premières", () => {
    const profile = concentration([
      { key: "C", valueUsd: 100 },
      { key: "A", valueUsd: 500 },
      { key: "B", valueUsd: 300 },
      { key: "D", valueUsd: 100 },
    ]);
    assert.deepEqual(
      profile.weights.map((entry) => entry.key),
      ["A", "B", "C", "D"]
    );
    close(profile.top3Weight, 0.9, 1e-12);
  });

  it("écarte les lignes vides ou négatives", () => {
    const profile = concentration([
      { key: "A", valueUsd: 100 },
      { key: "B", valueUsd: 0 },
      { key: "C", valueUsd: -50 },
    ]);
    assert.equal(profile.weights.length, 1);
    close(profile.topWeight, 1, 1e-12);
  });

  it("reste neutre sur un portefeuille vide", () => {
    const profile = concentration([]);
    assert.equal(profile.hhi, 0);
    assert.equal(profile.effectiveCount, 0);
  });

  it("chiffre l'impact d'un choc sur une position", () => {
    const holdings = [
      { key: "BTC", valueUsd: 6000 },
      { key: "ETH", valueUsd: 4000 },
    ];
    // BTC pèse 60 % : une chute de 30 % coûte 18 % du portefeuille.
    close(shockImpact(holdings, "BTC", 0.3), 0.18, 1e-12);
    assert.equal(shockImpact(holdings, "DOGE", 0.3), 0);
  });
});
