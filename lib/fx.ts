/**
 * Conversion de devise adossée à un historique de taux.
 *
 * Le produit calcule en dollars, mais une déclaration française se fait en
 * euros, **au cours du change du jour de chaque opération**. Un taux moyen,
 * et a fortiori un taux figé, ne convient pas : sur une année où l'euro varie
 * de 10 %, il déplace la plus-value déclarée d'autant.
 *
 * Ce module ne récupère aucune donnée : il applique une série de taux fournie
 * par l'appelant. Toute la logique est donc pure et testable.
 */

/** Un taux de change quotidien : combien d'euros pour un dollar. */
export type FxPoint = {
  dayUtc: number;
  /** Euros par dollar. 0,92 signifie qu'un dollar vaut 0,92 euro. */
  eurPerUsd: number;
};

export type FxConversion = {
  amountEur: number;
  /** Taux effectivement appliqué. */
  rate: number;
  /** Jour du taux retenu — antérieur à la demande si le marché était fermé. */
  rateDayUtc: number;
  /**
   * Écart en jours entre l'opération et le taux retenu. Au-delà de quelques
   * jours, la conversion mérite d'être signalée.
   */
  staleDays: number;
};

const DAY_MS = 86_400_000;

/** Ramène un horodatage au début de sa journée UTC. */
export function startOfUtcDay(timestamp: number): number {
  return Math.floor(timestamp / DAY_MS) * DAY_MS;
}

/**
 * Index de recherche sur une série de taux triée par date croissante.
 *
 * Les marchés de change ferment le week-end et les jours fériés : on retient
 * le dernier taux publié à la date demandée, jamais un taux postérieur, qui
 * reviendrait à utiliser une information non disponible le jour de
 * l'opération.
 */
export function createFxResolver(points: FxPoint[]) {
  const series = [...points].sort((a, b) => a.dayUtc - b.dayUtc);

  return function rateAt(timestamp: number): FxPoint | null {
    if (series.length === 0) return null;
    const day = startOfUtcDay(timestamp);

    // Recherche dichotomique du dernier point à cette date ou avant.
    let low = 0;
    let high = series.length - 1;
    let found = -1;

    while (low <= high) {
      const middle = (low + high) >> 1;
      if (series[middle].dayUtc <= day) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    // Aucun taux antérieur : plutôt que de renoncer, on prend le plus ancien
    // connu. Mieux vaut une conversion datée et signalée que pas de montant.
    return found >= 0 ? series[found] : series[0];
  };
}

/**
 * Convertit un montant en dollars vers l'euro, au taux du jour de l'opération.
 * Retourne `null` si aucun taux n'est disponible : mieux vaut ne rien
 * afficher qu'un montant faux.
 */
export function convertUsdToEur(
  amountUsd: number,
  timestamp: number,
  rateAt: (timestamp: number) => FxPoint | null
): FxConversion | null {
  const point = rateAt(timestamp);
  if (!point || point.eurPerUsd <= 0) return null;

  const day = startOfUtcDay(timestamp);
  return {
    amountEur: amountUsd * point.eurPerUsd,
    rate: point.eurPerUsd,
    rateDayUtc: point.dayUtc,
    // Un taux postérieur à l'opération signale un historique incomplet en
    // amont : on compte l'écart en valeur absolue.
    staleDays: Math.abs(Math.round((day - point.dayUtc) / DAY_MS)),
  };
}

/**
 * Au-delà de ce décalage, le taux retenu n'est plus représentatif du jour de
 * l'opération et la conversion doit être signalée à l'utilisateur.
 */
export const MAX_ACCEPTABLE_STALE_DAYS = 5;

/** Vrai si la conversion repose sur un taux trop éloigné de l'opération. */
export function isStale(conversion: FxConversion, limit = MAX_ACCEPTABLE_STALE_DAYS): boolean {
  return conversion.staleDays > limit;
}
