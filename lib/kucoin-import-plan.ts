/**
 * Ce qu'un import d'exports KuCoin doit écrire, et ce qu'il doit effacer.
 *
 * Un même mouvement peut arriver par trois chemins : la synchronisation API,
 * l'export « Deposit/Withdrawal History » et, dans les anciens imports, le
 * relevé « Account History ». Chacun lui donnait un identifiant différent,
 * si bien qu'un dépôt de 10 USDC en devenait trois. Le hash de transaction
 * est la seule clé commune : c'est lui qui décide.
 *
 * Le plan est calculé sans base de données — la mutation se contente de
 * l'appliquer — pour qu'il soit vérifiable par des tests.
 */

import { USD_STABLECOINS } from "./ledger";
import {
  cardPurchaseId,
  sameCardPurchase,
  type KucoinCardPurchase,
  type KucoinConvert,
  type KucoinSpotTrade,
  type KucoinTransfer,
} from "./kucoin-export";

/** Dépôt ou retrait enregistré ; `key` est son `depositId` ou son `withdrawId`. */
export type ExistingMovement = { id: string; key: string; txId?: string; coin: string; amount: number; fee?: number; time: number };
export type ExistingConvert = { providerTradeId: string; fromAsset: string; fromAmount: number; executedAt: number };
/**
 * Achat par carte déjà enregistré : un trade (contre fiat) ou, faute de prix
 * connu, un dépôt. `priced` : le montant débité est le vrai, pas l'estimation
 * d'un dollar par stablecoin.
 */
export type ExistingCardPurchase = {
  id: string;
  key: string;
  table: "trades" | "deposits";
  coin: string;
  amount: number;
  time: number;
  priced: boolean;
};

export type ExistingKucoinData = {
  tradeIds: string[];
  orderIds: string[];
  converts: ExistingConvert[];
  deposits: ExistingMovement[];
  withdrawals: ExistingMovement[];
  cardPurchases: ExistingCardPurchase[];
};

export type KucoinImportInput = {
  spotTrades: KucoinSpotTrade[];
  converts: KucoinConvert[];
  deposits: KucoinTransfer[];
  withdrawals: KucoinTransfer[];
  cardPurchases: KucoinCardPurchase[];
};

export type KucoinImportPlan = {
  spotTrades: KucoinSpotTrade[];
  converts: KucoinConvert[];
  deposits: KucoinTransfer[];
  withdrawals: KucoinTransfer[];
  /**
   * Achats par carte enregistrés comme une acquisition contre fiat : au
   * montant débité quand l'export « Fast Trade » le donne, sinon — pour un
   * stablecoin — à un dollar par jeton (`estimated`).
   */
  cardTrades: (KucoinCardPurchase & { id: string; paid: { currency: string; amount: number; fee: number }; estimated: boolean })[];
  /** Achats par carte d'autres jetons sans prix connu : une entrée à coût inconnu. */
  cardDeposits: (KucoinCardPurchase & { id: string })[];
  /** Achats estimés que leur vrai prix remplace. */
  deleteTradeIds: string[];
  deleteDepositIds: string[];
  deleteWithdrawalIds: string[];
};

/** Préfixes des identifiants posés par les imports de fichiers. */
export const IMPORTED_DEPOSIT_PREFIX = "kucoin-deposit:";
export const IMPORTED_WITHDRAWAL_PREFIX = "kucoin-withdrawal:";
const LEGACY_DEPOSIT_PREFIX = "kucoin-deposit:acct-deposit:";
const LEGACY_WITHDRAWAL_PREFIX = "kucoin-withdrawal:acct-withdraw:";

const HOUR_MS = 3_600_000;
const CONVERT_WINDOW_MS = 2 * 60_000;

function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-9);
}

function valid(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value < 1e15;
}

function validTime(value: number): boolean {
  // De 2017, ouverture de KuCoin, à demain.
  return Number.isInteger(value) && value > Date.UTC(2017, 0, 1) && value < Date.now() + 86_400_000;
}

const ASSET = /^[A-Z0-9]{1,20}$/;

export function planKucoinImport(existing: ExistingKucoinData, input: KucoinImportInput): KucoinImportPlan {
  const tradeIds = new Set(existing.tradeIds);
  const orderIds = new Set(existing.orderIds);

  // ── Ordres spot : un ordre déjà connu, par import ou par l'API, est ignoré.
  const spotTrades = input.spotTrades.filter(
    (trade) =>
      /^[A-Za-z0-9]{1,64}$/.test(trade.orderId) &&
      /^[A-Z0-9]{2,40}$/.test(trade.symbol) &&
      valid(trade.filledAmount) &&
      validTime(trade.executedAt) &&
      !tradeIds.has(`kucoin-order:${trade.orderId}`) &&
      !orderIds.has(trade.orderId)
  );

  // ── Conversions : l'API les range sous son propre identifiant ; on les
  // reconnaît à l'actif cédé, au montant et à l'heure.
  const converts = input.converts.filter((convert) => {
    if (!ASSET.test(convert.sellAsset) || !ASSET.test(convert.buyAsset)) return false;
    if (!valid(convert.sellAmount) || !valid(convert.buyAmount) || !validTime(convert.executedAt)) return false;
    if (tradeIds.has(convertKey(convert))) return false;
    return !existing.converts.some(
      (known) =>
        known.fromAsset.toUpperCase() === convert.sellAsset &&
        close(known.fromAmount, convert.sellAmount) &&
        Math.abs(known.executedAt - convert.executedAt) <= CONVERT_WINDOW_MS
    );
  });

  // ── Dépôts et retraits on-chain : dédoublonnés par hash.
  const knownDepositHashes = new Set(existing.deposits.flatMap((d) => (d.txId ? [d.txId.toLowerCase()] : [])));
  const knownWithdrawalHashes = new Set(existing.withdrawals.flatMap((w) => (w.txId ? [w.txId.toLowerCase()] : [])));
  const transferValid = (t: KucoinTransfer) =>
    ASSET.test(t.coin) && valid(t.amount) && validTime(t.executedAt) && t.hash.length > 0 && t.hash.length <= 200;
  const deposits = input.deposits.filter((d) => transferValid(d) && !knownDepositHashes.has(d.hash.toLowerCase()));
  const withdrawals = input.withdrawals.filter((w) => transferValid(w) && !knownWithdrawalHashes.has(w.hash.toLowerCase()));

  // ── Achats par carte : reconnus au jeton, à la quantité et à l'heure,
  // puisque le relevé de compte et l'export « Fast Trade » n'horodatent pas
  // tout à fait pareil. Un achat déjà enregistré sans son vrai prix est
  // remplacé dès qu'un export l'apporte, sous le même identifiant.
  const knownDepositIds = new Set(existing.deposits.map((d) => d.key));
  const cardTrades: KucoinImportPlan["cardTrades"] = [];
  const cardDeposits: KucoinImportPlan["cardDeposits"] = [];
  const deleteTradeIds: string[] = [];
  const replacedCardDepositIds: string[] = [];
  const matched = new Set<string>();
  for (const purchase of input.cardPurchases) {
    if (!ASSET.test(purchase.coin) || !valid(purchase.amount) || !validTime(purchase.executedAt)) continue;
    const fiat = purchase.fiat;
    if (fiat && (!ASSET.test(fiat.currency) || !valid(fiat.amount) || !(fiat.fee >= 0 && fiat.fee < fiat.amount))) continue;

    const known = existing.cardPurchases.find(
      (record) => !matched.has(record.id) && sameCardPurchase({ coin: record.coin, amount: record.amount, executedAt: record.time }, purchase)
    );
    let id = cardPurchaseId(purchase);
    if (known) {
      matched.add(known.id);
      if (known.priced || !fiat) continue;
      (known.table === "trades" ? deleteTradeIds : replacedCardDepositIds).push(known.id);
      id = known.key;
    } else if (tradeIds.has(id) || knownDepositIds.has(id)) {
      continue;
    }

    if (fiat) {
      cardTrades.push({ ...purchase, id, paid: fiat, estimated: false });
    } else if (USD_STABLECOINS.has(purchase.coin)) {
      cardTrades.push({ ...purchase, id, paid: { currency: "USD", amount: purchase.amount, fee: 0 }, estimated: true });
    } else {
      cardDeposits.push({ ...purchase, id });
    }
  }

  // ── Doublons laissés par les imports précédents.
  const deleteDepositIds = duplicateIds(
    existing.deposits,
    deposits.map((d) => ({ coin: d.coin, amount: d.amount, time: d.executedAt, txId: d.hash })),
    LEGACY_DEPOSIT_PREFIX,
    IMPORTED_DEPOSIT_PREFIX,
    (legacy, other) => close(other.amount, legacy.amount)
  );
  const deleteWithdrawalIds = duplicateIds(
    existing.withdrawals,
    withdrawals.map((w) => ({ coin: w.coin, amount: w.amount, fee: w.fee, time: w.executedAt, txId: w.hash })),
    LEGACY_WITHDRAWAL_PREFIX,
    IMPORTED_WITHDRAWAL_PREFIX,
    // Le relevé de compte inscrit un retrait frais compris.
    (legacy, other) => close(other.amount + (other.fee ?? 0), legacy.amount) || close(other.amount, legacy.amount)
  );

  return {
    spotTrades,
    converts,
    deposits,
    withdrawals,
    cardTrades,
    cardDeposits,
    deleteTradeIds,
    deleteDepositIds: [...deleteDepositIds, ...replacedCardDepositIds],
    deleteWithdrawalIds,
  };
}

export function convertKey(convert: Pick<KucoinConvert, "executedAt" | "sellAmount" | "sellAsset">): string {
  return `kucoin-xlsx-convert:${convert.executedAt}:${convert.sellAmount}:${convert.sellAsset}`;
}

type Movement = { id?: string; key?: string; coin: string; amount: number; fee?: number; time: number; txId?: string };

/**
 * Lignes à effacer, chacune seulement si le même mouvement reste enregistré
 * par ailleurs — jamais la dernière trace d'un mouvement :
 * - une ligne tirée du relevé de compte, quand un mouvement de même actif
 *   et de même montant existe à moins d'une heure ;
 * - une ligne importée avec son hash, quand la synchronisation API a déjà
 *   enregistré ce hash sous son propre identifiant.
 */
function duplicateIds(
  existing: ExistingMovement[],
  incoming: Movement[],
  legacyPrefix: string,
  importedPrefix: string,
  sameAmount: (legacy: Movement, other: Movement) => boolean
): string[] {
  const doomed = new Set<string>();
  const survivors = () => [
    ...existing.filter((m) => !m.key.startsWith(legacyPrefix) && !doomed.has(m.id)),
    ...incoming,
  ];

  for (const row of existing) {
    if (!row.key.startsWith(importedPrefix) || row.key.startsWith(legacyPrefix) || !row.txId) continue;
    const hash = row.txId.toLowerCase();
    const fromApi = existing.some(
      (other) => other.id !== row.id && !other.key.startsWith(importedPrefix) && other.txId?.toLowerCase() === hash
    );
    if (fromApi) doomed.add(row.id);
  }

  for (const row of existing) {
    if (!row.key.startsWith(legacyPrefix)) continue;
    const twin = survivors().some(
      (other) => other.coin.toUpperCase() === row.coin.toUpperCase() && Math.abs(other.time - row.time) <= HOUR_MS && sameAmount(row, other)
    );
    if (twin) doomed.add(row.id);
  }
  return [...doomed];
}
