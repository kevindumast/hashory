/**
 * Mathématiques des gestes : résistance aux bords, projection de l'élan,
 * vitesse au relâcher. Fonctions pures, sans DOM, pour pouvoir les tester.
 */

/**
 * Résistance progressive au-delà d'une borne (« rubber band » d'iOS) :
 * plus on tire, moins l'élément suit. Renvoie le déplacement affiché pour
 * un dépassement donné, toujours plus petit que lui et borné par `dimension`.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  if (dimension <= 0) return 0;
  const sign = Math.sign(overshoot);
  const distance = Math.abs(overshoot);
  return (sign * (distance * dimension * constant)) / (dimension + constant * distance);
}

/**
 * Distance parcourue par l'élan après le relâcher, comme le défilement
 * natif (décélération exponentielle d'Apple). Vitesse en px/s.
 * `decelerationRate` 0,998 = défilement normal ; 0,99 = plus sec.
 */
export function projectMomentum(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

export type PointerSample = { t: number; y: number };

/**
 * Vitesse (px/s) estimée sur les derniers échantillons du glisser.
 * Les échantillons plus vieux que `windowMs` sont ignorés : un doigt qui
 * s'est arrêté avant de se lever a une vitesse nulle.
 */
export function releaseVelocity(samples: PointerSample[], now: number, windowMs = 100): number {
  const recent = samples.filter((sample) => now - sample.t <= windowMs);
  if (recent.length < 2) return 0;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = last.t - first.t;
  if (dt <= 0) return 0;
  return ((last.y - first.y) / dt) * 1000;
}

/**
 * Fermer ou revenir ? On projette l'élan à partir de la position au
 * relâcher : une pichenette rapide ferme même sur une courte distance,
 * un glisser lent au-delà de la moitié ferme aussi.
 */
export function shouldDismiss(offset: number, velocity: number, size: number, threshold = 0.5): boolean {
  if (size <= 0) return false;
  // Un geste qui remonte ne ferme jamais, quelle que soit la distance.
  if (velocity < -50) return false;
  return offset + projectMomentum(velocity) > size * threshold;
}

/** Opacité du voile liée à la progression : 1 ouvert, 0 fermé. */
export function overlayOpacity(offset: number, size: number): number {
  if (size <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - offset / size));
}
