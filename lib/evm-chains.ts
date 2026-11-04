/**
 * Chaînes EVM suivies par adresse publique.
 *
 * Une même adresse 0x… existe sur toutes ces chaînes, mais chacune a son
 * propre historique et son propre indexeur. Etherscan couvre Ethereum et
 * Arbitrum avec une clé gratuite ; Base et BNB Smart Chain n'y sont plus
 * accessibles qu'avec une offre payante, d'où Blockscout pour Base et
 * Alchemy pour BSC — tous deux gratuits pour un portefeuille personnel.
 * Binance n'expose aucune API d'historique gratuite : BscScan, l'explorateur
 * de référence, a rejoint Etherscan et son offre payante.
 *
 * Importé par les fonctions Convex comme par l'interface : aucune
 * dépendance serveur ici.
 */

import type { DataProviderId } from "./data-providers";

export type EvmChainId = "ethereum" | "arbitrum" | "base" | "bsc" | "polygon" | "optimism" | "avalanche" | "linea";

export type EvmChain = {
  id: EvmChainId;
  label: string;
  /** Identifiant EIP-155, celui qu'attendent les API multi-chaînes. */
  chainId: number;
  /** Jeton qui paie le gas sur la chaîne. */
  nativeSymbol: string;
  /** Indexeur interrogé, dont l'utilisateur fournit la clé. */
  dataProvider: Extract<DataProviderId, "etherscan" | "blockscout" | "alchemy">;
  /** Sous-domaine Alchemy du réseau, pour les chaînes lues par Alchemy. */
  alchemyNetwork?: string;
  /** Explorateur public : `${explorer}/tx/…`, `${explorer}/address/…`. */
  explorer: string;
};

export const EVM_CHAINS: Record<EvmChainId, EvmChain> = {
  ethereum: {
    id: "ethereum",
    explorer: "https://etherscan.io",
    label: "Ethereum",
    chainId: 1,
    nativeSymbol: "ETH",
    dataProvider: "etherscan",
  },
  arbitrum: {
    id: "arbitrum",
    explorer: "https://arbiscan.io",
    label: "Arbitrum One",
    chainId: 42161,
    nativeSymbol: "ETH",
    dataProvider: "etherscan",
  },
  base: {
    id: "base",
    explorer: "https://basescan.org",
    label: "Base",
    chainId: 8453,
    nativeSymbol: "ETH",
    dataProvider: "blockscout",
  },
  bsc: {
    id: "bsc",
    explorer: "https://bscscan.com",
    label: "BNB Smart Chain",
    chainId: 56,
    nativeSymbol: "BNB",
    dataProvider: "alchemy",
    alchemyNetwork: "bnb-mainnet",
  },
  // Chaînes lues par Alchemy, comme BSC : l'offre gratuite d'Etherscan ne les
  // couvre pas toutes, et une seule clé les ouvre. Chaque réseau doit être
  // coché dans l'app Alchemy de l'utilisateur.
  polygon: {
    id: "polygon",
    explorer: "https://polygonscan.com",
    label: "Polygon PoS",
    chainId: 137,
    nativeSymbol: "POL",
    dataProvider: "alchemy",
    alchemyNetwork: "polygon-mainnet",
  },
  optimism: {
    id: "optimism",
    explorer: "https://optimistic.etherscan.io",
    label: "OP Mainnet",
    chainId: 10,
    nativeSymbol: "ETH",
    dataProvider: "alchemy",
    alchemyNetwork: "opt-mainnet",
  },
  avalanche: {
    id: "avalanche",
    explorer: "https://snowtrace.io",
    label: "Avalanche C-Chain",
    chainId: 43114,
    nativeSymbol: "AVAX",
    dataProvider: "alchemy",
    alchemyNetwork: "avax-mainnet",
  },
  linea: {
    id: "linea",
    explorer: "https://lineascan.build",
    label: "Linea",
    chainId: 59144,
    nativeSymbol: "ETH",
    dataProvider: "alchemy",
    alchemyNetwork: "linea-mainnet",
  },
};

export const EVM_CHAIN_IDS = Object.keys(EVM_CHAINS) as EvmChainId[];

export function isEvmChain(id: string): id is EvmChainId {
  return Object.prototype.hasOwnProperty.call(EVM_CHAINS, id);
}

export function evmChain(id: string): EvmChain | null {
  return isEvmChain(id) ? EVM_CHAINS[id] : null;
}

/**
 * Point d'entrée de l'API « à la Etherscan » d'une chaîne : même modules,
 * mêmes paramètres, seule la base change. BSC, lu par Alchemy, n'en a pas.
 */
export function etherscanLikeBaseUrl(chain: EvmChain): string | null {
  switch (chain.dataProvider) {
    case "etherscan":
      return `https://api.etherscan.io/v2/api?chainid=${chain.chainId}`;
    case "blockscout":
      return `https://api.blockscout.com/v2/api?chain_id=${chain.chainId}`;
    default:
      return null;
  }
}

/** Point d'entrée JSON-RPC Alchemy d'une chaîne, clé comprise. */
export function alchemyRpcUrl(chain: EvmChain, apiKey: string): string | null {
  if (!chain.alchemyNetwork) return null;
  return `https://${chain.alchemyNetwork}.g.alchemy.com/v2/${encodeURIComponent(apiKey)}`;
}

/**
 * Ensemble de curseurs propre à chaque chaîne et à chaque flux : natif et
 * jetons pour les API à la Etherscan, reçus et envois pour Alchemy, qui
 * filtre sur l'un ou l'autre côté du transfert.
 */
export function evmDataset(chain: EvmChain, stream: "native" | "erc20" | "internal" | "in" | "out"): string {
  return `${chain.id}_${stream}`;
}
