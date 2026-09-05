/**
 * Fiscalité française des actifs numériques — article 150 VH bis du CGI.
 *
 * La particularité française est qu'une cession ne s'impose pas sur le gain
 * de l'actif vendu, mais au prorata du portefeuille entier :
 *
 *     plus-value = prix de cession − prix total d'acquisition ×
 *                  (prix de cession / valeur globale du portefeuille)
 *
 * Deux conséquences que ce module rend calculables.
 *
 * 1. La fiscalité d'une vente dépend de l'état de **tout** le portefeuille au
 *    moment où elle a lieu, pas seulement de la ligne vendue. Vendre la même
 *    position à deux dates différentes ne coûte pas la même chose.
 * 2. La formule s'inverse analytiquement : on peut calculer exactement
 *    combien vendre pour encaisser une somme nette voulue. C'est la question
 *    qu'on se pose réellement, et elle n'a pas besoin d'être approchée.
 *
 * Ce module ne remplace pas un conseil fiscal ; il donne le calcul exact du
 * texte, à charge pour l'utilisateur de faire valider sa situation.
 */

/** Prélèvement forfaitaire unique : 12,8 % d'impôt + 17,2 % de prélèvements sociaux. */
export const PFU_RATE = 0.3;

/**
 * Seuil annuel d'exonération : en deçà de 305 € de cessions sur l'année,
 * les plus-values ne sont pas imposées.
 */
export const ANNUAL_EXEMPTION_EUR = 305;

export type PortfolioTaxState = {
  /** Valeur globale du portefeuille au moment de la cession. */
  portfolioValue: number;
  /**
   * Prix total d'acquisition, net des réintégrations déjà opérées lors des
   * cessions précédentes.
   */
  totalAcquisitionCost: number;
};

export type SaleTaxBreakdown = {
  /** Montant de la cession. */
  proceeds: number;
  /** Fraction du prix d'acquisition imputée à cette cession. */
  costBasis: number;
  /** Plus-value imposable — négative en cas de moins-value. */
  gain: number;
  /** Impôt dû au taux forfaitaire. Une moins-value ne génère pas d'impôt. */
  tax: number;
  /** Ce qui reste après impôt. */
  net: number;
  /** Taux d'imposition effectif rapporté au montant cédé. */
  effectiveRate: number;
  /** Prix total d'acquisition restant après la cession. */
  remainingAcquisitionCost: number;
};

/**
 * Fiscalité d'une cession donnée.
 *
 * `proceeds` est borné à la valeur du portefeuille : on ne peut pas céder
 * plus que ce que l'on détient.
 */
export function taxOnSale(
  proceeds: number,
  state: PortfolioTaxState,
  rate = PFU_RATE
): SaleTaxBreakdown {
  const { portfolioValue, totalAcquisitionCost } = state;

  const empty: SaleTaxBreakdown = {
    proceeds: 0,
    costBasis: 0,
    gain: 0,
    tax: 0,
    net: 0,
    effectiveRate: 0,
    remainingAcquisitionCost: Math.max(0, totalAcquisitionCost),
  };

  if (proceeds <= 0 || portfolioValue <= 0) return empty;

  const cappedProceeds = Math.min(proceeds, portfolioValue);
  const costBasis = (totalAcquisitionCost * cappedProceeds) / portfolioValue;
  const gain = cappedProceeds - costBasis;
  // Une moins-value ne crée pas de créance d'impôt : elle s'impute sur les
  // autres plus-values de l'année, ce qui relève de la déclaration annuelle.
  const tax = gain > 0 ? gain * rate : 0;

  return {
    proceeds: cappedProceeds,
    costBasis,
    gain,
    tax,
    net: cappedProceeds - tax,
    effectiveRate: cappedProceeds > 0 ? tax / cappedProceeds : 0,
    remainingAcquisitionCost: Math.max(0, totalAcquisitionCost - costBasis),
  };
}

/**
 * Montant à céder pour encaisser une somme nette donnée.
 *
 * En posant `k = prix d'acquisition / valeur du portefeuille`, l'impôt vaut
 * `taux × P × (1 − k)`, donc :
 *
 *     net = P × (1 − taux × (1 − k))   →   P = net / (1 − taux × (1 − k))
 *
 * La solution est exacte, pas approchée. Elle retourne `null` lorsque la
 * cession nécessaire dépasse le portefeuille : l'objectif est alors hors
 * d'atteinte sans apport extérieur.
 */
export function proceedsForNetTarget(
  netTarget: number,
  state: PortfolioTaxState,
  rate = PFU_RATE
): SaleTaxBreakdown | null {
  const { portfolioValue, totalAcquisitionCost } = state;
  if (netTarget <= 0 || portfolioValue <= 0) return null;

  const costRatio = totalAcquisitionCost / portfolioValue;

  // Portefeuille en moins-value latente : aucune imposition, on cède le
  // montant voulu à l'euro près.
  const taxableShare = Math.max(0, 1 - costRatio);
  const divisor = 1 - rate * taxableShare;

  // Un diviseur nul ou négatif supposerait un taux d'imposition de 100 %.
  if (divisor <= 0) return null;

  const proceeds = netTarget / divisor;
  if (proceeds > portfolioValue) return null;

  return taxOnSale(proceeds, state, rate);
}

/**
 * Part de la cession qui n'est que la récupération du capital investi.
 * Utile pour distinguer « je récupère ma mise » de « je réalise un gain ».
 */
export function capitalShareOfSale(state: PortfolioTaxState): number {
  if (state.portfolioValue <= 0) return 0;
  return Math.min(1, state.totalAcquisitionCost / state.portfolioValue);
}

/**
 * Une cession annuelle inférieure au seuil est exonérée. Le seuil porte sur
 * le **total des cessions de l'année**, pas sur la plus-value.
 */
export function isBelowAnnualExemption(totalAnnualProceeds: number, threshold = ANNUAL_EXEMPTION_EUR): boolean {
  return totalAnnualProceeds < threshold;
}

/**
 * Compare la fiscalité d'une même cession à deux états de portefeuille.
 *
 * Sert à montrer l'effet de l'assiette proportionnelle : à montant cédé
 * identique, l'impôt change avec la valeur globale du portefeuille.
 */
export function compareStates(
  proceeds: number,
  before: PortfolioTaxState,
  after: PortfolioTaxState,
  rate = PFU_RATE
): { before: SaleTaxBreakdown; after: SaleTaxBreakdown; taxDelta: number } {
  const first = taxOnSale(proceeds, before, rate);
  const second = taxOnSale(proceeds, after, rate);
  return { before: first, after: second, taxDelta: second.tax - first.tax };
}

/* ─── Chaîne des cessions ──────────────────────────────────────── */

export type TaxEvent = {
  timestamp: number;
  asset: string;
  /** Positif pour une acquisition, négatif pour une sortie. */
  qtyDelta: number;
  /** Contre-valeur en dollars de l'opération. */
  valueUsd: number;
  /** Vrai seulement pour une cession contre monnaie ayant cours légal. */
  isTaxableSell: boolean;
  source: "trade" | "fiat" | "convert";
};

/**
 * Fournit le cours d'un actif à une date. Retourne `null` lorsque
 * l'historique ne couvre pas ce couple : l'appelant décide alors du repli.
 */
export type PriceResolver = (asset: string, timestamp: number) => number | null;

export type Cession = {
  date: number;
  asset: string;
  quantity: number;
  proceedsUsd: number;
  costBasisUsd: number;
  gainLossUsd: number;
  source: TaxEvent["source"];
  /** Valeur globale du portefeuille retenue comme dénominateur. */
  portfolioValueUsd: number;
  /**
   * Part de cette valeur réellement établie au cours du marché. Sous 1, le
   * reste a été replié sur le prix de revient, faute d'historique — la
   * plus-value calculée est alors un plancher.
   */
  valuationCoverage: number;
};

export type CessionChain = {
  cessions: Cession[];
  /** Prix total d'acquisition restant à la fin de la chaîne. */
  finalAcquisitionCost: number;
  /** Vrai si au moins une cession a dû se replier sur le prix de revient. */
  hasIncompleteValuation: boolean;
};

/**
 * Déroule la chaîne des cessions et calcule la plus-value de chacune.
 *
 * La valeur globale du portefeuille est établie **au cours du marché** à la
 * date de la cession, comme l'exige le texte. L'actif cédé est valorisé au
 * prix implicite de sa propre vente, qui est plus fidèle que le cours de
 * clôture du jour.
 *
 * Lorsque l'historique ne couvre pas un actif détenu, sa ligne est repliée
 * sur son prix de revient. Ce repli minore la valeur globale, donc minore la
 * plus-value : le résultat reste un plancher, jamais un montant surestimé.
 * `valuationCoverage` dit dans quelle mesure ce repli a joué.
 */
export function computeCessionChain(
  events: TaxEvent[],
  priceAt: PriceResolver
): CessionChain {
  const ordered = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const holdings = new Map<string, { qty: number; avgCostUsd: number }>();
  let totalAcquisitionCost = 0;

  const cessions: Cession[] = [];
  let hasIncompleteValuation = false;

  for (const event of ordered) {
    const previous = holdings.get(event.asset) ?? { qty: 0, avgCostUsd: 0 };

    if (event.qtyDelta > 0) {
      const newQty = previous.qty + event.qtyDelta;
      holdings.set(event.asset, {
        qty: newQty,
        avgCostUsd: newQty > 0 ? (previous.qty * previous.avgCostUsd + event.valueUsd) / newQty : 0,
      });
      totalAcquisitionCost += event.valueUsd;
      continue;
    }

    if (event.qtyDelta === 0) continue;

    const soldQty = Math.min(Math.abs(event.qtyDelta), previous.qty);

    if (event.isTaxableSell && soldQty > 0) {
      const proceeds = event.valueUsd;

      // Valeur globale du portefeuille avant la cession, au cours du marché.
      let portfolioValueUsd = 0;
      let coveredValueUsd = 0;

      for (const [symbol, state] of holdings) {
        if (state.qty <= 0) continue;

        // L'actif cédé se valorise au prix implicite de sa propre vente.
        const impliedPrice =
          symbol === event.asset && soldQty > 0 ? proceeds / soldQty : null;
        const marketPrice = impliedPrice ?? priceAt(symbol, event.timestamp);

        if (marketPrice !== null && marketPrice > 0) {
          const line = state.qty * marketPrice;
          portfolioValueUsd += line;
          coveredValueUsd += line;
        } else {
          // Repli documenté : minore la valeur globale, donc la plus-value.
          portfolioValueUsd += state.qty * state.avgCostUsd;
          hasIncompleteValuation = true;
        }
      }

      const valuationCoverage = portfolioValueUsd > 0 ? coveredValueUsd / portfolioValueUsd : 0;

      // prix de revient = prix total d'acquisition × cession / valeur globale
      const costBasisUsd =
        portfolioValueUsd > 0
          ? (totalAcquisitionCost * proceeds) / portfolioValueUsd
          : soldQty * previous.avgCostUsd;

      cessions.push({
        date: event.timestamp,
        asset: event.asset,
        quantity: soldQty,
        proceedsUsd: proceeds,
        costBasisUsd,
        gainLossUsd: proceeds - costBasisUsd,
        source: event.source,
        portfolioValueUsd,
        valuationCoverage,
      });

      totalAcquisitionCost = Math.max(0, totalAcquisitionCost - costBasisUsd);
    } else if (soldQty > 0) {
      // Sortie non imposable (crypto contre crypto) : le prix d'acquisition
      // suit l'actif, il n'est pas réintégré.
      totalAcquisitionCost = Math.max(0, totalAcquisitionCost - soldQty * previous.avgCostUsd);
    }

    holdings.set(event.asset, {
      qty: Math.max(0, previous.qty - soldQty),
      avgCostUsd: previous.avgCostUsd,
    });
  }

  return { cessions, finalAcquisitionCost: totalAcquisitionCost, hasIncompleteValuation };
}
