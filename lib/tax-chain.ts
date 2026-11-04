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

import { isFiat, type Operation, type TransferOperation } from "./ledger";
import { categoryInfo, type FlowJustification } from "./justification";
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
  /** Compte et opération d'origine : la pièce à produire pour cette cession. */
  account?: string;
  operationId?: string;
};

/** Acquisition retenue dans le prix total d'acquisition. */
export type Acquisition = {
  date: number;
  account: string;
  asset: string;
  quantity: number;
  costEur: number;
  /** Achat contre monnaie sur un compte suivi, ou pointage manuel. */
  kind: "fiat" | "justified";
  operationId: string;
};

/** Pointage retenu pour une opération signalée. */
export type AppliedJustification = Pick<FlowJustification, "category" | "costEur" | "note" | "linkedOperationId">;

/** Jetons entrés sans coût d'acquisition connu. */
export type UnknownCostInflow = {
  date: number;
  /** Compte où les jetons sont apparus. */
  account: string;
  asset: string;
  quantity: number;
  valueEur: number | null;
  reason: "untracked-deposit" | "missing-history";
  /** Hash de la transaction on-chain, pour un dépôt. */
  txId?: string;
  /** Opération en cause : c'est elle qu'on pointe. */
  id: string;
  /** Adresse émettrice, quand la chaîne la donne. */
  counterparty?: string;
  protocol?: string;
  justification?: AppliedJustification;
};

/** Jetons sortis vers un compte non suivi : peut-être une cession non vue. */
export type UntrackedOutflow = {
  date: number;
  account: string;
  asset: string;
  quantity: number;
  valueEur: number | null;
  txId?: string;
  id: string;
  /** Adresse destinataire, quand la chaîne la donne. */
  counterparty?: string;
  justification?: AppliedJustification;
};

/**
 * Une opération derrière un avertissement, telle que le rapport la garde
 * pour que l'utilisateur la retrouve. `account` est l'identifiant du compte.
 */
export type FlaggedFlow = {
  date: number;
  account: string;
  asset: string;
  quantity: number;
  valueEur: number | null;
  /** Entrées seulement : dépôt d'un compte non suivi, ou vente sans achat connu. */
  reason?: UnknownCostInflow["reason"];
  txId?: string;
  /** Opération à pointer. Absent des rapports enregistrés avant le pointage. */
  id?: string;
  counterparty?: string;
  protocol?: string;
  justification?: AppliedJustification;
  /**
   * Opération jumelle probable sur un autre compte suivi : même actif,
   * quantité voisine, dans les trente jours. Une piste, à confirmer.
   */
  suggestion?: { id: string; account: string; date: number; quantity: number; txId?: string };
};

/** Au-delà, le détail est tronqué : le rapport enregistré reste petit. */
export const MAX_FLAGGED_ITEMS = 200;

/**
 * Les opérations à pointer d'abord, puis les plus grosses, ce sont elles qui
 * pèsent sur l'impôt ; à valeur égale, les plus récentes.
 */
export function flaggedItems(list: FlaggedFlow[]): FlaggedFlow[] {
  return [...list]
    .sort(
      (a, b) =>
        Number(Boolean(a.justification)) - Number(Boolean(b.justification)) ||
        (b.valueEur ?? 0) - (a.valueEur ?? 0) ||
        b.date - a.date
    )
    .slice(0, MAX_FLAGGED_ITEMS)
    .map(({ date, account, asset, quantity, valueEur, reason, txId, id, counterparty, protocol, justification, suggestion }) => ({
      date,
      account,
      asset,
      quantity,
      valueEur,
      ...(reason ? { reason } : {}),
      ...(txId ? { txId } : {}),
      ...(id ? { id } : {}),
      ...(counterparty ? { counterparty } : {}),
      ...(protocol ? { protocol } : {}),
      ...(justification ? { justification } : {}),
      ...(suggestion ? { suggestion } : {}),
    }));
}

const SUGGESTION_WINDOW_MS = 30 * 86_400_000;

/**
 * Pistes de rapprochement : une entrée d'origine inconnue et un envoi non
 * suivi du même actif, sur deux comptes différents, à quantités voisines
 * (l'entrée vaut de 90 % à 100,5 % de l'envoi) et à trente jours d'écart au
 * plus, l'envoi d'abord. Le rapprochement automatique, plus strict, les a
 * laissés de côté ; l'utilisateur confirme ou non.
 */
export function suggestCounterparts(
  inflows: UnknownCostInflow[],
  outflows: UntrackedOutflow[]
): { inflows: Map<string, UntrackedOutflow>; outflows: Map<string, UnknownCostInflow> } {
  const forInflow = new Map<string, UntrackedOutflow>();
  const forOutflow = new Map<string, UnknownCostInflow>();
  const used = new Set<string>();
  const candidates = inflows
    .filter((inflow) => inflow.reason === "untracked-deposit" && !inflow.justification)
    .sort((a, b) => a.date - b.date);
  for (const inflow of candidates) {
    const match = outflows
      .filter(
        (outflow) =>
          !used.has(outflow.id) &&
          !outflow.justification &&
          outflow.asset === inflow.asset &&
          outflow.account !== inflow.account &&
          outflow.date <= inflow.date &&
          inflow.date - outflow.date <= SUGGESTION_WINDOW_MS &&
          inflow.quantity >= outflow.quantity * 0.9 &&
          inflow.quantity <= outflow.quantity * 1.005
      )
      .sort((a, b) => inflow.date - a.date - (inflow.date - b.date))[0];
    if (!match) continue;
    used.add(match.id);
    forInflow.set(inflow.id, match);
    forOutflow.set(match.id, inflow);
  }
  return { inflows: forInflow, outflows: forOutflow };
}

/**
 * Échange passé par un service tiers (swap instantané, pont entre réseaux) :
 * un actif part d'un compte suivi, un autre arrive peu après, pour une valeur
 * voisine. Fiscalement, un échange crypto contre crypto, en sursis.
 */
export type ServiceSwap = {
  date: number;
  given: { account: string; asset: string; quantity: number; txId?: string };
  received: { account: string; asset: string; quantity: number; txId?: string };
  givenEur: number;
  receivedEur: number;
  /**
   * Un côté n'avait pas de cours : sa valeur est celle de l'autre, au taux
   * de l'échange lui-même. `priceEur` est alors le prix unitaire déduit.
   */
  implied?: { side: "given" | "received"; priceEur: number };
};

/** Délai maximal entre l'envoi et la réception d'un échange via un service. */
export const SWAP_WINDOW_MS = 2 * 3_600_000;
/** Ce que le service peut retenir : la réception vaut au moins 80 % de l'envoi… */
const SWAP_MIN_RATIO = 0.8;
/** … et pas plus que l'envoi, à l'écart des cours près. */
const SWAP_MAX_RATIO = 1.05;
/** Sans cours d'un côté, la réception doit suivre l'envoi de près. */
export const IMPLIED_SWAP_WINDOW_MS = 30 * 60_000;

/**
 * Symbole imitant un vrai jeton avec des caractères d'autres alphabets
 * (« ꓴꓢꓓС » pour USDC) : un faux jeton d'empoisonnement d'adresse, que le
 * wallet n'a jamais vraiment envoyé ni reçu.
 */
export function isSpoofedSymbol(asset: string): boolean {
  return /[^\x20-\x7E]/.test(asset);
}

/**
 * Apparie les envois et réceptions restés sans contrepartie qui forment un
 * échange via un service : actifs différents, réception dans les deux heures,
 * valeur comprise entre 80 % et 105 % de l'envoi. Rend, par retrait, le
 * dépôt qui lui répond.
 */
function matchServiceSwaps(
  operations: Operation[],
  valueEur: (asset: string, quantity: number, timestamp: number) => number | null
): Map<string, { deposit: TransferOperation; implied: boolean }> {
  const open = (kind: "deposit" | "withdrawal") =>
    operations.filter(
      (op): op is TransferOperation =>
        op.kind === kind && !op.counterpart && !isFiat(op.asset) && !isSpoofedSymbol(op.asset)
    );
  const deposits = open("deposit");
  const used = new Set<string>();
  const pairs = new Map<string, { deposit: TransferOperation; implied: boolean }>();

  for (const withdrawal of open("withdrawal").sort((a, b) => a.timestamp - b.timestamp)) {
    const sent = valueEur(withdrawal.asset, withdrawal.quantity, withdrawal.timestamp);
    const inWindow = (deposit: TransferOperation, window: number) => {
      if (used.has(deposit.id) || deposit.asset === withdrawal.asset) return false;
      const delay = deposit.timestamp - withdrawal.timestamp;
      // Strictement après : à horodatage égal, le livre range le dépôt en premier.
      return delay > 0 && delay <= window;
    };

    // Les deux côtés ont un cours : les valeurs doivent se répondre.
    const priced =
      sent !== null && sent > 0
        ? deposits
            .filter((deposit) => {
              if (!inWindow(deposit, SWAP_WINDOW_MS)) return false;
              const received = valueEur(deposit.asset, deposit.quantity, deposit.timestamp);
              return received !== null && received >= sent * SWAP_MIN_RATIO && received <= sent * SWAP_MAX_RATIO;
            })
            .sort((a, b) => a.timestamp - b.timestamp)[0]
        : undefined;
    if (priced) {
      used.add(priced.id);
      pairs.set(withdrawal.id, { deposit: priced, implied: false });
      continue;
    }

    // Un côté sans cours (jeton peu coté) : c'est l'échange qui donne son
    // prix. Faute de pouvoir comparer les valeurs, on exige une réception
    // rapide et sans ambiguïté — un seul candidat sans cours.
    const unpriced = deposits.filter(
      (deposit) =>
        inWindow(deposit, IMPLIED_SWAP_WINDOW_MS) &&
        (sent === null || valueEur(deposit.asset, deposit.quantity, deposit.timestamp) === null)
    );
    const pricedSide =
      unpriced.length === 1 &&
      (sent !== null || valueEur(unpriced[0].asset, unpriced[0].quantity, unpriced[0].timestamp) !== null);
    if (pricedSide) {
      used.add(unpriced[0].id);
      pairs.set(withdrawal.id, { deposit: unpriced[0], implied: true });
    }
  }
  return pairs;
}

export type CessionChain = {
  cessions: Cession[];
  /** Échanges via un service tiers reconnus : le coût a suivi les jetons. */
  serviceSwaps: ServiceSwap[];
  /** Prix total d'acquisition restant, en euros. */
  acquisitionCostEur: number;
  /** Vrai si une valeur globale a dû être complétée au coût, faute de cours. */
  hasIncompleteValuation: boolean;
  unknownCostInflows: UnknownCostInflow[];
  untrackedOutflows: UntrackedOutflow[];
  /** Ce qui compose le prix total d'acquisition, opération par opération. */
  acquisitions: Acquisition[];
};

function sourceOf(origin: string): Cession["source"] {
  return origin === "fiat" ? "fiat" : origin === "convert" ? "convert" : "trade";
}

export function computeCessionChain(
  operations: Operation[],
  book: PriceBook,
  justifications: FlowJustification[] = []
): CessionChain {
  const ordered = [...operations].sort((a, b) => a.timestamp - b.timestamp);
  const pointed = new Map(justifications.map((justification) => [justification.operationId, justification]));
  const acquisitions: Acquisition[] = [];
  const applied = (justification: FlowJustification | undefined): AppliedJustification | undefined =>
    justification
      ? {
          category: justification.category,
          ...(justification.costEur !== undefined ? { costEur: justification.costEur } : {}),
          ...(justification.note ? { note: justification.note } : {}),
          ...(justification.linkedOperationId ? { linkedOperationId: justification.linkedOperationId } : {}),
        }
      : undefined;
  /** Prix d'acquisition pointé pour une entrée : retenu s'il est saisi et que la catégorie l'appelle. */
  const pointedCost = (justification: FlowJustification | undefined): number => {
    if (!justification || justification.direction !== "in") return 0;
    const info = categoryInfo("in", justification.category);
    return info?.needsCost && justification.costEur && justification.costEur > 0 ? justification.costEur : 0;
  };

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
  const remove = (account: string, asset: string, quantity: number, timestamp: number, operationId: string): number => {
    const source = line(account, asset);
    const shortfall = quantity - source.quantity;
    if (shortfall > DUST) {
      const justification = pointed.get(operationId);
      const cost = pointedCost(justification);
      unknownCostInflows.push({
        date: timestamp,
        account,
        asset,
        quantity: shortfall,
        valueEur: valueEur(asset, shortfall, timestamp),
        reason: "missing-history",
        id: operationId,
        ...(justification ? { justification: applied(justification) } : {}),
      });
      source.quantity += shortfall;
      if (cost > 0) {
        source.costEur += cost;
        acquisitionCostEur += cost;
        acquisitions.push({ date: timestamp, account, asset, quantity: shortfall, costEur: cost, kind: "justified", operationId });
      }
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
  const swaps = matchServiceSwaps(ordered, valueEur);
  const serviceSwaps: ServiceSwap[] = [];

  for (const operation of ordered) {
    if (settled.has(operation.id)) continue;

    // Faux jeton d'empoisonnement d'adresse : rien n'a bougé.
    if (operation.kind !== "exchange" && isSpoofedSymbol(operation.asset)) continue;

    // Échange via un service : le coût des jetons envoyés passe aux jetons reçus.
    const swap = operation.kind === "withdrawal" ? swaps.get(operation.id) : undefined;
    if (operation.kind === "withdrawal" && swap) {
      const swapDeposit = swap.deposit;
      const carried = remove(operation.account, operation.asset, operation.quantity + operation.fee, operation.timestamp, operation.id);
      add(swapDeposit.account, swapDeposit.asset, swapDeposit.quantity, carried);
      settled.add(swapDeposit.id);
      const givenEur = valueEur(operation.asset, operation.quantity, operation.timestamp);
      const receivedEur = valueEur(swapDeposit.asset, swapDeposit.quantity, swapDeposit.timestamp);
      const implied: ServiceSwap["implied"] = !swap.implied
        ? undefined
        : receivedEur === null
          ? { side: "received", priceEur: (givenEur ?? 0) / swapDeposit.quantity }
          : { side: "given", priceEur: receivedEur / operation.quantity };
      serviceSwaps.push({
        date: operation.timestamp,
        given: { account: operation.account, asset: operation.asset, quantity: operation.quantity, txId: operation.txId },
        received: {
          account: swapDeposit.account,
          asset: swapDeposit.asset,
          quantity: swapDeposit.quantity,
          txId: swapDeposit.txId,
        },
        givenEur: givenEur ?? receivedEur ?? 0,
        receivedEur: receivedEur ?? givenEur ?? 0,
        ...(implied ? { implied } : {}),
      });
      continue;
    }

    if (operation.kind === "exchange") {
      const { account, given, received, fee, timestamp } = operation;
      const givenFiat = isFiat(given.asset);
      const receivedFiat = isFiat(received.asset);

      if (givenFiat && receivedFiat) continue;

      // Frais en fiat : ajoutés à l'acquisition, déduits de la cession.
      const feeFiatEur = fee && isFiat(fee.asset) ? fiatToEur(fee.asset, fee.quantity, timestamp) ?? 0 : 0;
      // Frais en jetons : une simple sortie de stock.
      if (fee && !isFiat(fee.asset)) remove(account, fee.asset, fee.quantity, timestamp, operation.id);

      if (givenFiat) {
        // Acquisition contre monnaie ayant cours légal.
        const paidEur =
          fiatToEur(given.asset, given.quantity, timestamp) ??
          valueEur(received.asset, received.quantity, timestamp) ??
          0;
        const costEur = paidEur + feeFiatEur;
        acquisitionCostEur += costEur;
        add(account, received.asset, received.quantity, costEur);
        acquisitions.push({
          date: timestamp,
          account,
          asset: received.asset,
          quantity: received.quantity,
          costEur,
          kind: "fiat",
          operationId: operation.id,
        });
        continue;
      }

      if (!receivedFiat) {
        // Échange crypto contre crypto : le coût suit les jetons, le prix
        // total d'acquisition ne bouge pas.
        const carried = remove(account, given.asset, given.quantity, timestamp, operation.id);
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
        const justification = pointed.get(operation.id);
        const cost = pointedCost(justification);
        unknownCostInflows.push({
          date: timestamp,
          account,
          asset: given.asset,
          quantity: shortfall,
          valueEur: valueEur(given.asset, shortfall, timestamp),
          reason: "missing-history",
          id: operation.id,
          ...(justification ? { justification: applied(justification) } : {}),
        });
        sold.quantity = given.quantity;
        if (cost > 0) {
          sold.costEur += cost;
          acquisitionCostEur += cost;
          acquisitions.push({
            date: timestamp,
            account,
            asset: given.asset,
            quantity: shortfall,
            costEur: cost,
            kind: "justified",
            operationId: operation.id,
          });
        }
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
        account,
        operationId: operation.id,
      });

      acquisitionCostEur = Math.max(0, acquisitionCostEur - costBasisEur);
      remove(account, given.asset, given.quantity, timestamp, operation.id);
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
          operation.timestamp,
          withdrawal.id
        );
        add(deposit.account, deposit.asset, deposit.quantity, carried);
        settled.add(withdrawal.id);
        settled.add(deposit.id);
        continue;
      }
    }

    const justification = pointed.get(operation.id);
    if (operation.kind === "deposit") {
      // Jetons venus d'un compte non suivi : détenus, sans coût connu — sauf
      // si l'utilisateur a pointé le prix payé.
      const cost = pointedCost(justification);
      add(operation.account, operation.asset, operation.quantity, cost);
      if (cost > 0) {
        acquisitionCostEur += cost;
        acquisitions.push({
          date: operation.timestamp,
          account: operation.account,
          asset: operation.asset,
          quantity: operation.quantity,
          costEur: cost,
          kind: "justified",
          operationId: operation.id,
        });
      }
      unknownCostInflows.push({
        date: operation.timestamp,
        account: operation.account,
        asset: operation.asset,
        quantity: operation.quantity,
        valueEur: valueEur(operation.asset, operation.quantity, operation.timestamp),
        reason: "untracked-deposit",
        txId: operation.txId,
        id: operation.id,
        ...(operation.counterparty ? { counterparty: operation.counterparty } : {}),
        ...(operation.protocol ? { protocol: operation.protocol } : {}),
        ...(justification ? { justification: applied(justification) } : {}),
      });
    } else {
      remove(operation.account, operation.asset, operation.quantity + operation.fee, operation.timestamp, operation.id);
      untrackedOutflows.push({
        date: operation.timestamp,
        account: operation.account,
        asset: operation.asset,
        quantity: operation.quantity,
        valueEur: valueEur(operation.asset, operation.quantity, operation.timestamp),
        txId: operation.txId,
        id: operation.id,
        ...(operation.counterparty ? { counterparty: operation.counterparty } : {}),
        ...(justification ? { justification: applied(justification) } : {}),
      });
    }
  }

  return {
    cessions,
    serviceSwaps,
    acquisitionCostEur,
    hasIncompleteValuation,
    unknownCostInflows,
    untrackedOutflows,
    acquisitions,
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
