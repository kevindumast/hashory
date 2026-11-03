/**
 * Lecture des transferts d'un wallet EVM.
 *
 * Fonctions pures : elles transforment les réponses des indexeurs en dépôts
 * et retraits, sans rien savoir de Convex. C'est ce qui permet de garantir
 * par les tests que l'ajout d'une chaîne ne change rien à ce qu'Ethereum
 * produisait déjà — mêmes identifiants, mêmes montants, même réseau — et
 * donc qu'une resynchronisation ne crée aucun doublon.
 */

import type { EvmChain } from "./evm-chains";

export type WalletDeposit = {
  depositId: string;
  coin: string;
  amount: number;
  network: string;
  status: string;
  insertTime: number;
  txId: string;
};

export type WalletWithdrawal = {
  withdrawId: string;
  coin: string;
  amount: number;
  network: string;
  status: string;
  applyTime: number;
  txId: string;
  fee: number;
};

export type ParsedTransfers = {
  deposits: WalletDeposit[];
  withdrawals: WalletWithdrawal[];
  /** Plus haut bloc rencontré, transactions écartées comprises. */
  maxBlock: number;
};

// ─── API « à la Etherscan » (Etherscan, Blockscout) ──────────────────────

export interface EtherscanTx {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string | null;
  value: string;
  gasUsed: string;
  gasPrice: string;
  isError: string;
}

export interface EtherscanTokenTx {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string | null;
  value: string;
  tokenSymbol: string;
  tokenDecimal: string;
  contractAddress: string;
}

export interface EtherscanResponse<T> {
  status?: string;
  message?: string;
  result?: T[] | string | null;
  /** Forme des erreurs de Blockscout, hors du schéma Etherscan. */
  error?: string;
}

export type EtherscanOutcome<T> =
  | { kind: "ok"; txs: T[] }
  | { kind: "empty" }
  | { kind: "rejected_key" }
  | { kind: "paid_chain" }
  | { kind: "error"; message: string };

/**
 * Sens d'une réponse. Etherscan répond 200 même à une clé refusée ou à une
 * chaîne hors de l'offre gratuite : seul le détail le dit.
 */
export function interpretEtherscanResponse<T>(data: EtherscanResponse<T>): EtherscanOutcome<T> {
  if (typeof data.error === "string") {
    return /unauthori[sz]ed|api key/i.test(data.error)
      ? { kind: "rejected_key" }
      : { kind: "error", message: data.error };
  }
  if (data.status === "1") {
    return { kind: "ok", txs: Array.isArray(data.result) ? data.result : [] };
  }
  if (data.message === "No transactions found") return { kind: "empty" };
  const detail = typeof data.result === "string" ? data.result : "";
  if (/invalid api key|missing\/invalid api key/i.test(detail)) return { kind: "rejected_key" };
  if (/free api access is not supported/i.test(detail)) return { kind: "paid_chain" };
  return { kind: "error", message: `${data.message ?? ""} ${detail}`.trim() };
}

/**
 * Suffixe des identifiants de transfert natif. Sur Ethereum il vaut « eth » :
 * c'est l'identifiant historique, qu'il ne faut pas changer sous peine de
 * dupliquer tout l'historique déjà enregistré.
 */
function nativeTag(chain: EvmChain): string {
  return chain.nativeSymbol.toLowerCase();
}

/** Transactions natives (txlist) : montants en wei, gas payé par l'émetteur. */
export function parseNativeTxs(
  txs: readonly EtherscanTx[],
  address: string,
  chain: EvmChain
): ParsedTransfers {
  const self = address.toLowerCase();
  const tag = nativeTag(chain);
  const deposits: WalletDeposit[] = [];
  const withdrawals: WalletWithdrawal[] = [];
  let maxBlock = 0;

  for (const tx of txs) {
    const blockNumber = parseInt(tx.blockNumber, 10);
    if (blockNumber > maxBlock) maxBlock = blockNumber;

    if (tx.isError === "1") continue;

    const value = BigInt(tx.value);
    if (value === BigInt(0)) continue;

    const timeStamp = parseInt(tx.timeStamp, 10) * 1000;
    const amount = Number(value) / 1e18;
    const from = tx.from.toLowerCase();
    const to = (tx.to ?? "").toLowerCase();

    if (to === self && from !== self) {
      deposits.push({
        depositId: `${tx.hash}-${tag}-in`,
        coin: chain.nativeSymbol,
        amount,
        network: chain.id,
        status: "CONFIRMED",
        insertTime: timeStamp,
        txId: tx.hash,
      });
    } else if (from === self) {
      const gasFee = Number(BigInt(tx.gasUsed) * BigInt(tx.gasPrice)) / 1e18;
      withdrawals.push({
        withdrawId: `${tx.hash}-${tag}-out`,
        coin: chain.nativeSymbol,
        amount,
        network: chain.id,
        status: "CONFIRMED",
        applyTime: timeStamp,
        txId: tx.hash,
        fee: gasFee,
      });
    }
  }

  return { deposits, withdrawals, maxBlock };
}

/** Transferts de jetons (tokentx). Un jeton sans décimales (NFT) est ignoré. */
export function parseTokenTxs(
  txs: readonly EtherscanTokenTx[],
  address: string,
  chain: EvmChain
): ParsedTransfers {
  const self = address.toLowerCase();
  const deposits: WalletDeposit[] = [];
  const withdrawals: WalletWithdrawal[] = [];
  let maxBlock = 0;

  for (const tx of txs) {
    const blockNumber = parseInt(tx.blockNumber, 10);
    if (blockNumber > maxBlock) maxBlock = blockNumber;

    const decimals = parseInt(tx.tokenDecimal, 10);
    if (Number.isNaN(decimals)) continue;

    const value = BigInt(tx.value);
    if (value === BigInt(0)) continue;

    const timeStamp = parseInt(tx.timeStamp, 10) * 1000;
    const amount = Number(value) / 10 ** decimals;
    const from = tx.from.toLowerCase();
    const to = (tx.to ?? "").toLowerCase();
    const contract = tx.contractAddress.toLowerCase();
    const symbol = tx.tokenSymbol || contract.slice(0, 8);

    if (to === self && from !== self) {
      deposits.push({
        depositId: `${tx.hash}-${contract}-in`,
        coin: symbol,
        amount,
        network: chain.id,
        status: "CONFIRMED",
        insertTime: timeStamp,
        txId: tx.hash,
      });
    } else if (from === self) {
      withdrawals.push({
        withdrawId: `${tx.hash}-${contract}-out`,
        coin: symbol,
        amount,
        network: chain.id,
        status: "CONFIRMED",
        applyTime: timeStamp,
        txId: tx.hash,
        fee: 0,
      });
    }
  }

  return { deposits, withdrawals, maxBlock };
}

// ─── Alchemy (alchemy_getAssetTransfers) ─────────────────────────────────

export interface AlchemyTransfer {
  /** Numéro de bloc en hexadécimal. */
  blockNum: string;
  /** « {hash}:external » ou « {hash}:log:{index} ». */
  uniqueId: string;
  hash: string;
  from: string;
  to: string | null;
  asset: string | null;
  category: string;
  rawContract: {
    /** Montant brut en hexadécimal. */
    value: string | null;
    address: string | null;
    /** Décimales en hexadécimal, null si inconnues. */
    decimal: string | null;
  };
  /** Absent sur BNB Smart Chain : Alchemy ne le fournit que sur quelques réseaux. */
  metadata?: { blockTimestamp?: string } | null;
}

/** Blocs dont il faut demander l'horodatage, faute de métadonnées. */
export function alchemyBlocksMissingTimestamp(transfers: readonly AlchemyTransfer[]): string[] {
  const blocks = new Set<string>();
  for (const transfer of transfers) {
    if (!transfer.metadata?.blockTimestamp) blocks.add(transfer.blockNum.toLowerCase());
  }
  return [...blocks];
}

/**
 * Transactions dont l'adresse a payé le gas en envoyant du natif : ce sont
 * les seules dont on lit le reçu, comme on n'impute le gas qu'aux envois
 * natifs sur les chaînes lues via Etherscan.
 */
export function alchemyOutgoingNativeHashes(
  transfers: readonly AlchemyTransfer[],
  address: string
): string[] {
  const self = address.toLowerCase();
  const hashes = new Set<string>();
  for (const transfer of transfers) {
    if (transfer.category === "external" && transfer.from.toLowerCase() === self) {
      hashes.add(transfer.hash);
    }
  }
  return [...hashes];
}

/** Frais d'une transaction à partir de son reçu (valeurs hexadécimales). */
export function feeFromReceipt(receipt: { gasUsed: string; effectiveGasPrice: string }): number {
  return Number(BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice)) / 1e18;
}

/**
 * Transferts Alchemy : envois natifs (« external ») et jetons (« erc20 »).
 * Les horodatages (`blockTimes`, en ms, indexés par bloc hexadécimal) et les
 * frais (`fees`, par hash) viennent d'appels séparés quand Alchemy ne les
 * fournit pas. Un transfert sans date fait échouer la lecture plutôt que
 * d'être daté au hasard : le curseur n'avance pas, la synchro suivante
 * réessaie.
 */
export function parseAlchemyTransfers(
  transfers: readonly AlchemyTransfer[],
  address: string,
  chain: EvmChain,
  lookups: { blockTimes: ReadonlyMap<string, number>; fees: ReadonlyMap<string, number> }
): ParsedTransfers {
  const self = address.toLowerCase();
  const tag = nativeTag(chain);
  const deposits: WalletDeposit[] = [];
  const withdrawals: WalletWithdrawal[] = [];
  const seen = new Set<string>();
  let maxBlock = 0;

  for (const transfer of transfers) {
    const blockNumber = parseInt(transfer.blockNum, 16);
    if (blockNumber > maxBlock) maxBlock = blockNumber;

    const isNative = transfer.category === "external";
    if (!isNative && transfer.category !== "erc20") continue;

    const decimals = isNative ? 18 : parseInt(transfer.rawContract.decimal ?? "", 16);
    if (Number.isNaN(decimals) || !transfer.rawContract.value) continue;

    const value = BigInt(transfer.rawContract.value);
    if (value === BigInt(0)) continue;

    const metaTime = transfer.metadata?.blockTimestamp;
    const timeStamp = metaTime
      ? Date.parse(metaTime)
      : lookups.blockTimes.get(transfer.blockNum.toLowerCase());
    if (timeStamp === undefined || Number.isNaN(timeStamp)) {
      throw new Error(`Horodatage introuvable pour le bloc ${blockNumber}`);
    }

    const amount = Number(value) / 10 ** decimals;
    const from = transfer.from.toLowerCase();
    const to = (transfer.to ?? "").toLowerCase();
    const contract = (transfer.rawContract.address ?? "").toLowerCase();
    const coin = isNative ? chain.nativeSymbol : transfer.asset || contract.slice(0, 8);
    const logIndex = transfer.uniqueId.split(":").pop();
    const base = isNative ? `${transfer.hash}-${tag}` : `${transfer.hash}-${contract}-${logIndex}`;

    if (to === self && from !== self) {
      const depositId = `${base}-in`;
      if (seen.has(depositId)) continue;
      seen.add(depositId);
      deposits.push({
        depositId,
        coin,
        amount,
        network: chain.id,
        status: "CONFIRMED",
        insertTime: timeStamp,
        txId: transfer.hash,
      });
    } else if (from === self) {
      const withdrawId = `${base}-out`;
      if (seen.has(withdrawId)) continue;
      seen.add(withdrawId);
      withdrawals.push({
        withdrawId,
        coin,
        amount,
        network: chain.id,
        status: "CONFIRMED",
        applyTime: timeStamp,
        txId: transfer.hash,
        fee: isNative ? (lookups.fees.get(transfer.hash) ?? 0) : 0,
      });
    }
  }

  return { deposits, withdrawals, maxBlock };
}
