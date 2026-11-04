/**
 * Pointage manuel des opérations que le calcul ne sait pas expliquer seul.
 *
 * Un jeton reçu d'un compte non suivi n'a pas de prix d'acquisition : le
 * calcul le compte nul, par prudence. L'utilisateur peut dire ce qu'il en
 * est — un achat payé tant, un airdrop, le retour d'un de ses wallets — et
 * garder une note pour son justificatif. C'est ce pointage, opération par
 * opération, qu'un contrôleur demanderait de justifier.
 *
 * Pur : partagé par le calcul (Convex) et l'interface.
 */

import type { Operation } from "./ledger";

export type InflowCategory = "purchase" | "own-wallet" | "internal" | "gift" | "income";
export type OutflowCategory = "own-wallet" | "internal" | "payment" | "gift-sent" | "lost" | "sold-elsewhere";
export type JustificationCategory = InflowCategory | OutflowCategory;

export type FlowJustification = {
  /** Identifiant de l'opération pointée (dépôt, retrait ou échange). */
  operationId: string;
  direction: "in" | "out";
  category: JustificationCategory;
  /** Prix d'acquisition saisi, en euros, pour une entrée achetée ailleurs. */
  costEur?: number;
  /** Pour un transfert interne : l'opération jumelle sur un autre compte suivi. */
  linkedOperationId?: string;
  /** Référence du justificatif : facture, relevé, hash, nom de la plateforme. */
  note?: string;
  updatedAt?: number;
};

type CategoryInfo = {
  label: string;
  hint: string;
  /** La catégorie demande un prix d'acquisition. */
  needsCost?: boolean;
  /** La catégorie relie l'opération à sa jumelle. */
  needsLink?: boolean;
  /** Effet fiscal à signaler : une cession non vue par Hashory. */
  taxable?: boolean;
};

export const INFLOW_CATEGORIES: Record<InflowCategory, CategoryInfo> = {
  purchase: {
    label: "Acheté ailleurs",
    hint: "Payé en euros sur une plateforme ou à une personne que Hashory ne suit pas. Saisissez le prix payé, frais compris.",
    needsCost: true,
  },
  "own-wallet": {
    label: "Venu d'un de mes wallets",
    hint: "Transféré depuis un wallet ou un compte à vous, non connecté. Saisissez le prix auquel vous aviez acquis ces jetons.",
    needsCost: true,
  },
  internal: {
    label: "Transfert entre mes comptes suivis",
    hint: "L'envoi correspondant est sur un autre compte suivi : le coût d'acquisition suit les jetons.",
    needsLink: true,
  },
  gift: {
    label: "Airdrop, cadeau ou bonus",
    hint: "Reçu sans contrepartie : un prix d'acquisition nul est la règle. Gardez la trace de l'émetteur.",
  },
  income: {
    label: "Revenu (staking, minage, salaire)",
    hint: "Imposé à la réception comme revenu ? Saisissez la valeur déclarée : elle devient le prix d'acquisition.",
    needsCost: true,
  },
};

export const OUTFLOW_CATEGORIES: Record<OutflowCategory, CategoryInfo> = {
  "own-wallet": {
    label: "Vers un de mes wallets",
    hint: "Les jetons restent à vous, sur un compte non connecté. Connectez-le pour qu'ils restent dans la valeur du portefeuille.",
  },
  internal: {
    label: "Transfert entre mes comptes suivis",
    hint: "La réception correspondante est sur un autre compte suivi.",
    needsLink: true,
  },
  payment: {
    label: "Paiement d'un bien ou service",
    hint: "Payer en crypto est une cession imposable : à déclarer au prix du bien obtenu.",
    taxable: true,
  },
  "sold-elsewhere": {
    label: "Vendu sur une autre plateforme",
    hint: "La vente contre euros a eu lieu hors de Hashory : c'est une cession à déclarer. Connectez la plateforme.",
    taxable: true,
  },
  "gift-sent": {
    label: "Don à un tiers",
    hint: "Un don n'est pas une cession, mais peut relever des droits de donation. Gardez la trace du bénéficiaire.",
  },
  lost: {
    label: "Perte, vol ou arnaque",
    hint: "Jetons perdus : sans cession, pas de moins-value imputable. Conservez le dépôt de plainte ou la preuve.",
  },
};

export function categoryInfo(direction: "in" | "out", category: JustificationCategory): CategoryInfo | null {
  return direction === "in"
    ? INFLOW_CATEGORIES[category as InflowCategory] ?? null
    : OUTFLOW_CATEGORIES[category as OutflowCategory] ?? null;
}

/**
 * Relie les transferts que l'utilisateur a déclarés internes : ils
 * deviennent jumeaux, et le coût d'acquisition suit les jetons d'un compte
 * à l'autre. Sans effet sur une opération déjà appariée.
 */
export function applyLinkedTransfers(operations: Operation[], justifications: FlowJustification[]): void {
  const byId = new Map(operations.map((operation) => [operation.id, operation]));
  for (const justification of justifications) {
    if (justification.category !== "internal" || !justification.linkedOperationId) continue;
    const self = byId.get(justification.operationId);
    const twin = byId.get(justification.linkedOperationId);
    if (!self || !twin || self.kind === "exchange" || twin.kind === "exchange") continue;
    if (self.kind === twin.kind || self.counterpart || twin.counterpart) continue;
    self.counterpart = twin.id;
    twin.counterpart = self.id;
  }
}
