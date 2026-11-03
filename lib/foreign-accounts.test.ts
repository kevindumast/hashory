import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FINE_LARGE_ACCOUNT_EUR, FINE_PER_ACCOUNT_EUR, foreignAccounts, platformEntity } from "./foreign-accounts";

describe("foreignAccounts", () => {
  it("exempte les portefeuilles en auto-garde", () => {
    assert.equal(platformEntity("ethereum").status, "exempt");
    assert.equal(platformEntity("bitcoin").status, "exempt");
  });

  it("signale une plateforme étrangère et son amende", () => {
    const [kraken] = foreignAccounts([{ provider: "kraken", name: "Kraken", valueEur: 1_000 }]);
    assert.equal(kraken.status, "declare");
    assert.equal(kraken.country, "Irlande");
    assert.equal(kraken.fineEur, FINE_PER_ACCOUNT_EUR);
  });

  it("double l'amende au-delà de 50 000 €", () => {
    const [kucoin] = foreignAccounts([{ provider: "kucoin", name: "KuCoin", valueEur: 60_000 }]);
    assert.equal(kucoin.fineEur, FINE_LARGE_ACCOUNT_EUR);
  });

  it("regroupe deux connexions à la même plateforme", () => {
    const rows = foreignAccounts([
      { provider: "kucoin", name: "KuCoin", firstActivityAt: 2_000, valueEur: 10 },
      { provider: "kucoin", name: "KuCoin Files", firstActivityAt: 1_000, valueEur: 5 },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "KuCoin · KuCoin Files");
    assert.equal(rows[0].firstActivityAt, 1_000);
    assert.equal(rows[0].valueEur, 15);
  });

  it("classe les comptes à déclarer avant ceux à vérifier et les exemptés", () => {
    const rows = foreignAccounts([
      { provider: "solana", name: "Solana" },
      { provider: "binance", name: "Binance" },
      { provider: "kraken", name: "Kraken" },
    ]);
    assert.deepEqual(rows.map((row) => row.status), ["declare", "verify", "exempt"]);
    assert.equal(rows[2].fineEur, null);
  });

  it("demande une vérification pour une plateforme inconnue", () => {
    assert.equal(platformEntity("nouvelle-plateforme").status, "verify");
  });
});
