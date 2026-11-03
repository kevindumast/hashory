/**
 * Opérations on-chain : celles des wallets en auto-garde, lues directement
 * sur la blockchain. Pur et testable : réseaux, liens vers les explorateurs,
 * et le bilan affiché en tête de l'onglet « On-chain ».
 */

import { isSpoofedSymbol } from "./tax-chain";

export { isSpoofedSymbol };

/** Comptes lus sur la blockchain, et le nom de leur réseau. */
export const BLOCKCHAIN_NETWORKS: Record<string, string> = {
  bitcoin: "Bitcoin",
  ethereum: "Ethereum",
  arbitrum: "Arbitrum",
  base: "Base",
  bsc: "BNB Chain",
  solana: "Solana",
  kaspa: "Kaspa",
  tao: "Bittensor",
};

export function isOnchainProvider(provider: string): boolean {
  return provider.toLowerCase() in BLOCKCHAIN_NETWORKS;
}

const EXPLORERS: Partial<Record<string, (txId: string) => string>> = {
  bitcoin: (tx) => `https://mempool.space/tx/${tx}`,
  ethereum: (tx) => `https://etherscan.io/tx/${tx}`,
  arbitrum: (tx) => `https://arbiscan.io/tx/${tx}`,
  base: (tx) => `https://basescan.org/tx/${tx}`,
  bsc: (tx) => `https://bscscan.com/tx/${tx}`,
  solana: (tx) => `https://solscan.io/tx/${tx}`,
  kaspa: (tx) => `https://explorer.kaspa.org/txs/${tx}`,
  tao: (tx) => `https://taostats.io/extrinsic/${tx}`,
};

/** Lien vers la transaction sur l'explorateur du réseau, si on en connaît un. */
export function explorerUrl(provider: string, txId: string | null | undefined): string | null {
  if (!txId) return null;
  const build = EXPLORERS[provider.toLowerCase()];
  // Un identifiant de plateforme (« FTPEmUh-… ») n'est pas un hash on-chain.
  return build && /^(0x)?[0-9a-zA-Z]{20,}$/.test(txId) ? build(txId) : null;
}

export type OnchainRow = {
  kind: "trade" | "deposit" | "withdrawal";
  provider: string;
  asset: string | null;
  /** Frais payés, en dollars ; `null` si inconnus. */
  feeUsd: number | null;
  txId: string | null;
};

export type OnchainSummary = {
  operations: number;
  networks: { provider: string; name: string; count: number }[];
  gasUsd: number;
  spoofed: number;
};

/** Bilan des opérations on-chain : volume par réseau, frais réseau, faux jetons reçus. */
export function onchainSummary(rows: OnchainRow[]): OnchainSummary {
  const byNetwork = new Map<string, number>();
  let gasUsd = 0;
  let spoofed = 0;
  let operations = 0;
  for (const row of rows) {
    if (!isOnchainProvider(row.provider)) continue;
    if (row.asset && isSpoofedSymbol(row.asset)) {
      spoofed += 1;
      continue;
    }
    operations += 1;
    const key = row.provider.toLowerCase();
    byNetwork.set(key, (byNetwork.get(key) ?? 0) + 1);
    if (row.kind === "withdrawal" && row.feeUsd) gasUsd += row.feeUsd;
  }
  return {
    operations,
    networks: [...byNetwork.entries()]
      .map(([provider, count]) => ({ provider, name: BLOCKCHAIN_NETWORKS[provider], count }))
      .sort((a, b) => b.count - a.count),
    gasUsd,
    spoofed,
  };
}
