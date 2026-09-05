/**
 * Construction des exports.
 *
 * La mise en forme est séparée du téléchargement : ces fonctions sont pures,
 * donc testables, et le composant ne fait qu'écrire le fichier obtenu.
 *
 * Le format visé est le CSV lisible par un tableur français : séparateur
 * point-virgule, virgule décimale, marque d'ordre des octets pour qu'Excel
 * reconnaisse l'UTF-8. Un export fiscal finit chez un comptable ; il doit
 * s'ouvrir sans manipulation.
 */

export type CellValue = string | number | null | undefined;

export type Sheet = {
  /** Nom de fichier proposé, extension comprise. */
  filename: string;
  columns: string[];
  rows: CellValue[][];
};

/** Séparateur attendu par les tableurs en configuration française. */
const SEPARATOR = ";";

/**
 * Échappe une valeur pour le CSV.
 *
 * Sans cela, un libellé contenant un point-virgule, un guillemet ou un
 * retour à la ligne décale toutes les colonnes suivantes — et un fichier
 * fiscal silencieusement décalé est pire qu'un fichier absent.
 */
export function escapeCsvValue(value: CellValue, separator = SEPARATOR): string {
  if (value === null || value === undefined) return "";

  // Les nombres passent en notation française : la virgule décimale est ce
  // qu'attend un tableur configuré en France.
  const raw = typeof value === "number" ? String(value).replace(".", ",") : String(value);

  const needsQuoting =
    raw.includes(separator) || raw.includes('"') || raw.includes("\n") || raw.includes("\r");

  if (!needsQuoting) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

/** Sérialise une feuille en CSV, en-tête compris. */
export function serializeCsv(sheet: Sheet, separator = SEPARATOR): string {
  const lines = [sheet.columns.map((column) => escapeCsvValue(column, separator)).join(separator)];

  for (const row of sheet.rows) {
    lines.push(row.map((cell) => escapeCsvValue(cell, separator)).join(separator));
  }

  return lines.join("\r\n");
}

/* ─── Feuilles ─────────────────────────────────────────────────── */

const isoDate = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

/** Arrondit à deux décimales sans passer par une chaîne. */
const money = (value: number | null | undefined): number | null =>
  value === null || value === undefined ? null : Math.round(value * 100) / 100;

export type TaxSheetEvent = {
  date: number;
  asset: string;
  quantity: number;
  proceedsUsd: number;
  costBasisUsd: number;
  gainLossUsd: number;
  proceedsEur: number | null;
  costBasisEur: number | null;
  gainLossEur: number | null;
  fxRate: number | null;
  source: string;
};

/**
 * Détail des cessions imposables d'une année.
 *
 * L'euro vient en premier : c'est la devise de la déclaration. Le dollar et
 * le taux appliqué suivent, pour que les montants restent vérifiables ligne
 * à ligne par un tiers.
 */
export function taxSheet(year: number, events: TaxSheetEvent[]): Sheet {
  return {
    filename: `hashory-cessions-${year}.csv`,
    columns: [
      "Date",
      "Actif",
      "Quantité cédée",
      "Prix de cession (EUR)",
      "Prix de revient (EUR)",
      "Plus ou moins-value (EUR)",
      "Prix de cession (USD)",
      "Prix de revient (USD)",
      "Plus ou moins-value (USD)",
      "Taux EUR/USD appliqué",
      "Origine",
    ],
    rows: events.map((event) => [
      isoDate(event.date),
      event.asset,
      event.quantity,
      money(event.proceedsEur),
      money(event.costBasisEur),
      money(event.gainLossEur),
      money(event.proceedsUsd),
      money(event.costBasisUsd),
      money(event.gainLossUsd),
      event.fxRate,
      event.source,
    ]),
  };
}

export type PortfolioSheetPosition = {
  symbol: string;
  quantity: number;
  avgCostBasis: number;
  currentPrice: number | null;
  valueUsd: number | null;
  costUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number | null;
  weight: number;
  sources: string;
};

/** État du portefeuille, position par position. */
export function portfolioSheet(positions: PortfolioSheetPosition[], asOf: number): Sheet {
  return {
    filename: `hashory-portefeuille-${isoDate(asOf)}.csv`,
    columns: [
      "Actif",
      "Quantité",
      "Prix de revient unitaire (USD)",
      "Cours actuel (USD)",
      "Écart au prix de revient (%)",
      "Capital investi (USD)",
      "Valeur actuelle (USD)",
      "Plus-value latente (USD)",
      "Résultat réalisé (USD)",
      "Poids (%)",
      "Sources",
    ],
    rows: positions.map((position) => [
      position.symbol,
      position.quantity,
      money(position.avgCostBasis),
      money(position.currentPrice),
      position.currentPrice !== null && position.avgCostBasis > 0
        ? Math.round((position.currentPrice / position.avgCostBasis - 1) * 1000) / 10
        : null,
      money(position.costUsd),
      money(position.valueUsd),
      money(position.unrealizedPnlUsd),
      money(position.realizedPnlUsd),
      Math.round(position.weight * 1000) / 10,
      position.sources,
    ]),
  };
}
