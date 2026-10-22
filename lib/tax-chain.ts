/**
 * Chaîne des cessions — article 150 VH bis du CGI, formulaire 2086.
 *
 * Tout se compte **en euros**, la devise de la déclaration, et chaque
 * montant au cours du jour de son opération :
 *
 * - **prix total d'acquisition** : la somme des euros réellement versés pour
 *   acquérir des actifs numériques (frais d'acquisition compris). Un achat
 *   payé 100 € compte 100 €, pas « 100 $ » reconvertis plus tard ;
 * - **échange crypto contre crypto** (stablecoins compris) : en sursis
 *   d'imposition. Ni cession, ni acquisition : le prix total d'acquisition
 *   ne bouge pas ;
 * - **cession** : seul l'échange d'un actif numérique contre une monnaie
 *   ayant cours légal, que la plateforme l'appelle vente ou conversion ;
 * - **valeur globale du portefeuille** : tous les actifs numériques détenus
 *   au moment de la cession, sur tous les comptes suivis, wallets compris,
 *   au cours du marché ; l'actif cédé à son prix de cession.
 *
 * Plus-value d'une cession (lignes du 2086) :
 *
 *     plus-value = prix de cession net de frais
 *                − prix total d'acquisition × prix de cession / valeur globale
 *
 * et le prix total d'acquisition est ensuite réduit de la fraction imputée.
 *
 * Quand l'origine de jetons est inconnue — reçus d'un compte non suivi, ou
 * vendus sans achat dans l'historique — leur coût d'acquisition est compté
 * nul et signalé : c'est le choix prudent, qui ne minore jamais l'impôt.
 */

import { isFiat, type Operation } from "./ledger";
import type { PriceBook } from "./valuation";
import { isBelowAnnualExemption } from "./tax";

const DUST = 1e-12;

export type Cession = {
  date: number;
  asset: string;
  quantity: number;
  /** Prix de cession, avant frais (ligne 213). */
  proceedsEur: number;
  /** Frais de cession (ligne 214). */
  feesEur: number;
  /** Fraction du prix total d'acquisition imputée à cette cession. */
  costBasisEur: number;
  /** Plus-value (positive) ou moins-value (négative). */
  gainLossEur: number;
  /** Valeur globale du portefeuille retenue (ligne 212). */
  portfolioValueEur: number;
  /** Part de la valeur globale établie au cours du marché. */
  valuationCoverage: number;
  /** Euros par dollar au jour de la cession, pour l'affichage en dollars. */
  eurPerUsd: number | null;
  source: "trade" | "fiat" | "convert";
};

/** Jetons entrés sans coût d'acquisition connu. */
export type UnknownCostInflow = {
  date: number;
  asset: string;
  quantity: number;
  valueEur: number | null;
  reason: "untracked-deposit" | "missing-history";
};

/** Jetons sortis vers un compte non suivi : peut-être une cession non vue. */
export type UntrackedOutflow = { date: number; asset: string; quantity: number; valueEur: number | null };

export type CessionChain = {
  cessions: Cession[];
  /** Prix total d'acquisition restant, en euros. */
  acquisitionCostEur: number;
  /** Vrai si une valeur globale a dû être complétée au coût, faute de cours. */
  hasIncompleteValuation: boolean;
  unknownCostInflows: UnknownCostInflow[];
  untrackedOutflows: UntrackedOutflow[];
};

function sourceOf(origin: string): Cession["source"] {
  return origin === "fiat" ? "fiat" : origin === "convert" ? "convert" : "trade";
}

export function computeCessionChain(operations: Operation[], book: PriceBook): CessionChain {
  const ordered = [...operations].sort((a, b) => a.timestamp - b.timestamp);

  // Stock d'actifs numériques par compte, et coût d'acquisition porté par
  // chaque ligne. La valeur globale additionne tous les comptes ; le suivi
  // par compte sert à repérer l'historique manquant : un compte ne peut pas
  // céder les jetons d'un autre. Le coût par ligne ne sert qu'à valoriser
  // une ligne dont le cours manque — la fiscalité, elle, n'utilise que le
  // prix total d'acquisition du portefeuille.
  const holdings = new Map<string, { asset: string; quantity: number; costEur: number }>();
  let acquisitionCostEur = 0;
  let hasIncompleteValuation = false;
  const cessions: Cession[] = [];
  const unknownCostInflows: UnknownCostInflow[] = [];
  const untrackedOutflows: UntrackedOutflow[] = [];

  const line = (account: string, asset: string) => {
    const key = `${account}\u0000${asset}`;
    const existing = holdings.get(key);
    if (existing) return existing;
    const created = { asset, quantity: 0, costEur: 0 };
    holdings.set(key, created);
    return created;
  };

  const valueEur = (asset: string, quantity: number, timestamp: number): number | null => {
    const price = book.eur(asset, timestamp);
    return price === null ? null : price * quantity;
  };

  const add = (account: string, asset: string, quantity: number, costEur: number) => {
    const target = line(account, asset);
    target.quantity += quantity;
    target.costEur += costEur;
  };

  /**
   * Retire une quantité d'un actif et rend le coût qu'elle emporte. Ce qui
   * manque au stock est d'abord ajouté à coût nul, et signalé.
   */
  const remove = (account: string, asset: string, quantity: number, timestamp: number): number => {
    const source = line(account, asset);
    const shortfall = quantity - source.quantity;
    if (shortfall > DUST) {
      unknownCostInflows.push({
        date: timestamp,
        asset,
        quantity: shortfall,
        valueEur: valueEur(asset, shortfall, timestamp),
        reason: "missing-history",
      });
      source.quantity += shortfall;
    }
    const share = source.quantity > DUST ? Math.min(1, quantity / source.quantity) : 0;
    const carried = source.costEur * share;
    source.quantity = Math.max(0, source.quantity - quantity);
    source.costEur = Math.max(0, source.costEur - carried);
    return carried;
  };

  /** Montant fiat en euros au cours du jour ; `null` pour une devise sans change. */
  const fiatToEur = (asset: string, quantity: number, timestamp: number): number | null =>
    asset === "EUR" ? quantity : valueEur(asset, quantity, timestamp);

  const byId = new Map(ordered.map((operation) => [operation.id, operation]));
  const settled = new Set<string>();

  for (const operation of ordered) {
    if (settled.has(operation.id)) continue;

    if (operation.kind === "exchange") {
      const { account, given, received, fee, timestamp } = operation;
      const givenFiat = isFiat(given.asset);
      const receivedFiat = isFiat(received.asset);

      if (givenFiat && receivedFiat) continue;

      // Frais en fiat : ajoutés à l'acquisition, déduits de la cession.
      const feeFiatEur = fee && isFiat(fee.asset) ? fiatToEur(fee.asset, fee.quantity, timestamp) ?? 0 : 0;
      // Frais en jetons : une simple sortie de stock.
      if (fee && !isFiat(fee.asset)) remove(account, fee.asset, fee.quantity, timestamp);

      if (givenFiat) {
        // Acquisition contre monnaie ayant cours légal.
        const paidEur =
          fiatToEur(given.asset, given.quantity, timestamp) ??
          valueEur(received.asset, received.quantity, timestamp) ??
          0;
        const costEur = paidEur + feeFiatEur;
        acquisitionCostEur += costEur;
        add(account, received.asset, received.quantity, costEur);
        continue;
      }

      if (!receivedFiat) {
        // Échange crypto contre crypto : le coût suit les jetons, le prix
        // total d'acquisition ne bouge pas.
        const carried = remove(account, given.asset, given.quantity, timestamp);
        add(account, received.asset, received.quantity, carried);
        continue;
      }

      // Cession contre monnaie ayant cours légal.
      const proceedsEur =
        fiatToEur(received.asset, received.quantity, timestamp) ??
        valueEur(given.asset, given.quantity, timestamp) ??
        0;

      // Le stock doit couvrir la cession avant d'évaluer le portefeuille.
      const sold = line(account, given.asset);
      if (given.quantity - sold.quantity > DUST) {
        const shortfall = given.quantity - sold.quantity;
        unknownCostInflows.push({
          date: timestamp,
          asset: given.asset,
          quantity: shortfall,
          valueEur: valueEur(given.asset, shortfall, timestamp),
          reason: "missing-history",
        });
        sold.quantity = given.quantity;
      }

      // Valeur globale juste avant la cession.
      let portfolioValueEur = 0;
      let coveredEur = 0;
      for (const state of holdings.values()) {
        if (state.quantity <= DUST) continue;
        const { asset } = state;
        const price =
          asset === given.asset && given.quantity > 0
            ? proceedsEur / given.quantity
            : book.eur(asset, timestamp);
        if (price !== null && price > 0) {
          portfolioValueEur += state.quantity * price;
          coveredEur += state.quantity * price;
        } else {
          portfolioValueEur += state.costEur;
          hasIncompleteValuation = true;
        }
      }

      const costBasisEur =
        portfolioValueEur > 0 ? (acquisitionCostEur * proceedsEur) / portfolioValueEur : 0;

      cessions.push({
        date: timestamp,
        asset: given.asset,
        quantity: given.quantity,
        proceedsEur,
        feesEur: feeFiatEur,
        costBasisEur,
        gainLossEur: proceedsEur - feeFiatEur - costBasisEur,
        portfolioValueEur,
        valuationCoverage: portfolioValueEur > 0 ? coveredEur / portfolioValueEur : 0,
        eurPerUsd: book.eurPerUsd(timestamp),
        source: sourceOf(operation.origin),
      });

      acquisitionCostEur = Math.max(0, acquisitionCostEur - costBasisEur);
      remove(account, given.asset, given.quantity, timestamp);
      continue;
    }

    if (isFiat(operation.asset)) continue;

    // Transfert interne : les jetons changent de compte avec leur coût ; seuls
    // les frais réseau sortent du stock.
    if (operation.counterpart) {
      const twin = byId.get(operation.counterpart);
      const withdrawal = operation.kind === "withdrawal" ? operation : twin;
      const deposit = operation.kind === "deposit" ? operation : twin;
      if (withdrawal?.kind === "withdrawal" && deposit?.kind === "deposit") {
        const carried = remove(
          withdrawal.account,
          withdrawal.asset,
          withdrawal.quantity + withdrawal.fee,
          operation.timestamp
        );
        add(deposit.account, deposit.asset, deposit.quantity, carried);
        settled.add(withdrawal.id);
        settled.add(deposit.id);
        continue;
      }
    }

    if (operation.kind === "deposit") {
      // Jetons venus d'un compte non suivi : détenus, mais sans coût connu.
      add(operation.account, operation.asset, operation.quantity, 0);
      unknownCostInflows.push({
        date: operation.timestamp,
        asset: operation.asset,
        quantity: operation.quantity,
        valueEur: valueEur(operation.asset, operation.quantity, operation.timestamp),
        reason: "untracked-deposit",
      });
    } else {
      remove(operation.account, operation.asset, operation.quantity + operation.fee, operation.timestamp);
      untrackedOutflows.push({
        date: operation.timestamp,
        asset: operation.asset,
        quantity: operation.quantity,
        valueEur: valueEur(operation.asset, operation.quantity, operation.timestamp),
      });
    }
  }

  return {
    cessions,
    acquisitionCostEur,
    hasIncompleteValuation,
    unknownCostInflows,
    untrackedOutflows,
  };
}

export type TaxYearSummary = {
  year: number;
  cessions: Cession[];
  /** Total des prix de cession : c'est lui que vise le seuil de 305 €. */
  totalProceedsEur: number;
  totalCostBasisEur: number;
  /** Plus-values moins moins-values de l'année. */
  netGainLossEur: number;
  isBelowThreshold: boolean;
  estimatedTaxEur: number;
};

/**
 * Agrège les cessions par année. Les moins-values s'imputent sur les
 * plus-values de la même année seulement, et une année dont le total des
 * cessions reste sous le seuil n'est pas imposée.
 */
export function summarizeByYear(
  cessions: Cession[],
  options: { threshold: number; rate: number }
): TaxYearSummary[] {
  const byYear = new Map<number, Cession[]>();
  for (const cession of cessions) {
    const year = new Date(cession.date).getUTCFullYear();
    byYear.set(year, [...(byYear.get(year) ?? []), cession]);
  }

  return Array.from(byYear.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, list]) => {
      const totalProceedsEur = list.reduce((sum, c) => sum + c.proceedsEur, 0);
      const totalCostBasisEur = list.reduce((sum, c) => sum + c.costBasisEur, 0);
      const netGainLossEur = list.reduce((sum, c) => sum + c.gainLossEur, 0);
      const isBelowThreshold = isBelowAnnualExemption(totalProceedsEur, options.threshold);
      return {
        year,
        cessions: list,
        totalProceedsEur,
        totalCostBasisEur,
        netGainLossEur,
        isBelowThreshold,
        estimatedTaxEur: isBelowThreshold ? 0 : Math.max(0, netGainLossEur * options.rate),
      };
    });
}
