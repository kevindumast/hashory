import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { countTransactionsByYear } from "./transactions-by-year";

describe("transactions par an", () => {
  it("compte par année et par nature, la plus récente d'abord", () => {
    const rows = countTransactionsByYear([
      { type: "trade", executedAt: new Date(2025, 5, 1).getTime() },
      { type: "trade", executedAt: new Date(2025, 11, 31, 23, 0).getTime() },
      { type: "deposit", timestamp: new Date(2025, 0, 1, 0, 30).getTime() },
      { type: "withdrawal", timestamp: new Date(2024, 2, 3).getTime() },
    ]);
    assert.deepEqual(rows, [
      { year: 2025, trades: 2, deposits: 1, withdrawals: 0, total: 3 },
      { year: 2024, trades: 0, deposits: 0, withdrawals: 1, total: 1 },
    ]);
  });

  it("ignore une date absente ou invalide", () => {
    assert.deepEqual(countTransactionsByYear([{ type: "trade", executedAt: 0 }, { type: "deposit", timestamp: Number.NaN }]), []);
  });
});
