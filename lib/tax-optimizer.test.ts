import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { daysLeftInYear, yearEndLevers, type OptimizerInput } from "./tax-optimizer";

function close(actual: number, expected: number, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≠ ${expected}`);
}

const base: OptimizerInput = {
  yearProceedsEur: 0,
  yearGainEur: 0,
  portfolioValueEur: 10_000,
  acquisitionCostEur: 8_000,
  now: new Date(2026, 5, 15),
};

describe("yearEndLevers", () => {
  it("donne la marge restante sous le seuil de 305 €", () => {
    const [lever] = yearEndLevers({ ...base, yearProceedsEur: 100 });
    assert.deepEqual(lever, { kind: "threshold", remainingEur: 205 });
  });

  it("ne propose plus le seuil une fois dépassé", () => {
    assert.equal(yearEndLevers({ ...base, yearProceedsEur: 400 }).some((l) => l.kind === "threshold"), false);
  });

  it("calcule la vente qui efface une plus-value réalisée, en moins-value latente", () => {
    // Coût 12 000 € pour 10 000 € : chaque euro vendu réalise 0,20 € de moins-value.
    const levers = yearEndLevers({ ...base, yearProceedsEur: 1_000, yearGainEur: 500, acquisitionCostEur: 12_000 });
    const offset = levers.find((l) => l.kind === "offset");
    assert.ok(offset && offset.kind === "offset");
    close(offset.saleEur, 2_500);
    close(offset.lossEur, 500);
    close(offset.taxSavedEur, 150);
    assert.equal(offset.partial, false);
  });

  it("plafonne la vente au portefeuille entier", () => {
    const levers = yearEndLevers({ ...base, yearProceedsEur: 1_000, yearGainEur: 5_000, acquisitionCostEur: 12_000 });
    const offset = levers.find((l) => l.kind === "offset");
    assert.ok(offset && offset.kind === "offset");
    close(offset.saleEur, 10_000);
    close(offset.lossEur, 2_000);
    close(offset.taxSavedEur, 600);
    assert.equal(offset.partial, true);
  });

  it("ne propose pas de compensation sans plus-value réalisée", () => {
    const levers = yearEndLevers({ ...base, acquisitionCostEur: 12_000 });
    assert.equal(levers.some((l) => l.kind === "offset"), false);
  });

  it("suggère d'attendre janvier en fin d'année, avec une plus-value latente", () => {
    const levers = yearEndLevers({ ...base, yearProceedsEur: 1_000, now: new Date(2026, 11, 1) });
    const defer = levers.find((l) => l.kind === "defer");
    assert.ok(defer && defer.kind === "defer");
    close(defer.taxablePerEuro, 0.2);
  });

  it("ne suggère pas d'attendre en milieu d'année", () => {
    assert.equal(yearEndLevers(base).some((l) => l.kind === "defer"), false);
  });

  it("compte les jours restants jusqu'au 31 décembre", () => {
    assert.equal(daysLeftInYear(new Date(2026, 11, 31, 12)), 1);
    assert.equal(daysLeftInYear(new Date(2026, 11, 1, 0)), 31);
  });
});
