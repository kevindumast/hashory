/**
 * Format des adresses publiques par chaîne. Une adresse d'une autre chaîne
 * — une adresse Bitcoin saisie pour Solana — n'était refusée qu'à la
 * synchronisation, par un « Bad Request » de l'API qui ne disait rien.
 */

const BASE58 = "1-9A-HJ-NP-Za-km-z";

const PATTERNS: Record<string, { pattern: RegExp; example: string }> = {
  bitcoin: {
    pattern: new RegExp(`^(bc1[02-9ac-hj-np-z]{11,71}|[13][${BASE58}]{25,34})$`),
    example: "bc1q…, 1… ou 3…",
  },
  ethereum: { pattern: /^0x[0-9a-fA-F]{40}$/, example: "0x suivi de 40 caractères hexadécimaux" },
  solana: { pattern: new RegExp(`^[${BASE58}]{32,44}$`), example: "32 à 44 caractères base58" },
  kaspa: { pattern: /^kaspa:[a-z0-9]{61,63}$/, example: "kaspa:q…" },
  tao: { pattern: new RegExp(`^5[${BASE58}]{46,47}$`), example: "5… (SS58)" },
};

/** Message d'erreur si l'adresse ne correspond pas à la chaîne, sinon null. */
export function walletAddressError(provider: string, address: string): string | null {
  const rule = PATTERNS[provider];
  if (!rule) return null;
  const value = address.trim();
  if (!value) return "Adresse requise.";
  return rule.pattern.test(value) ? null : `Cette adresse n'est pas une adresse ${provider} valide (attendu : ${rule.example}).`;
}
