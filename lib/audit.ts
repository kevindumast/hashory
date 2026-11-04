/**
 * Dossier de contrôle : ce qu'un vérificateur des impôts demanderait de
 * produire, et où en est chaque pièce.
 *
 * Pur : prend le rapport fiscal déjà calculé et en tire une liste de
 * contrôles, un taux de préparation et les feuilles du dossier à exporter.
 */

import type { CellValue, Sheet } from "./export";
import type { TaxReportResult } from "../convex/taxReport";
import { categoryInfo, type JustificationCategory } from "./justification";

export type AuditCheck = {
  id: string;
  title: string;
  status: "ok" | "warn" | "todo";
  /** Ce qui est en place, ou ce qui manque. */
  detail: string;
  /** La pièce à conserver pour ce point. */
  evidence: string;
  /** Poids dans le taux de préparation. */
  weight: number;
  /** Part du point couverte, de 0 à 1. */
  coverage: number;
};

export type AuditReadiness = {
  checks: AuditCheck[];
  /** Taux de préparation pondéré, de 0 à 1. */
  score: number;
  /** Valeur restant à justifier, en euros. */
  pendingEur: number;
};

const eur = (value: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;

/** Part pointée d'une liste d'opérations signalées, en valeur (en nombre faute de cours). */
function coverageOf(summary: TaxReportResult["unknownCostInflows"]): number {
  const done = summary.justifiedValueEur ?? 0;
  const total = done + summary.valueEur;
  if (total > 0) return done / total;
  const doneCount = summary.justifiedCount ?? 0;
  return doneCount + summary.count > 0 ? doneCount / (doneCount + summary.count) : 1;
}

export function auditReadiness(result: TaxReportResult, accounts: { closed: number; total: number } = { closed: 0, total: 0 }): AuditReadiness {
  const audit = result.audit;
  const inflows = result.unknownCostInflows;
  const outflows = result.untrackedOutflows;
  const cessions = result.reports.reduce((sum, report) => sum + report.events.length, 0);
  const undeclared = audit?.undeclaredCessions ?? { count: 0, valueEur: 0 };
  const dexSwaps = (audit?.dexSwaps ?? []).reduce((sum, row) => sum + row.count, 0);
  const unknownDex = (audit?.dexSwaps ?? []).find((row) => row.protocol === "Inconnu")?.count ?? 0;

  const checks: AuditCheck[] = [
    {
      id: "sources",
      title: "Historique des plateformes",
      status: accounts.total > 0 ? "ok" : "todo",
      detail:
        accounts.total > 0
          ? `${plural(accounts.total, "compte")} suivi${accounts.total > 1 ? "s" : ""}, ${plural(audit?.operations ?? 0, "opération")} depuis ${audit?.firstOperationAt ? new Date(audit.firstOperationAt).getFullYear() : "—"}.`
          : "Aucun compte connecté.",
      evidence: "Export complet de chaque plateforme (CSV ou PDF), relevés de wallets : à télécharger et archiver chaque année.",
      weight: 1,
      coverage: accounts.total > 0 ? 1 : 0,
    },
    {
      id: "acquisitions",
      title: "Prix total d'acquisition",
      status: (audit?.totalAcquiredEur ?? 0) > 0 || cessions === 0 ? "ok" : "warn",
      detail: `${eur(audit?.totalAcquiredEur ?? 0)} versés pour acquérir des actifs numériques, dont ${eur(
        (audit?.acquisitions ?? []).filter((row) => row.kind === "justified").reduce((sum, row) => sum + row.costEur, 0)
      )} pointés à la main.`,
      evidence: "Relevés bancaires des virements vers les plateformes, confirmations d'achat, factures des achats hors plateforme.",
      weight: 2,
      coverage: 1,
    },
    {
      id: "inflows",
      title: "Origine de chaque jeton",
      status: inflows.count === 0 ? "ok" : "warn",
      detail:
        inflows.count === 0
          ? (inflows.justifiedCount ?? 0) > 0
            ? `Les ${plural(inflows.justifiedCount ?? 0, "entrée")} sans prix connu sont toutes pointées.`
            : "Chaque jeton détenu a une origine connue."
          : `${plural(inflows.count, "entrée")} (${eur(inflows.valueEur)}) sans origine justifiée, comptée${inflows.count > 1 ? "s" : ""} à coût nul.`,
      evidence: "Pour chaque entrée pointée : la facture, le retrait de la plateforme d'origine, ou la preuve de l'airdrop.",
      weight: 3,
      coverage: coverageOf(inflows),
    },
    {
      id: "outflows",
      title: "Destination de chaque envoi",
      status: outflows.count === 0 ? "ok" : "warn",
      detail:
        outflows.count === 0
          ? "Chaque envoi est rapproché ou pointé."
          : `${plural(outflows.count, "envoi")} (${eur(outflows.valueEur)}) vers un compte non suivi, sans explication.`,
      evidence: "Pour un wallet à vous : son adresse et son historique. Pour un paiement : la facture du bien obtenu.",
      weight: 2,
      coverage: coverageOf(outflows),
    },
    {
      id: "undeclared",
      title: "Cessions faites hors de Hashory",
      status: undeclared.count === 0 ? "ok" : "warn",
      detail:
        undeclared.count === 0
          ? "Aucun envoi pointé comme paiement ou vente ailleurs."
          : `${plural(undeclared.count, "envoi")} (${eur(undeclared.valueEur)}) pointé${undeclared.count > 1 ? "s" : ""} comme paiement ou vente ailleurs : des cessions à ajouter au 2086.`,
      evidence: "Le relevé de la plateforme de vente, ou la facture du bien payé en crypto.",
      weight: 2,
      coverage: undeclared.count === 0 ? 1 : 0,
    },
    {
      id: "valuation",
      title: "Cours et change du jour",
      status: !result.hasIncompleteValuation && !result.hasMissingFxRates ? "ok" : "warn",
      detail:
        !result.hasIncompleteValuation && !result.hasMissingFxRates
          ? "Chaque cession est valorisée au cours de son jour et au change BCE."
          : "Des cours ou des taux de change manquent : la valeur du portefeuille est incomplète.",
      evidence: "Source des cours (Binance, KuCoin, CoinGecko) et taux BCE : cités dans la méthode du dossier.",
      weight: 1,
      coverage: !result.hasIncompleteValuation && !result.hasMissingFxRates ? 1 : 0.5,
    },
    {
      id: "swaps",
      title: "Échanges crypto contre crypto",
      status: unknownDex === 0 ? "ok" : "warn",
      detail:
        dexSwaps + (result.serviceSwaps?.length ?? 0) === 0
          ? "Aucun swap on-chain ni via un service."
          : `${plural(dexSwaps, "swap")} sur un DEX${unknownDex ? ` (dont ${unknownDex} au DEX non reconnu)` : ""}, ${plural(result.serviceSwaps?.length ?? 0, "échange")} via un service : non imposables, hash à conserver.`,
      evidence: "Le hash de chaque swap : il prouve un échange crypto contre crypto, en sursis d'imposition.",
      weight: 1,
      coverage: dexSwaps > 0 ? 1 - unknownDex / dexSwaps : 1,
    },
    {
      id: "closures",
      title: "Comptes à l'étranger (3916-bis)",
      status: "ok",
      detail:
        accounts.total > 0
          ? `${plural(accounts.total, "compte")}, dont ${accounts.closed} clôturé${accounts.closed > 1 ? "s" : ""} : à déclarer chaque année tant qu'ils sont ouverts.`
          : "Aucun compte à déclarer.",
      evidence: "Date d'ouverture et de clôture de chaque compte, adresse de la plateforme.",
      weight: 1,
      coverage: 1,
    },
  ];

  const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0);
  const score = checks.reduce((sum, check) => sum + check.weight * check.coverage, 0) / totalWeight;
  return { checks, score, pendingEur: inflows.valueEur + outflows.valueEur };
}

// ─── Feuilles du dossier ──────────────────────────────────────────────────

const day = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

export function cessionsSheet(result: TaxReportResult, nameOf: (account: string) => string): Sheet {
  const rows: CellValue[][] = [];
  for (const report of [...result.reports].sort((a, b) => a.year - b.year)) {
    for (const event of report.events) {
      rows.push([
        report.year,
        day(event.date),
        event.account ? nameOf(event.account) : "",
        event.asset,
        event.quantity,
        event.proceedsEur,
        event.feesEur,
        event.portfolioValueEur,
        event.costBasisEur,
        event.gainLossEur,
        event.fxRate,
        event.operationId ?? "",
      ]);
    }
  }
  return {
    filename: "cessions.csv",
    columns: [
      "Année",
      "Date",
      "Compte",
      "Actif",
      "Quantité",
      "Prix de cession (€)",
      "Frais (€)",
      "Valeur globale du portefeuille (€)",
      "Prix d'acquisition imputé (€)",
      "Plus ou moins-value (€)",
      "Change € par $",
      "Référence Hashory",
    ],
    rows,
  };
}

export function acquisitionsSheet(result: TaxReportResult, nameOf: (account: string) => string): Sheet {
  return {
    filename: "acquisitions.csv",
    columns: ["Mois", "Compte", "Actif", "Opérations", "Quantité", "Prix payé (€)", "Origine"],
    rows: (result.audit?.acquisitions ?? []).map((row) => [
      row.month,
      nameOf(row.account),
      row.asset,
      row.count,
      row.quantity,
      row.costEur,
      row.kind === "fiat" ? "Achat contre monnaie" : "Pointage manuel",
    ]),
  };
}

export function flaggedSheet(result: TaxReportResult, nameOf: (account: string) => string): Sheet {
  const rows: CellValue[][] = [];
  const push = (direction: "in" | "out", items: TaxReportResult["unknownCostInflows"]["items"]) => {
    for (const item of items ?? []) {
      const info = item.justification ? categoryInfo(direction, item.justification.category as JustificationCategory) : null;
      rows.push([
        direction === "in" ? "Entrée" : "Sortie",
        day(item.date),
        nameOf(item.account),
        item.asset,
        item.quantity,
        item.valueEur,
        item.txId ?? "",
        item.counterparty ?? "",
        item.protocol ?? "",
        info ? info.label : "À justifier",
        item.justification?.costEur ?? "",
        item.justification?.note ?? "",
      ]);
    }
  };
  push("in", result.unknownCostInflows.items);
  push("out", result.untrackedOutflows.items);
  return {
    filename: "pointages.csv",
    columns: [
      "Sens",
      "Date",
      "Compte",
      "Actif",
      "Quantité",
      "Valeur du jour (€)",
      "Hash",
      "Adresse d'en face",
      "DEX",
      "Pointage",
      "Prix d'acquisition saisi (€)",
      "Justificatif",
    ],
    rows,
  };
}
