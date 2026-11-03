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

// ─── Moralis (historique de wallet) ──────────────────────────────────────

export interface MoralisNativeTransfer {
  from_address: string;
  to_address: string | null;
  value: string;
  internal_transaction?: boolean;
}

export interface MoralisErc20Transfer {
  address: string;
  from_address: string;
  to_address: string | null;
  value: string;
  token_symbol: string | null;
  token_decimals: string | null;
  log_index: number;
  possible_spam?: boolean;
}

export interface MoralisHistoryItem {
  hash: string;
  block_number: string;
  block_timestamp: string;
  from_address: string;
  receipt_status: string;
  /** Frais en unités natives (« 0.000105 »), pas en wei. */
  transaction_fee?: string | null;
  native_transfers?: MoralisNativeTransfer[];
  erc20_transfers?: MoralisErc20Transfer[];
}

/**
 * Historique Moralis : chaque transaction porte ses transferts natifs
 * (internes compris) et ses transferts de jetons. Les jetons signalés comme
 * spam — légion sur BSC — sont écartés : ils pollueraient le portefeuille de
 * soldes sans valeur.
 */
export function parseMoralisHistory(
  items: readonly MoralisHistoryItem[],
  address: string,
  chain: EvmChain
): ParsedTransfers {
  const self = address.toLowerCase();
  const tag = nativeTag(chain);
  const deposits: WalletDeposit[] = [];
  const withdrawals: WalletWithdrawal[] = [];
  let maxBlock = 0;

  for (const item of items) {
    const blockNumber = parseInt(item.block_number, 10);
    if (blockNumber > maxBlock) maxBlock = blockNumber;

    if (item.receipt_status !== "1") continue;

    const timeStamp = Date.parse(item.block_timestamp);
    if (Number.isNaN(timeStamp)) continue;

    // Le gas n'est imputé qu'une fois, au premier envoi natif de la
    // transaction — comme pour les chaînes lues via Etherscan.
    let fee = item.from_address.toLowerCase() === self ? Number(item.transaction_fee ?? 0) || 0 : 0;

    (item.native_transfers ?? []).forEach((transfer, index) => {
      const value = BigInt(transfer.value);
      if (value === BigInt(0)) return;
      const amount = Number(value) / 1e18;
      const from = transfer.from_address.toLowerCase();
      const to = (transfer.to_address ?? "").toLowerCase();

      if (to === self && from !== self) {
        deposits.push({
          depositId: `${item.hash}-${tag}-${index}-in`,
          coin: chain.nativeSymbol,
          amount,
          network: chain.id,
          status: "CONFIRMED",
          insertTime: timeStamp,
          txId: item.hash,
        });
      } else if (from === self) {
        withdrawals.push({
          withdrawId: `${item.hash}-${tag}-${index}-out`,
          coin: chain.nativeSymbol,
          amount,
          network: chain.id,
          status: "CONFIRMED",
          applyTime: timeStamp,
          txId: item.hash,
          fee,
        });
        fee = 0;
      }
    });

    for (const transfer of item.erc20_transfers ?? []) {
      if (transfer.possible_spam) continue;
      const decimals = parseInt(transfer.token_decimals ?? "", 10);
      if (Number.isNaN(decimals)) continue;
      const value = BigInt(transfer.value);
      if (value === BigInt(0)) continue;

      const amount = Number(value) / 10 ** decimals;
      const from = transfer.from_address.toLowerCase();
      const to = (transfer.to_address ?? "").toLowerCase();
      const contract = transfer.address.toLowerCase();
      const symbol = transfer.token_symbol || contract.slice(0, 8);
      const id = `${item.hash}-${contract}-${transfer.log_index}`;

      if (to === self && from !== self) {
        deposits.push({
          depositId: `${id}-in`,
          coin: symbol,
          amount,
          network: chain.id,
          status: "CONFIRMED",
          insertTime: timeStamp,
          txId: item.hash,
        });
      } else if (from === self) {
        withdrawals.push({
          withdrawId: `${id}-out`,
          coin: symbol,
          amount,
          network: chain.id,
          status: "CONFIRMED",
          applyTime: timeStamp,
          txId: item.hash,
          fee: 0,
        });
      }
    }
  }

  return { deposits, withdrawals, maxBlock };
}
