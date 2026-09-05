/**
 * Moteur de signaux.
 *
 * Un tableau de bord ne prévient de rien : il faut y aller pour découvrir
 * qu'un compte est en erreur ou qu'une échéance approche. Ce module rassemble
 * les conditions qui méritent d'être portées à l'attention, en un seul
 * endroit, pur et testable.
 *
 * Deux règles de conception. Un signal doit être **actionnable** : s'il
 * n'appelle aucune décision, il n'a rien à faire ici. Et il doit rester
 * **rare** : une liste toujours pleine ne se lit plus.
 */

export type SignalSeverity = "critical" | "warning" | "info";

export type Signal = {
  id: string;
  severity: SignalSeverity;
  title: string;
  detail: string;
  /** Page vers laquelle diriger pour traiter le signal. */
  href?: string;
};

export type SignalIntegration = {
  id: string;
  label: string;
  syncStatus: "idle" | "syncing" | "synced" | "error";
  lastSyncedAt: number | null;
  syncEnabled: boolean;
  isFileImport: boolean;
};

export type SignalInput = {
  now: number;
  integrations: SignalIntegration[];
  /** Première position du portefeuille, par le poids. */
  topAsset: { key: string; weight: number } | null;
  effectiveCount: number;
  /** Plateforme concentrant le plus d'actifs. */
  topVenue: { key: string; weight: number } | null;
  averageCorrelation: number | null;
  /** Situation fiscale de l'année en cours. */
  taxYear: { year: number; proceedsEur: number | null; estimatedTaxEur: number | null } | null;
  stablecoinReserveUsd: number;
  /** Qualité des données servant à la déclaration. */
  hasIncompleteValuation: boolean;
  hasMissingFxRates: boolean;
};

const DAY_MS = 86_400_000;

/** Une source silencieuse au-delà de ce délai mérite d'être signalée. */
export const STALE_SOURCE_DAYS = 7;

/** Seuil au-delà duquel une position domine le portefeuille. */
export const CONCENTRATION_THRESHOLD = 0.5;

/** Part au-delà de laquelle une seule contrepartie devient un risque en soi. */
export const VENUE_THRESHOLD = 0.6;

/** Corrélation moyenne au-delà de laquelle la diversification est illusoire. */
export const CORRELATION_THRESHOLD = 0.85;

/** Seuil légal de déclaration, en euros. */
export const DECLARATION_THRESHOLD_EUR = 305;

const SEVERITY_ORDER: Record<SignalSeverity, number> = { critical: 0, warning: 1, info: 2 };

const formatEur = (value: number) =>
  value.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const formatUsd = (value: number) =>
  value.toLocaleString("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/**
 * Évalue toutes les conditions et retourne les signaux actifs, les plus
 * graves en tête.
 */
export function computeSignals(input: SignalInput): Signal[] {
  const signals: Signal[] = [];

  // ── Sources ──────────────────────────────────────────────────
  for (const integration of input.integrations) {
    if (integration.syncStatus === "error") {
      signals.push({
        id: `source-error-${integration.id}`,
        severity: "critical",
        title: `${integration.label} est en erreur`,
        detail:
          "La dernière synchronisation a échoué : vos chiffres n'intègrent pas les opérations récentes de cette source.",
        href: "/dashboard/accounts",
      });
      continue;
    }

    // Une source en pause ou issue d'un fichier n'a pas vocation à se mettre
    // à jour : son silence n'est pas une anomalie.
    if (!integration.syncEnabled || integration.isFileImport) continue;
    if (integration.syncStatus === "syncing") continue;

    const age = integration.lastSyncedAt === null ? null : input.now - integration.lastSyncedAt;
    if (age === null || age > STALE_SOURCE_DAYS * DAY_MS) {
      const days = age === null ? null : Math.floor(age / DAY_MS);
      signals.push({
        id: `source-stale-${integration.id}`,
        severity: "warning",
        title: `${integration.label} n'est plus à jour`,
        detail:
          days === null
            ? "Cette source n'a jamais été synchronisée."
            : `Aucune synchronisation réussie depuis ${days} jours.`,
        href: "/dashboard/accounts",
      });
    }
  }

  // ── Concentration ────────────────────────────────────────────
  if (input.topAsset && input.topAsset.weight > CONCENTRATION_THRESHOLD) {
    const plural = input.effectiveCount >= 2 ? "s" : "";
    signals.push({
      id: "concentration-asset",
      severity: "warning",
      title: `${input.topAsset.key} pèse ${(input.topAsset.weight * 100).toFixed(0)} % du portefeuille`,
      detail: `Votre portefeuille se comporte comme ${input.effectiveCount.toFixed(1)} position${plural} effective${plural}, quel que soit le nombre de lignes détenues.`,
      href: "/dashboard/performance",
    });
  }

  if (input.topVenue && input.topVenue.weight > VENUE_THRESHOLD) {
    signals.push({
      id: "concentration-venue",
      severity: "warning",
      title: `${(input.topVenue.weight * 100).toFixed(0)} % de vos actifs sont sur ${input.topVenue.key}`,
      detail:
        "Une défaillance de cette seule contrepartie emporterait la majorité de votre portefeuille.",
      href: "/dashboard/performance",
    });
  }

  if (input.averageCorrelation !== null && input.averageCorrelation > CORRELATION_THRESHOLD) {
    signals.push({
      id: "correlation",
      severity: "info",
      title: "Vos positions évoluent ensemble",
      detail: `Corrélation moyenne de ${input.averageCorrelation.toFixed(2)} : une baisse de marché les emportera toutes.`,
      href: "/dashboard/performance",
    });
  }

  // ── Fiscalité ────────────────────────────────────────────────
  const tax = input.taxYear;
  if (tax) {
    if (
      tax.estimatedTaxEur !== null &&
      tax.estimatedTaxEur > 0 &&
      input.stablecoinReserveUsd < tax.estimatedTaxEur
    ) {
      signals.push({
        id: "tax-provision",
        severity: "warning",
        title: `${formatEur(tax.estimatedTaxEur)} d'impôt à provisionner`,
        detail: `Votre réserve mobilisable (${formatUsd(input.stablecoinReserveUsd)}) ne couvre pas l'imposition due au titre de ${tax.year}.`,
        href: "/dashboard/tax-report",
      });
    }

    // Approcher le seuil sans l'atteindre change l'obligation déclarative :
    // c'est maintenant qu'il faut le savoir, pas en mai.
    if (
      tax.proceedsEur !== null &&
      tax.proceedsEur > DECLARATION_THRESHOLD_EUR * 0.8 &&
      tax.proceedsEur < DECLARATION_THRESHOLD_EUR
    ) {
      signals.push({
        id: "tax-threshold",
        severity: "info",
        title: "Vous approchez le seuil de déclaration",
        detail: `${formatEur(tax.proceedsEur)} de cessions en ${tax.year}, pour un seuil d'exonération à ${DECLARATION_THRESHOLD_EUR} €.`,
        href: "/dashboard/tax-report",
      });
    }
  }

  // ── Qualité des données déclaratives ─────────────────────────
  if (input.hasMissingFxRates) {
    signals.push({
      id: "fx-missing",
      severity: "warning",
      title: "Conversion en euros indisponible",
      detail:
        "Aucun taux de change n'est en base : les montants fiscaux restent en dollars, alors que la déclaration se fait en euros.",
      href: "/dashboard/tax-report",
    });
  }

  if (input.hasIncompleteValuation) {
    signals.push({
      id: "valuation-incomplete",
      severity: "warning",
      title: "Historique de cours incomplet",
      detail:
        "Certaines cessions ont été valorisées au prix de revient faute de cours connu : la plus-value déclarée est minorée.",
      href: "/dashboard/tax-report",
    });
  }

  return signals.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
