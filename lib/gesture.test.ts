import { test } from "node:test";
import assert from "node:assert/strict";
import { overlayOpacity, projectMomentum, releaseVelocity, rubberband, shouldDismiss } from "./gesture";

test("rubberband : résiste de plus en plus et ne dépasse jamais la dimension", () => {
  const small = rubberband(20, 400);
  const large = rubberband(200, 400);
  assert.ok(small > 0 && small < 20, "un petit dépassement suit en partie");
  assert.ok(large < 200 * 0.55, "un grand dépassement suit beaucoup moins");
  assert.ok(large / 200 < small / 20, "la résistance augmente avec la distance");
  assert.ok(rubberband(1e6, 400) < 400);
  assert.equal(rubberband(-20, 400), -small, "symétrique");
  assert.equal(rubberband(50, 0), 0);
});

test("projectMomentum : formule d'Apple (décélération 0,998)", () => {
  assert.equal(Math.round(projectMomentum(1000)), 499);
  assert.equal(projectMomentum(0), 0);
  assert.ok(projectMomentum(-500) < 0);
});

test("releaseVelocity : vitesse sur les 100 dernières ms, nulle si le doigt s'est arrêté", () => {
  const samples = [
    { t: 0, y: 0 },
    { t: 50, y: 40 },
    { t: 100, y: 80 },
  ];
  assert.equal(releaseVelocity(samples, 100), 800);
  assert.equal(releaseVelocity(samples, 400), 0, "échantillons trop vieux");
  assert.equal(releaseVelocity([{ t: 0, y: 0 }], 0), 0);
});

test("shouldDismiss : distance ou élan, jamais en remontant", () => {
  const height = 400;
  assert.equal(shouldDismiss(30, 0, height), false, "petit glisser lent : retour");
  assert.equal(shouldDismiss(250, 0, height), true, "au-delà de la moitié : ferme");
  assert.equal(shouldDismiss(40, 800, height), true, "pichenette : ferme sur une courte distance");
  assert.equal(shouldDismiss(300, -600, height), false, "geste qui remonte : retour");
  assert.equal(shouldDismiss(100, 0, 0), false);
});

test("overlayOpacity : suit la progression, bornée entre 0 et 1", () => {
  assert.equal(overlayOpacity(0, 400), 1);
  assert.equal(overlayOpacity(200, 400), 0.5);
  assert.equal(overlayOpacity(800, 400), 0);
  assert.equal(overlayOpacity(-40, 400), 1);
});
