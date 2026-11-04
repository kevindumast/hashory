import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { rollingVolatility, tailRisk, ulcerIndex } from "./performance";

const series = (values: number[]) => values.map((value, index) => ({ dayUtc: index, value }));

describe("risque extrême", () => {
  it("donne une VaR positive et une CVaR au moins aussi forte", () => {
    const values = Array.from({ length: 100 }, (_, index) => (index - 50) / 1000);
    const risk = tailRisk(series(values));
    assert.ok(risk.var95 > 0.04 && risk.var95 < 0.05);
    assert.ok(risk.cvar95 >= risk.var95);
    assert.equal(risk.worstDay?.value, -0.05);
    assert.equal(risk.bestDay?.value, 0.049);
  });

  it("compte les jours en hausse, le profit factor et la pire série", () => {
    const risk = tailRisk(series([0.02, -0.01, -0.01, -0.01, 0.03]));
    assert.equal(risk.hitRate, 0.4);
    assert.ok(Math.abs(risk.profitFactor - 0.05 / 0.03) < 1e-12);
    assert.equal(risk.longestLosingStreak, 3);
  });

  it("repère l'asymétrie négative d'un krach", () => {
    const values = [...Array.from({ length: 50 }, () => 0.01), -0.3];
    assert.ok(tailRisk(series(values)).skewness < 0);
  });

  it("calcule l'indice d'ulcère et la volatilité glissante", () => {
    assert.equal(ulcerIndex([{ value: 100 }, { value: 110 }]), 0);
    assert.ok(ulcerIndex([{ value: 100 }, { value: 50 }]) > 0.3);
    assert.equal(rollingVolatility(series([0.01, 0.02, 0.03]), 2).length, 2);
  });
});
