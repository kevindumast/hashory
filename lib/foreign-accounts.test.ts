import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FINE_LARGE_ACCOUNT_EUR,
  FINE_PER_ACCOUNT_EUR,
  declarationPeriod,
  foreignAccounts,
  platformEntity,
} from "./foreign-accounts";

const YEAR = 2025;
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

describe("declarationPeriod", () => {
  it("prépare la déclaration de l'année écoulée jusqu'à fin juin", () => {
    assert.deepEqual(declarationPeriod(new Date(2026, 4, 10)), { incomeYear: 2025, filingYear: 2026 });
  });

  it("prépare celle de l'année en cours ensuite", () => {
    assert.deepEqual(declarationPeriod(new Date(2026, 10, 3)), { incomeYear: 2026, filingYear: 2027 });
  });
});

describe("foreignAccounts", () => {
  it("exempte les portefeuilles en auto-garde", () => {
    assert.equal(platformEntity("ethereum").status, "exempt");
    assert.equal(platformEntity("bitcoin").status, "exempt");
  });

  it("signale une plateforme étrangère et son amende", () => {
    const [kraken] = foreignAccounts([{ provider: "kraken", name: "Kraken", valueEur: 1_000 }], YEAR);
    assert.equal(kraken.status, "declare");
    assert.equal(kraken.country, "Irlande");
    assert.equal(kraken.fineEur, FINE_PER_ACCOUNT_EUR);
  });

  it("double l'amende au-delà de 50 000 €", () => {
    const [kucoin] = foreignAccounts([{ provider: "kucoin", name: "KuCoin", valueEur: 60_000 }], YEAR);
    assert.equal(kucoin.fineEur, FINE_LARGE_ACCOUNT_EUR);
  });

  it("regroupe deux connexions à la même plateforme", () => {
    const rows = foreignAccounts(
      [
        { provider: "kucoin", name: "KuCoin", ids: ["a"], firstActivityAt: 2_000, valueEur: 10 },
        { provider: "kucoin", name: "KuCoin Files", ids: ["b"], firstActivityAt: 1_000, valueEur: 5 },
      ],
      YEAR
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "KuCoin · KuCoin Files");
    assert.deepEqual(rows[0].ids, ["a", "b"]);
    assert.equal(rows[0].firstActivityAt, 1_000);
    assert.equal(rows[0].valueEur, 15);
  });

  it("classe les comptes à déclarer avant ceux à vérifier et les exemptés", () => {
    const rows = foreignAccounts(
      [
        { provider: "solana", name: "Solana" },
        { provider: "binance", name: "Binance" },
        { provider: "kraken", name: "Kraken" },
      ],
      YEAR
    );
    assert.deepEqual(rows.map((row) => row.status), ["declare", "verify", "exempt"]);
    assert.equal(rows[2].fineEur, null);
  });

  it("ne demande plus un compte clôturé avant l'année déclarée", () => {
    const [row] = foreignAccounts([{ provider: "kraken", name: "Kraken", closedAt: at(2024, 11, 30) }], YEAR);
    assert.equal(row.status, "closed");
    assert.equal(row.fineEur, null);
  });

  it("déclare encore un compte clôturé pendant l'année", () => {
    const [row] = foreignAccounts([{ provider: "kraken", name: "Kraken", closedAt: at(2025, 3, 1) }], YEAR);
    assert.equal(row.status, "declare");
  });

  it("ne tient un groupe pour clôturé que si toutes ses connexions le sont", () => {
    const [row] = foreignAccounts(
      [
        { provider: "kucoin", name: "KuCoin", closedAt: at(2023, 1, 1) },
        { provider: "kucoin", name: "KuCoin Files", closedAt: null },
      ],
      YEAR
    );
    assert.equal(row.status, "declare");
  });

  it("reporte à l'année suivante un compte ouvert après l'année déclarée", () => {
    const [row] = foreignAccounts([{ provider: "kraken", name: "Kraken", firstActivityAt: at(2026, 9, 4) }], YEAR);
    assert.equal(row.status, "upcoming");
    assert.match(row.note, /déclaration 2027/);
  });

  it("demande une vérification pour une plateforme inconnue", () => {
    assert.equal(platformEntity("nouvelle-plateforme").status, "verify");
  });
});
