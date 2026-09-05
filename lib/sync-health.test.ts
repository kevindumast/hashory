import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  STALLED_AFTER_MS,
  assessSyncHealth,
  formatElapsed,
  type SyncJob,
} from "./sync-health";

const NOW = 1_760_000_000_000;
const MINUTE = 60_000;

const pending: SyncJob = { state: "pending" };
const running: SyncJob = { state: "inProgress" };
const done: SyncJob = { state: "success" };

describe("assessSyncHealth", () => {
  it("ne dit rien d'un compte qui ne synchronise pas", () => {
    for (const syncStatus of ["idle", "synced", "error"] as const) {
      const health = assessSyncHealth({ syncStatus, startedAt: NOW - MINUTE, now: NOW });
      assert.equal(health.kind, "idle");
      assert.equal(health.message, null);
      assert.equal(health.canCancel, false);
    }
  });

  it("laisse tourner une synchronisation récente", () => {
    const health = assessSyncHealth({
      syncStatus: "syncing",
      startedAt: NOW - 2 * MINUTE,
      jobs: [pending],
      now: NOW,
    });
    assert.equal(health.kind, "running");
    assert.equal(health.message, null);
    assert.equal(health.elapsedMs, 2 * MINUTE);
    assert.equal(health.canCancel, true);
  });

  it("signale une synchronisation qui dure au-delà du seuil", () => {
    const health = assessSyncHealth({
      syncStatus: "syncing",
      startedAt: NOW - STALLED_AFTER_MS,
      jobs: [running],
      now: NOW,
    });
    assert.equal(health.kind, "stalled");
    assert.match(health.message ?? "", /anormalement/);
  });

  it("conclut qu'il n'y a plus rien à attendre quand aucune tâche n'est active", () => {
    const health = assessSyncHealth({
      syncStatus: "syncing",
      startedAt: NOW - MINUTE,
      jobs: [done, { state: "canceled" }],
      now: NOW,
    });
    assert.equal(health.kind, "orphaned");
    assert.match(health.message ?? "", /plus rien à attendre/);
  });

  it("fait remonter le message d'une étape en échec", () => {
    const health = assessSyncHealth({
      syncStatus: "syncing",
      startedAt: NOW - MINUTE,
      jobs: [done, { state: "failed", error: "User is not authenticated." }],
      now: NOW,
    });
    assert.equal(health.kind, "failed");
    assert.match(health.message ?? "", /User is not authenticated/);
  });

  it("préfère l'échec au simple constat d'inactivité", () => {
    // Les deux conditions sont réunies : l'échec est le plus instructif.
    const health = assessSyncHealth({
      syncStatus: "syncing",
      startedAt: NOW - 5 * STALLED_AFTER_MS,
      jobs: [{ state: "failed", error: "boom" }],
      now: NOW,
    });
    assert.equal(health.kind, "failed");
  });

  it("sans tâche suivie, ne juge que sur la durée", () => {
    // Les synchronisations antérieures à ce suivi n'ont aucune tâche
    // enregistrée : leur absence ne doit pas passer pour une fin de travail.
    const fresh = assessSyncHealth({
      syncStatus: "syncing",
      startedAt: NOW - MINUTE,
      jobs: [],
      now: NOW,
    });
    assert.equal(fresh.kind, "running");

    const old = assessSyncHealth({
      syncStatus: "syncing",
      startedAt: NOW - STALLED_AFTER_MS - MINUTE,
      jobs: [],
      now: NOW,
    });
    assert.equal(old.kind, "stalled");
  });

  it("reste prudent quand le départ est inconnu", () => {
    const health = assessSyncHealth({ syncStatus: "syncing", startedAt: null, now: NOW });
    assert.equal(health.kind, "running");
    assert.equal(health.elapsedMs, null);
  });

  it("ne rend jamais de durée négative", () => {
    // Horloge du navigateur en avance sur celle du serveur.
    const health = assessSyncHealth({
      syncStatus: "syncing",
      startedAt: NOW + 30_000,
      now: NOW,
    });
    assert.equal(health.elapsedMs, 0);
  });
});

describe("formatElapsed", () => {
  it("formule les durées comme on les dirait", () => {
    assert.equal(formatElapsed(30_000), "moins d'une minute");
    assert.equal(formatElapsed(5 * MINUTE), "5 min");
    assert.equal(formatElapsed(59 * MINUTE), "59 min");
    assert.equal(formatElapsed(60 * MINUTE), "1 h");
    assert.equal(formatElapsed(95 * MINUTE), "1 h 35");
    assert.equal(formatElapsed(26 * 60 * MINUTE), "1 jour");
    assert.equal(formatElapsed(50 * 60 * MINUTE), "2 jours");
  });
});
