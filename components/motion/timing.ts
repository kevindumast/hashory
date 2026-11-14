/**
 * Délais de cascade, sans dépendance au navigateur : utilisables depuis les
 * pages serveur comme depuis les composants client.
 */

/**
 * Délai d'apparition du mot n : les écarts raccourcissent (70 ms, 64, 58…
 * jusqu'à 30 ms) pour que le titre arrive comme une vague, pas au rythme
 * d'un métronome. Le dernier mot d'un long titre ne fait pas attendre.
 */
export function wordDelay(index: number): number {
  let delay = 0;
  for (let i = 0; i < index; i += 1) delay += Math.max(30, 70 - i * 6);
  return delay;
}

/**
 * Délai d'un élément dans une cascade : écarts qui raccourcissent et total
 * plafonné, pour que la grille arrive en vague sans faire attendre le
 * dernier élément.
 */
export function staggerDelay(index: number, step = 70): number {
  let delay = 0;
  for (let i = 0; i < Math.min(index, 5); i += 1) delay += Math.max(step * 0.4, step - i * (step * 0.15));
  return Math.round(delay);
}
