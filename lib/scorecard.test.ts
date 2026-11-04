import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { scorecard } from "./scorecard";

describe("bulletin", () => {
  it("note chaque dimension de A à E", () => {
    const lines = scorecard({
      excessReturn: 0.2,
      sharpe: 0.2,
      maxDrawdown: -0.8,
      effectivePositions: 6,
      topWeight: 0.3,
      stablecoinWeight: 0,
      auditScore: 1,
    });
    const byId = Object.fromEntries(lines.map((line) => [line.id, line.grade]));
    assert.deepEqual(byId, { alpha: "A", efficiency: "D", drawdown: "E", diversification: "A", liquidity: "E", compliance: "A" });
  });

  it("omet la comparaison à Bitcoin faute de référence", () => {
    const lines = scorecard({ excessReturn: null, sharpe: 1, maxDrawdown: -0.1, effectivePositions: 1, topWeight: 1, stablecoinWeight: 0.2, auditScore: 0.6 });
    assert.equal(lines.some((line) => line.id === "alpha"), false);
  });
});
