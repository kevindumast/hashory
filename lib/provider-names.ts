/** Noms lisibles des plateformes et réseaux, pour les comptes sans nom choisi. */
export const PROVIDER_NAMES: Record<string, string> = {
  binance: "Binance",
  kraken: "Kraken",
  kucoin: "KuCoin",
  ethereum: "Ethereum",
  bitcoin: "Bitcoin",
  arbitrum: "Arbitrum One",
  base: "Base",
  bsc: "BNB Smart Chain",
  polygon: "Polygon",
  optimism: "OP Mainnet",
  avalanche: "Avalanche",
  linea: "Linea",
  solana: "Solana",
  kaspa: "Kaspa",
  tao: "Bittensor (TAO)",
  bitstack: "Bitstack",
  finary: "Finary",
  strike: "Strike",
}

/**
 * Nom d'un compte : celui choisi par l'utilisateur d'abord. Des comptes ont
 * reçu l'identifiant de la plateforme pour nom (« kraken ») : ce n'en est pas un.
 */
export function accountName(account: { provider: string; displayName?: string | null }): string {
  return (
    (account.displayName !== account.provider && account.displayName) ||
    PROVIDER_NAMES[account.provider] ||
    account.displayName ||
    account.provider
  )
}
