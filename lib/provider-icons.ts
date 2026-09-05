/**
 * Icônes des sources connectables.
 *
 * Séparé de `lib/providers.ts`, qui est importé par les fonctions Convex :
 * les icônes sont une affaire d'interface et n'ont rien à faire dans le
 * paquet serveur. La table vivait auparavant en trois exemplaires, avec des
 * écarts — Finary y portait l'icône de Bitcoin.
 */

/**
 * Logo Finary, fourni en ligne faute de source publique stable.
 * Les autres proviennent du dépôt d'images de CoinMarketCap.
 */
const FINARY_ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAMAAABF0y+mAAAARVBMVEUXEBQWDxQIAw4NBBQgES4pHio1KCo5LCk0JyYUCCMIBRECAAQnHx8EAgcVEBdTQjRtV0MAAAGWeFXxwIb5xor9yo3OpHNMvRV9AAAADXRSTlMCSLHc////37H//+joC0Us+AAAANpJREFUeAF1z1G2gyAMRdGAamt8ARF1/kN93AjRfnDs3143VULOD2NtKs3z5+uoNiyj2QhDn9uWZcTPlnPle4cMobZ1vJjWs00deYZqNq36pZURzKatPxI1cDvR5mEiEWUWjhsebRoLhQAEpz0f1rkEjZJq2s/8dEnDBJvfdkRuWMLwuZmjBMbDwKJxs2IS1hridNw1IxFRRNd9+EpN+MHryOjckjy1/zzVyvBl6cb6tnlPyaRUlyz4oHeGvWjt20q+j55cHx3R0LOBStJB0obuDjm//srqHZX+AbJ1JjCgp8LDAAAAAElFTkSuQmCC";

const CMC_EXCHANGE = "https://s2.coinmarketcap.com/static/img/exchanges/64x64";
const CMC_COIN = "https://s2.coinmarketcap.com/static/img/coins/64x64";

export const PROVIDER_ICONS: Record<string, string> = {
  binance: `${CMC_EXCHANGE}/270.png`,
  kraken: `${CMC_EXCHANGE}/24.png`,
  kucoin: `${CMC_EXCHANGE}/311.png`,
  bitcoin: `${CMC_COIN}/1.png`,
  ethereum: `${CMC_COIN}/1027.png`,
  arbitrum: `${CMC_COIN}/11841.png`,
  solana: `${CMC_COIN}/5426.png`,
  kaspa: `${CMC_COIN}/20396.png`,
  tao: `${CMC_COIN}/22974.png`,
  bitstack: "https://bitcoin.fr/wp-content/uploads/2022/05/Bitstack.jpg",
  finary: FINARY_ICON,
};

/** Icône d'une source, ou chaîne vide si aucune n'est connue. */
export function providerIcon(id: string): string {
  return PROVIDER_ICONS[id.toLowerCase()] ?? "";
}
