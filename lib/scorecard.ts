/**
 * Bulletin du portefeuille : chaque dimension notée de A à E, comme une
 * fiche de gestion. Seuils volontairement simples et lisibles : ils servent
 * à situer, pas à classer au point près.
 */

export type Grade = "A" | "B" | "C" | "D" | "E";

export type ScoreInput = {
  /** Rendement cumulé moins celui de Bitcoin sur la même période. */
  excessReturn: number | null;
  sharpe: number;
  /** Pire perte depuis un sommet, négative. */
  maxDrawdown: number;
  /** Nombre effectif de positions (inverse de l'indice de Herfindahl). */
  effectivePositions: number;
  topWeight: number;
  stablecoinWeight: number;
  /** Taux de préparation du dossier de contrôle, de 0 à 1. */
  auditScore: number;
};

export type ScoreLine = { id: string; label: string; grade: Grade; reading: string };

const grade = (value: number, thresholds: [number, number, number, number]): Grade => {
  const [a, b, c, d] = thresholds;
  if (value >= a) return "A";
  if (value >= b) return "B";
  if (value >= c) return "C";
  if (value >= d) return "D";
  return "E";
};

const pct = (value: number) => `${(value * 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} %`;

export function scorecard(input: ScoreInput): ScoreLine[] {
  const lines: ScoreLine[] = [];
  if (input.excessReturn !== null) {
    lines.push({
      id: "alpha",
      label: "Performance face à Bitcoin",
      grade: grade(input.excessReturn, [0.1, 0, -0.1, -0.3]),
      reading:
        input.excessReturn >= 0
          ? `Vous faites mieux que garder du Bitcoin, de ${pct(input.excessReturn)}.`
          : `Garder du Bitcoin aurait rapporté ${pct(-input.excessReturn)} de plus.`,
    });
  }
  lines.push({
    id: "efficiency",
    label: "Rendement pour le risque pris",
    grade: grade(input.sharpe, [1.5, 1, 0.5, 0]),
    reading: `Sharpe de ${input.sharpe.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} : ${
      input.sharpe >= 1 ? "le risque est bien payé." : input.sharpe >= 0 ? "le risque est peu payé." : "le risque n'a rien rapporté."
    }`,
  });
  lines.push({
    id: "drawdown",
    label: "Tenue dans les baisses",
    grade: grade(input.maxDrawdown, [-0.2, -0.35, -0.5, -0.7]),
    reading: `Pire perte depuis un sommet : ${pct(input.maxDrawdown)}.`,
  });
  lines.push({
    id: "diversification",
    label: "Diversification",
    grade: grade(Math.min(input.effectivePositions / 6, 1) - Math.max(0, input.topWeight - 0.6), [0.8, 0.6, 0.4, 0.2]),
    reading: `${input.effectivePositions.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} positions effectives ; la première pèse ${pct(input.topWeight)}.`,
  });
  lines.push({
    id: "liquidity",
    label: "Réserve de liquidités",
    grade: grade(input.stablecoinWeight, [0.15, 0.08, 0.03, 0.01]),
    reading: `${pct(input.stablecoinWeight)} en stablecoins, mobilisables sans vendre.`,
  });
  lines.push({
    id: "compliance",
    label: "Prêt pour un contrôle",
    grade: grade(input.auditScore, [0.95, 0.85, 0.7, 0.5]),
    reading: `Dossier de justification prêt à ${pct(input.auditScore)}.`,
  });
  return lines;
}
