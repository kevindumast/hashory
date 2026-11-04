/**
 * Reconnaissance du DEX derrière un swap on-chain.
 *
 * Sur une chaîne EVM, un swap est une transaction adressée au contrat d'un
 * routeur (Uniswap, PancakeSwap, 1inch…) : c'est l'adresse appelée, pas
 * celle de la pool qui renvoie les jetons, qui dit quel service a été
 * utilisé. Sur Solana, l'indexeur Helius nomme lui-même la source.
 *
 * Pur et partagé par la synchronisation (Convex) et l'interface.
 */

import { EVM_CHAINS, EVM_CHAIN_IDS } from "./evm-chains";

/** Routeurs et agrégateurs déployés à la même adresse sur plusieurs chaînes. */
const MULTICHAIN: Record<string, string> = {
  // 1inch (v4, v5, v6)
  "0x1111111254fb6c44bac0bed2854e76f90643097d": "1inch",
  "0x1111111254eeb25477b68fb85ed929f73a960582": "1inch",
  "0x111111125421ca6dc452d289314280a0f8842a65": "1inch",
  // 0x Exchange Proxy
  "0xdef1c0ded9bec7f1a1670819833240f027b25eff": "0x",
  // ParaSwap (Augustus v5, v6)
  "0xdef171fe48cf0115b1d80b88dc8eab59176fee57": "ParaSwap",
  "0x6a000f20005980200259b80c5102003040001068": "ParaSwap",
  // KyberSwap MetaAggregationRouterV2
  "0x6131b5fae19ea4f9d964eac0408e4408b66337b5": "KyberSwap",
  // Balancer Vault
  "0xba12222222228d8ba445958a75a0704d566bf2c8": "Balancer",
  // LI.FI (swaps et ponts)
  "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae": "LI.FI",
  // CoW Protocol
  "0x9008d19f58aabd9ed0d60971565aa8510560ab41": "CoW Swap",
  // Uniswap SwapRouter02 (Ethereum, Arbitrum…)
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "Uniswap",
  // Uniswap Universal Router (Ethereum, Base)
  "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": "Uniswap",
};

const BY_CHAIN: Record<string, Record<string, string>> = {
  ethereum: {
    "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": "Uniswap",
    "0xe592427a0aece92de3edee1f18e0157c05861564": "Uniswap",
    "0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b": "Uniswap",
    "0x66a9893cc07d91d95644aedd05d03f95e1dba8af": "Uniswap",
    "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f": "SushiSwap",
    "0xcf5540fffcdc3d510b18bfca6d2b9987b0772559": "Odos",
    "0x881d40237659c251811cec9c364ef91dc08d300c": "MetaMask Swaps",
  },
  arbitrum: {
    "0xe592427a0aece92de3edee1f18e0157c05861564": "Uniswap",
    "0x5e325eda8064b456f4781070c0738d849c824258": "Uniswap",
    "0x4c60051384bd2d3c01bfc845cf5f4b44bcbe9de5": "Uniswap",
    "0xa51afafe0263b40edaef0df8781ea9aa03e381a3": "Uniswap",
    "0xc873fecbd354f5a56e00e710b90ef4201db2448d": "Camelot",
    "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506": "SushiSwap",
    "0xa669e7a0d4b3e4fa48af2de86bd4cd7126be4e13": "Odos",
  },
  base: {
    "0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43": "Aerodrome",
    "0x6ff5693b99212da76ad316178a184ab56d299b43": "Uniswap",
    "0x2626664c2603336e57b271c5c0b26f421741e481": "Uniswap",
    "0x19ceead7105607cd444f5ad10dd51356436095a1": "Odos",
  },
  bsc: {
    "0x10ed43c718714eb63d5aa57b78b54704e256024e": "PancakeSwap",
    "0x13f4ea83d0bd40e75c8222255bc855a974568dd4": "PancakeSwap",
    "0x1a0a18ac4becddbd6389559687d1a73d8927e416": "PancakeSwap",
    "0x4dae2f939acf50408e13d58534ff8c2776d45265": "Uniswap",
    "0x1906c1d672b88cd1b9ac7593301ca990f94eae07": "Uniswap",
    "0x89b8aa89fdd0507a99d334cbe3c808fafc7d850e": "Odos",
    "0x1a1ec25dc08e98e5e93f1104b5e5cdd298707d31": "MetaMask Swaps",
  },
};

/** DEX ou agrégateur d'une adresse de contrat sur une chaîne EVM, ou null. */
export function dexFromAddress(chain: string, address: string | null | undefined): string | null {
  if (!address) return null;
  const key = address.toLowerCase();
  return BY_CHAIN[chain.toLowerCase()]?.[key] ?? MULTICHAIN[key] ?? null;
}

/** Noms usuels des sources que Helius attribue aux swaps Solana. */
const SOLANA_SOURCES: Record<string, string> = {
  JUPITER: "Jupiter",
  JUPITER_LIMIT_ORDER: "Jupiter",
  RAYDIUM: "Raydium",
  ORCA: "Orca",
  WHIRLPOOL: "Orca",
  METEORA: "Meteora",
  PHOENIX: "Phoenix",
  LIFINITY: "Lifinity",
  OPENBOOK: "OpenBook",
  SERUM: "Serum",
  SABER: "Saber",
  ALDRIN: "Aldrin",
  CREMA: "Crema",
  PUMP_FUN: "Pump.fun",
  PUMP_AMM: "PumpSwap",
  MOONSHOT: "Moonshot",
  OKX_DEX_ROUTER: "OKX DEX",
  DFLOW: "DFlow",
  STEP_FINANCE: "Step Finance",
  MARINADE: "Marinade",
};

/** Sources Helius qui ne sont pas un service d'échange. */
const NON_DEX_SOURCES = new Set(["", "UNKNOWN", "SYSTEM_PROGRAM", "SOLANA_PROGRAM_LIBRARY", "STAKE_PROGRAM"]);

/**
 * DEX d'une transaction Solana d'après Helius (`type`, `source`), ou null.
 * Une source inconnue d'un swap est rendue lisible plutôt que perdue.
 */
export function dexFromHelius(type: string | null | undefined, source: string | null | undefined): string | null {
  const key = (source ?? "").toUpperCase();
  if (NON_DEX_SOURCES.has(key)) return null;
  if (SOLANA_SOURCES[key]) return SOLANA_SOURCES[key];
  if ((type ?? "").toUpperCase() !== "SWAP") return null;
  return key
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Libellé court d'une adresse de contrat non reconnue. */
export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

const ADDRESS_EXPLORERS: Partial<Record<string, (address: string) => string>> = {
  ...Object.fromEntries(EVM_CHAIN_IDS.map((id) => [id, (a: string) => `${EVM_CHAINS[id].explorer}/address/${a}`])),
  bitcoin: (a) => `https://mempool.space/address/${a}`,
  solana: (a) => `https://solscan.io/account/${a}`,
  kaspa: (a) => `https://explorer.kaspa.org/addresses/${a}`,
  tao: (a) => `https://taostats.io/account/${a}`,
};

/** Lien vers une adresse sur l'explorateur du réseau, pour remonter à l'origine des fonds. */
export function addressExplorerUrl(provider: string, address: string | null | undefined): string | null {
  if (!address) return null;
  const build = ADDRESS_EXPLORERS[provider.toLowerCase()];
  return build ? build(address) : null;
}
