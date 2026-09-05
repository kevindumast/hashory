import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CORRELATION_THRESHOLD,
  STALE_SOURCE_DAYS,
  computeSignals,
  type SignalIntegration,
  type SignalInput,
} from "./signals";

const DAY = 86_400_000;
const NOW = Date.UTC(2025, 8, 5);

const healthySource: SignalIntegration = {
  id: "int-1",
  label: "Binance",
  syncStatus: "synced",
  lastSyncedAt: NOW - DAY,
  syncEnabled: true,
  isFileImport: false,
};

/** Situation saine : aucun signal ne doit remonter. */
const quiet: SignalInput = {
  now: NOW,
  integrations: [healthySource],
  topAsset: { key: "BTC", weight: 0.3 },
  effectiveCount: 4,
  topVenue: { key: "Binance", weight: 0.4 },
  averageCorrelation: 0.4,
  taxYear: { year: 2025, proceedsEur: 100, estimatedTaxEur: 0 },
  stablecoinReserveUsd: 5_000,
  hasIncompleteValuation: false,
  hasMissingFxRates: false,
};

const ids = (input: SignalInput) => computeSignals(input).map((signal) => signal.id);

describe("silence par défaut", () => {
  it("ne signale rien quand tout va bien", () => {
    // Une liste toujours pleine ne se lit plus : l'absence de signal compte.
    assert.deepEqual(computeSignals(quiet), []);
  });
});

describe("sources", () => {
  it("remonte une erreur en critique", () => {
    const signals = computeSignals({
      ...quiet,
      integrations: [{ ...healthySource, syncStatus: "error" }],
    });
    assert.equal(signals.length, 1);
    assert.equal(signals[0].severity, "critical");
    assert.equal(signals[0].href, "/dashboard/accounts");
  });

  it("signale une source silencieuse au-delà du délai", () => {
    const stale = { ...healthySource, lastSyncedAt: NOW - (STALE_SOURCE_DAYS + 1) * DAY };
    assert.deepEqual(ids({ ...quiet, integrations: [stale] }), ["source-stale-int-1"]);

    // Juste en deçà du délai, rien ne se déclenche.
    const fresh = { ...healthySource, lastSyncedAt: NOW - (STALE_SOURCE_DAYS - 1) * DAY };
    assert.deepEqual(ids({ ...quiet, integrations: [fresh] }), []);
  });

  it("signale une source jamais synchronisée", () => {
    const never = { ...healthySource, lastSyncedAt: null };
    const signals = computeSignals({ ...quiet, integrations: [never] });
    assert.equal(signals.length, 1);
    assert.ok(signals[0].detail.includes("jamais"));
  });

  it("se tait sur une source volontairement en pause", () => {
    const paused = { ...healthySource, syncEnabled: false, lastSyncedAt: NOW - 60 * DAY };
    assert.deepEqual(ids({ ...quiet, integrations: [paused] }), []);
  });

  it("se tait sur un import de fichier, qui ne se met pas à jour seul", () => {
    const file = { ...healthySource, isFileImport: true, lastSyncedAt: NOW - 60 * DAY };
    assert.deepEqual(ids({ ...quiet, integrations: [file] }), []);
  });

  it("se tait pendant une synchronisation en cours", () => {
    const running = {
      ...healthySource,
      syncStatus: "syncing" as const,
      lastSyncedAt: NOW - 60 * DAY,
    };
    assert.deepEqual(ids({ ...quiet, integrations: [running] }), []);
  });

  it("préfère l'erreur à l'ancienneté pour une même source", () => {
    const broken = {
      ...healthySource,
      syncStatus: "error" as const,
      lastSyncedAt: NOW - 60 * DAY,
    };
    // Une seule ligne, la plus grave : deux entrées pour le même compte
    // diluerait le message.
    assert.deepEqual(ids({ ...quiet, integrations: [broken] }), ["source-error-int-1"]);
  });
});

describe("concentration", () => {
  it("signale une position dominante", () => {
    const signals = computeSignals({
      ...quiet,
      topAsset: { key: "BTC", weight: 0.72 },
      effectiveCount: 1.6,
    });
    assert.deepEqual(
      signals.map((s) => s.id),
      ["concentration-asset"]
    );
    assert.ok(signals[0].title.includes("72 %"));
  });

  it("signale une contrepartie dominante", () => {
    const signals = computeSignals({ ...quiet, topVenue: { key: "Binance", weight: 0.8 } });
    assert.deepEqual(
      signals.map((s) => s.id),
      ["concentration-venue"]
    );
  });

  it("signale une diversification illusoire", () => {
    const signals = computeSignals({
      ...quiet,
      averageCorrelation: CORRELATION_THRESHOLD + 0.05,
    });
    assert.deepEqual(
      signals.map((s) => s.id),
      ["correlation"]
    );
    assert.equal(signals[0].severity, "info");
  });

  it("ne dit rien sans corrélation calculable", () => {
    assert.deepEqual(ids({ ...quiet, averageCorrelation: null }), []);
  });
});

describe("fiscalité", () => {
  it("alerte quand la réserve ne couvre pas l'impôt dû", () => {
    const signals = computeSignals({
      ...quiet,
      taxYear: { year: 2025, proceedsEur: 40_000, estimatedTaxEur: 6_000 },
      stablecoinReserveUsd: 1_000,
    });
    assert.deepEqual(
      signals.map((s) => s.id),
      ["tax-provision"]
    );
  });

  it("se tait quand la réserve suffit", () => {
    assert.deepEqual(
      ids({
        ...quiet,
        taxYear: { year: 2025, proceedsEur: 40_000, estimatedTaxEur: 3_000 },
        stablecoinReserveUsd: 10_000,
      }),
      []
    );
  });

  it("prévient à l'approche du seuil de déclaration", () => {
    const signals = computeSignals({
      ...quiet,
      taxYear: { year: 2025, proceedsEur: 280, estimatedTaxEur: 0 },
    });
    assert.deepEqual(
      signals.map((s) => s.id),
      ["tax-threshold"]
    );
  });

  it("ne prévient plus une fois le seuil franchi", () => {
    // Au-delà, l'obligation est acquise : le rapport prend le relais.
    assert.deepEqual(
      ids({ ...quiet, taxYear: { year: 2025, proceedsEur: 400, estimatedTaxEur: 0 } }),
      []
    );
  });
});

describe("qualité des données déclaratives", () => {
  it("signale l'absence de taux de change", () => {
    assert.deepEqual(ids({ ...quiet, hasMissingFxRates: true }), ["fx-missing"]);
  });

  it("signale une valorisation incomplète", () => {
    assert.deepEqual(ids({ ...quiet, hasIncompleteValuation: true }), ["valuation-incomplete"]);
  });
});

describe("classement", () => {
  it("place le plus grave en tête", () => {
    const signals = computeSignals({
      ...quiet,
      integrations: [
        { ...healthySource, id: "a", label: "A", syncStatus: "error" },
        { ...healthySource, id: "b", label: "B", lastSyncedAt: NOW - 30 * DAY },
      ],
      averageCorrelation: 0.95,
    });
    assert.deepEqual(
      signals.map((s) => s.severity),
      ["critical", "warning", "info"]
    );
  });
});
