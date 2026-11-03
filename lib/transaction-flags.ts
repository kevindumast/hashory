/**
 * Ce que la table des transactions signale sur chaque ligne : cession
 * imposable, ou ligne à vérifier. Pur et sans dépendance à React, pour que
 * les onglets « Imposables » et « À vérifier » restent testables.
 */

import { isFiat } from "./ledger";

export type FlowSide = { currency: string; quantity: number };

/**
 * Cession imposable au sens de l'article 150 VH bis du CGI : un actif
 * numérique cédé contre une monnaie ayant cours légal. Un échange crypto
 * contre crypto (stablecoins compris) est en sursis d'imposition, et un
 * achat contre euros est une acquisition.
 *
 * C'est un repère de lecture : le calcul qui fait foi reste celui de la
 * déclaration fiscale, qui suit aussi les comptes non synchronisés.
 */
export function isTaxableDisposal(out: FlowSide | undefined, received: FlowSide | undefined): boolean {
  if (!out || !received) return false;
  return !isFiat(out.currency) && isFiat(received.currency);
}

export type ReviewReason = "unvalued" | "unknown-pair" | "dust";

export const REVIEW_REASON_LABELS: Record<ReviewReason, string> = {
  unvalued: "Valorisation introuvable pour cet actif",
  "unknown-pair": "Paire de cotation non reconnue",
  dust: "Montant infime reçu : souvent un envoi indésirable",
};

/** En deçà d'un centime de dollar, une entrée relève de la poussière ou du spam. */
export const DUST_THRESHOLD_USD = 0.01;

export function reviewReasons(input: {
  type: "trade" | "deposit" | "withdrawal";
  /** Contre-valeur en dollars ; `null` si aucun cours n'a été trouvé. */
  valueUsd: number | null;
  /** `false` quand la cotation d'un trade n'a pas pu être déduite du symbole. */
  pairKnown: boolean;
  /** Tant que les cours ne sont pas chargés, une valeur absente ne dit rien. */
  pricesLoaded: boolean;
}): ReviewReason[] {
  const reasons: ReviewReason[] = [];
  if (!input.pairKnown) reasons.push("unknown-pair");
  if (input.valueUsd === null) {
    if (input.pricesLoaded && input.pairKnown) reasons.push("unvalued");
  } else if (input.type === "deposit" && input.valueUsd > 0 && input.valueUsd < DUST_THRESHOLD_USD) {
    reasons.push("dust");
  }
  return reasons;
}
