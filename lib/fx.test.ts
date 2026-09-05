import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_ACCEPTABLE_STALE_DAYS,
  convertUsdToEur,
  createFxResolver,
  isStale,
  startOfUtcDay,
  type FxPoint,
} from "./fx";

const DAY = 86_400_000;
const day = (index: number) => Date.UTC(2025, 0, 1) + index * DAY;

function close(actual: number, expected: number, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `attendu ${expected}, obtenu ${actual} (écart ${Math.abs(actual - expected)})`
  );
}

/** Vendredi, lundi, mardi : le week-end n'a pas de cotation. */
const series: FxPoint[] = [
  { dayUtc: day(0), eurPerUsd: 0.9 },
  { dayUtc: day(3), eurPerUsd: 0.95 },
  { dayUtc: day(4), eurPerUsd: 0.93 },
];

describe("résolution du taux", () => {
  it("retient le taux du jour quand il existe", () => {
    const rateAt = createFxResolver(series);
    close(rateAt(day(3))!.eurPerUsd, 0.95);
  });

  it("retient le dernier taux publié quand le marché était fermé", () => {
    // Samedi et dimanche : c'est le taux de vendredi qui s'applique.
    const rateAt = createFxResolver(series);
    close(rateAt(day(1))!.eurPerUsd, 0.9);
    close(rateAt(day(2))!.eurPerUsd, 0.9);
  });

  it("n'utilise jamais un taux postérieur à l'opération", () => {
    const rateAt = createFxResolver(series);
    // Le 2 janvier ne peut pas connaître le taux du 4.
    assert.equal(rateAt(day(2))!.dayUtc, day(0));
  });

  it("prolonge le dernier taux connu vers le futur", () => {
    const rateAt = createFxResolver(series);
    close(rateAt(day(30))!.eurPerUsd, 0.93);
  });

  it("se rabat sur le plus ancien taux avant le début de la série", () => {
    const rateAt = createFxResolver(series);
    const point = rateAt(day(-10))!;
    close(point.eurPerUsd, 0.9);
    assert.equal(point.dayUtc, day(0));
  });

  it("trie une série fournie en désordre", () => {
    const rateAt = createFxResolver([
      { dayUtc: day(4), eurPerUsd: 0.93 },
      { dayUtc: day(0), eurPerUsd: 0.9 },
      { dayUtc: day(3), eurPerUsd: 0.95 },
    ]);
    close(rateAt(day(3))!.eurPerUsd, 0.95);
    close(rateAt(day(1))!.eurPerUsd, 0.9);
  });

  it("retourne null sur une série vide", () => {
    assert.equal(createFxResolver([])(day(0)), null);
  });
});

describe("conversion", () => {
  const rateAt = createFxResolver(series);

  it("applique le taux du jour de l'opération", () => {
    const conversion = convertUsdToEur(1_000, day(3), rateAt)!;
    close(conversion.amountEur, 950);
    close(conversion.rate, 0.95);
    assert.equal(conversion.staleDays, 0);
  });

  it("mesure l'écart quand le taux vient d'un jour antérieur", () => {
    const conversion = convertUsdToEur(1_000, day(2), rateAt)!;
    close(conversion.amountEur, 900);
    assert.equal(conversion.rateDayUtc, day(0));
    assert.equal(conversion.staleDays, 2);
  });

  it("distingue deux opérations identiques à des dates différentes", () => {
    // Le cœur du problème : un taux figé les confondrait.
    const early = convertUsdToEur(10_000, day(0), rateAt)!;
    const later = convertUsdToEur(10_000, day(3), rateAt)!;
    close(early.amountEur, 9_000);
    close(later.amountEur, 9_500);
    assert.notEqual(early.amountEur, later.amountEur);
  });

  it("refuse de convertir sans taux disponible", () => {
    assert.equal(convertUsdToEur(1_000, day(0), createFxResolver([])), null);
    assert.equal(
      convertUsdToEur(1_000, day(0), createFxResolver([{ dayUtc: day(0), eurPerUsd: 0 }])),
      null
    );
  });

  it("signale une conversion trop éloignée", () => {
    const fresh = convertUsdToEur(100, day(0), rateAt)!;
    const stale = convertUsdToEur(100, day(30), rateAt)!;
    assert.equal(isStale(fresh), false);
    assert.ok(stale.staleDays > MAX_ACCEPTABLE_STALE_DAYS);
    assert.equal(isStale(stale), true);
  });
});

describe("normalisation des dates", () => {
  it("ramène un horodatage au début de sa journée UTC", () => {
    const noon = Date.UTC(2025, 0, 15, 12, 34, 56);
    assert.equal(startOfUtcDay(noon), Date.UTC(2025, 0, 15));
    assert.equal(startOfUtcDay(Date.UTC(2025, 0, 15)), Date.UTC(2025, 0, 15));
  });
});
