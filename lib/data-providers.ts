/**
 * Fournisseurs de données de chaîne.
 *
 * Lire une adresse publique demande de passer par un service tiers : aucune
 * blockchain n'expose d'historique exploitable sans indexeur. Ces services
 * facturent à l'usage, et une clé unique partagée par tous les visiteurs
 * ferait porter ce coût — et la limite de débit qui va avec — à l'hébergeur.
 *
 * Chaque utilisateur apporte donc sa propre clé, en lecture seule. Les
 * offres gratuites de ces services couvrent largement le suivi d'un
 * portefeuille personnel.
 *
 * Ce fichier est la seule autorité sur la liste : il est importé aussi bien
 * par les fonctions Convex que par l'interface de réglages.
 */

export type DataProviderDefinition = {
  id: string;
  label: string;
  /** Ce que la clé permet de lire, dit du point de vue de l'utilisateur. */
  purpose: string;
  /** Sources dont la synchronisation dépend de cette clé. */
  serves: readonly string[];
  /** Page où obtenir une clé gratuite. */
  signupUrl: string;
  /** Repère de saisie, sans jamais reproduire une vraie clé. */
  placeholder: string;
};

export const DATA_PROVIDERS = [
  {
    id: "helius",
    label: "Helius",
    purpose: "Historique des transactions Solana.",
    serves: ["Solana"],
    signupUrl: "https://dashboard.helius.dev",
    placeholder: "Clé d'API Helius",
  },
  {
    id: "etherscan",
    label: "Etherscan",
    purpose: "Transactions et transferts de jetons Ethereum, BNB Smart Chain et Arbitrum.",
    serves: ["Ethereum", "BNB Smart Chain", "Arbitrum One"],
    signupUrl: "https://etherscan.io/myapikey",
    placeholder: "Clé d'API Etherscan",
  },
  {
    id: "taostats",
    label: "TaoStats",
    purpose: "Soldes et transferts Bittensor.",
    serves: ["Bittensor"],
    signupUrl: "https://dash.taostats.io",
    placeholder: "Clé d'API TaoStats",
  },
] as const satisfies readonly DataProviderDefinition[];

/** Identifiant de fournisseur connu du référentiel. */
export type DataProviderId = (typeof DATA_PROVIDERS)[number]["id"];

const BY_ID = new Map<string, DataProviderDefinition>(
  DATA_PROVIDERS.map((provider) => [provider.id, provider])
);

export const SUPPORTED_DATA_PROVIDERS: string[] = DATA_PROVIDERS.map((provider) => provider.id);

export function isSupportedDataProvider(id: string): boolean {
  return BY_ID.has(id);
}

export function dataProviderLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}

/** Fournisseur dont dépend la synchronisation d'une source donnée. */
const PROVIDER_BY_SOURCE: Record<string, DataProviderId> = {
  solana: "helius",
  ethereum: "etherscan",
  bsc: "etherscan",
  arbitrum: "etherscan",
  tao: "taostats",
};

export function dataProviderForSource(sourceId: string): DataProviderId | null {
  return PROVIDER_BY_SOURCE[sourceId] ?? null;
}

/**
 * Indice affiché à la place de la clé.
 *
 * Une clé enregistrée ne doit jamais ressortir de la base : on n'en montre
 * que les derniers caractères, assez pour reconnaître laquelle est en place,
 * trop peu pour en faire quoi que ce soit.
 */
export function maskKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 4) return "••••";
  return `••••${trimmed.slice(-4)}`;
}
