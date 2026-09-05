/**
 * Référentiel des sources connectables.
 *
 * Ce fichier est la seule autorité sur la question « cette source
 * existe-t-elle, et de quelle nature est-elle ? ». La liste vivait auparavant
 * en plusieurs exemplaires — validation serveur, mise à jour automatique,
 * page des comptes, panneau de signaux — et une source ajoutée à l'interface
 * pouvait être rejetée par le serveur sans que rien ne le signale avant
 * l'exécution.
 *
 * Toute nouvelle intégration commence ici.
 */

export type ProviderKind =
  /** Compte interrogé par API : synchronisable, automatiquement ou à la demande. */
  | "api"
  /** Adresse publique suivie sur une chaîne : synchronisable également. */
  | "wallet"
  /** Historique importé depuis un fichier : rien à resynchroniser. */
  | "file";

export type ProviderDefinition = {
  id: string;
  label: string;
  kind: ProviderKind;
};

export const PROVIDERS = [
  { id: "binance", label: "Binance", kind: "api" },
  { id: "kraken", label: "Kraken", kind: "api" },
  { id: "kucoin", label: "KuCoin", kind: "api" },
  { id: "bitcoin", label: "Bitcoin", kind: "wallet" },
  { id: "ethereum", label: "Ethereum", kind: "wallet" },
  { id: "solana", label: "Solana", kind: "wallet" },
  { id: "kaspa", label: "Kaspa", kind: "wallet" },
  { id: "tao", label: "Bittensor", kind: "wallet" },
  { id: "bitstack", label: "Bitstack", kind: "file" },
  { id: "finary", label: "Finary", kind: "file" },
] as const satisfies readonly ProviderDefinition[];

/**
 * Identifiant de source connu du référentiel.
 *
 * Déclarer une source à l'interface sans l'inscrire ici devient une erreur de
 * compilation : c'est exactement l'oubli qui faisait rejeter Kraken par le
 * serveur alors que le dialogue le proposait.
 */
export type ProviderId = (typeof PROVIDERS)[number]["id"];

const BY_ID = new Map<string, ProviderDefinition>(
  PROVIDERS.map((provider) => [provider.id, provider])
);

/** Identifiants acceptés à la création d'une intégration. */
export const SUPPORTED_PROVIDERS: string[] = PROVIDERS.map((provider) => provider.id);

const idsOfKind = (kind: ProviderKind): ReadonlySet<string> =>
  new Set<string>(
    PROVIDERS.filter((provider) => provider.kind === kind).map((provider) => provider.id)
  );

/** Sources interrogées par API : elles portent des identifiants chiffrés. */
export const API_PROVIDERS = idsOfKind("api");

/** Adresses publiques suivies sur une chaîne. */
export const WALLET_PROVIDERS = idsOfKind("wallet");

/** Sources issues d'un fichier : aucune synchronisation possible. */
export const FILE_IMPORT_PROVIDERS = idsOfKind("file");

export function isSupportedProvider(id: string): boolean {
  return BY_ID.has(id);
}

export function providerLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}

/**
 * Vrai si la source peut être resynchronisée — par API ou par lecture de
 * chaîne. Un import de fichier ne se met jamais à jour tout seul.
 */
export function isSyncable(id: string): boolean {
  const kind = BY_ID.get(id)?.kind;
  return kind === "api" || kind === "wallet";
}
