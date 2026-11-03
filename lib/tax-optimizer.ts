/**
 * Ce qu'il reste à faire avant le 31 décembre.
 *
 * Trois leviers, tous fondés sur le 150 VH bis :
 * - le seuil de 305 € : une année dont les cessions totales ne l'excèdent
 *   pas est exonérée ;
 * - la compensation : les moins-values de l'année s'imputent sur les
 *   plus-values de la même année, et elles seules (aucun report) ;
 * - le calendrier : une vente du 2 janvier se déclare un an plus tard
 *   qu'une vente du 31 décembre.
 *
 * Tout est en euros, devise de la déclaration.
 */

import { ANNUAL_EXEMPTION_EUR, PFU_RATE } from "./tax";

export type OptimizerInput = {
  /** Prix de cession cumulés depuis le 1er janvier. */
  yearProceedsEur: number;
  /** Plus ou moins-value nette réalisée depuis le 1er janvier. */
  yearGainEur: number;
  /** Valeur actuelle du portefeuille. */
  portfolioValueEur: number;
  /** Prix total d'acquisition restant du portefeuille. */
  acquisitionCostEur: number;
  now: Date;
};

export type Lever =
  | {
      kind: "threshold";
      /** Ventes encore possibles sans dépasser le seuil. */
      remainingEur: number;
    }
  | {
      kind: "offset";
      /** Montant à vendre pour effacer la plus-value réalisée. */
      saleEur: number;
      /** Moins-value réalisée par cette vente. */
      lossEur: number;
      /** Impôt évité. */
      taxSavedEur: number;
      /** Vrai si même une vente totale ne suffit pas à tout effacer. */
      partial: boolean;
    }
  | {
      kind: "defer";
      /** Part imposable de chaque euro vendu aujourd'hui. */
      taxablePerEuro: number;
      daysLeft: number;
    };

const DAY_MS = 86_400_000;

/** Jours restants jusqu'au 31 décembre inclus. */
export function daysLeftInYear(now: Date): number {
  const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));
}

export function yearEndLevers(input: OptimizerInput): Lever[] {
  const levers: Lever[] = [];
  const { portfolioValueEur: value, acquisitionCostEur: cost } = input;
  if (value <= 0) return levers;

  // Part de chaque euro vendu qui est un gain (négative en moins-value).
  const gainPerEuro = 1 - cost / value;

  if (input.yearProceedsEur <= ANNUAL_EXEMPTION_EUR) {
    levers.push({ kind: "threshold", remainingEur: ANNUAL_EXEMPTION_EUR - input.yearProceedsEur });
  }

  if (input.yearGainEur > 0 && gainPerEuro < 0) {
    // Vendre P réalise P × gainPerEuro : de quoi compenser la plus-value acquise.
    const needed = input.yearGainEur / -gainPerEuro;
    const saleEur = Math.min(needed, value);
    const lossEur = saleEur * -gainPerEuro;
    levers.push({
      kind: "offset",
      saleEur,
      lossEur,
      taxSavedEur: Math.min(lossEur, input.yearGainEur) * PFU_RATE,
      partial: needed > value,
    });
  }

  // En fin d'année, avec une plus-value latente, attendre janvier décale l'impôt d'un an.
  const daysLeft = daysLeftInYear(input.now);
  if (gainPerEuro > 0 && daysLeft <= 60) {
    levers.push({ kind: "defer", taxablePerEuro: gainPerEuro, daysLeft });
  }

  return levers;
}
