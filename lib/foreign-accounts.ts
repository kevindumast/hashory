/**
 * Comptes d'actifs numériques ouverts à l'étranger — formulaire 3916-bis.
 *
 * Tout compte ouvert auprès d'un prestataire établi hors de France se déclare
 * chaque année avec la déclaration de revenus, qu'il ait servi ou non (art.
 * 1649 bis C du CGI). L'oubli coûte 750 € par compte, 1 500 € si sa valeur
 * dépasse 50 000 € (art. 1736 X du CGI). Les portefeuilles en auto-garde
 * n'y sont pas soumis : aucun compte n'est ouvert auprès d'un tiers.
 *
 * L'entité contractante dépend de la date d'ouverture et du pays de
 * résidence : les indications ci-dessous sont un point de départ, à
 * confronter aux conditions d'utilisation de chaque compte.
 */

export const FINE_PER_ACCOUNT_EUR = 750;
export const FINE_LARGE_ACCOUNT_EUR = 1_500;
export const LARGE_ACCOUNT_THRESHOLD_EUR = 50_000;

export type ForeignAccountStatus = "declare" | "verify" | "exempt";

export type PlatformEntity = {
  status: ForeignAccountStatus;
  entity?: string;
  country?: string;
  note: string;
};

const SELF_CUSTODY: PlatformEntity = {
  status: "exempt",
  note: "Portefeuille en auto-garde : aucun compte n'est ouvert auprès d'un tiers.",
};

/** Réseaux suivis par adresse publique : jamais un compte chez un prestataire. */
const BLOCKCHAINS = new Set(["bitcoin", "ethereum", "solana", "kaspa", "tao", "arbitrum", "base", "bsc"]);

const PLATFORMS: Record<string, PlatformEntity> = {
  kraken: {
    status: "declare",
    entity: "Payward Europe Solutions Limited",
    country: "Irlande",
    note: "Plateforme établie hors de France : le compte se déclare chaque année.",
  },
  kucoin: {
    status: "declare",
    entity: "Mek Global Limited",
    country: "Seychelles",
    note: "Plateforme établie hors de France : le compte se déclare chaque année.",
  },
  binance: {
    status: "verify",
    entity: "Binance France SAS",
    country: "France",
    note: "Les comptes ouverts depuis 2022 relèvent de l'entité française ; un compte plus ancien a pu l'être auprès d'une entité étrangère.",
  },
  bitstack: {
    status: "exempt",
    entity: "Bitstack SAS",
    country: "France",
    note: "Prestataire établi en France : pas de 3916-bis.",
  },
  strike: {
    status: "verify",
    note: "Prestataire établi hors de France : vérifiez l'entité contractante dans vos conditions d'utilisation.",
  },
  finary: {
    status: "verify",
    note: "Agrégateur : seul le prestataire qui conserve vos cryptos compte. Vérifiez lequel dans vos conditions d'utilisation.",
  },
};

export function platformEntity(provider: string): PlatformEntity {
  const key = provider.toLowerCase();
  if (BLOCKCHAINS.has(key)) return SELF_CUSTODY;
  return (
    PLATFORMS[key] ?? {
      status: "verify",
      note: "Plateforme inconnue de Hashory : vérifiez le pays de l'entité contractante.",
    }
  );
}

export type ForeignAccountInput = {
  provider: string;
  name: string;
  /** Ouverture du compte, quand la plateforme la communique. */
  openedAt?: number | null;
  /** Première opération connue, à défaut de date d'ouverture. */
  firstActivityAt?: number | null;
  /** Valeur actuelle du compte, en euros. */
  valueEur?: number | null;
};

export type ForeignAccountRow = ForeignAccountInput &
  PlatformEntity & {
    /** Amende encourue si le compte n'est pas déclaré ; null s'il n'est pas concerné. */
    fineEur: number | null;
  };

const ORDER: Record<ForeignAccountStatus, number> = { declare: 0, verify: 1, exempt: 2 };

/**
 * Comptes regroupés par plateforme : deux connexions à la même plateforme
 * (clé API et import de fichiers) désignent en général un seul compte.
 */
export function foreignAccounts(accounts: ForeignAccountInput[]): ForeignAccountRow[] {
  const byProvider = new Map<string, ForeignAccountInput>();
  for (const account of accounts) {
    const key = account.provider.toLowerCase();
    const current = byProvider.get(key);
    if (!current) {
      byProvider.set(key, { ...account });
      continue;
    }
    byProvider.set(key, {
      provider: current.provider,
      name: current.name === account.name ? current.name : `${current.name} · ${account.name}`,
      openedAt: earliest(current.openedAt, account.openedAt),
      firstActivityAt: earliest(current.firstActivityAt, account.firstActivityAt),
      valueEur:
        current.valueEur == null && account.valueEur == null
          ? null
          : (current.valueEur ?? 0) + (account.valueEur ?? 0),
    });
  }

  return [...byProvider.values()]
    .map((account) => {
      const entity = platformEntity(account.provider);
      const fineEur =
        entity.status === "exempt"
          ? null
          : (account.valueEur ?? 0) > LARGE_ACCOUNT_THRESHOLD_EUR
            ? FINE_LARGE_ACCOUNT_EUR
            : FINE_PER_ACCOUNT_EUR;
      return { ...account, ...entity, fineEur };
    })
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name));
}

function earliest(a?: number | null, b?: number | null): number | null {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Math.min(a, b);
}
