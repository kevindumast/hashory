/**
 * Moteur d'analyse de performance et de risque.
 *
 * Toutes les fonctions sont pures et sans dépendance : elles se testent
 * isolément (voir `lib/performance.test.ts`) et peuvent tourner aussi bien
 * côté client que dans une action Convex.
 *
 * Deux partis pris de méthode structurent ce fichier.
 *
 * 1. **On sépare la performance du portefeuille de celle de l'investisseur.**
 *    Le rendement pondéré par le temps (TWR) neutralise les apports et
 *    retraits : il mesure la qualité des décisions d'allocation. Le rendement
 *    pondéré par les flux (TRI) intègre au contraire le calendrier des
 *    versements : il mesure ce que l'argent a réellement rapporté. Les deux
 *    répondent à des questions différentes et divergent fortement en DCA.
 *
 * 2. **Le risque se mesure sur l'indice de croissance, jamais sur la valeur
 *    brute.** Un versement fait mécaniquement remonter la valeur du
 *    portefeuille et effacerait une baisse qui n'a pourtant jamais été
 *    récupérée. Calculer une perte maximale sur la valeur brute la
 *    sous-estime systématiquement.
 */

/** Nombre de jours utilisé pour annualiser : le marché crypto ne ferme pas. */
export const TRADING_DAYS_PER_YEAR = 365;

/** Un point de valorisation quotidienne du portefeuille. */
export type ValuePoint = {
  /** Horodatage du jour, en millisecondes UTC. */
  dayUtc: number;
  /** Valeur de marché du portefeuille ce jour-là. */
  valueUsd: number;
  /**
   * Capital net apporté depuis l'origine. Sa variation d'un jour à l'autre
   * donne le flux externe du jour.
   */
  netInvestedUsd: number;
};

export type PeriodReturn = {
  dayUtc: number;
  /** Rendement du jour, hors effet des apports et retraits. */
  value: number;
};

/* ─── Statistiques de base ─────────────────────────────────────── */

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

/**
 * Écart-type d'échantillon (dénominateur n − 1).
 *
 * On mesure la dispersion d'un échantillon de rendements observés, pas celle
 * d'une population connue : le dénominateur n sous-estimerait la volatilité.
 */
export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  let sum = 0;
  for (const value of values) {
    const diff = value - average;
    sum += diff * diff;
  }
  return Math.sqrt(sum / (values.length - 1));
}

/* ─── Rendement pondéré par le temps ───────────────────────────── */

/**
 * Rendements quotidiens neutralisés des flux externes.
 *
 * Formule : `r = (V_fin − F) / V_début − 1`, le flux étant réputé survenir en
 * fin de journée. Un jour dont la valeur de départ est nulle ou négative est
 * ignoré : le rendement n'y a pas de sens, et le conserver produirait des
 * valeurs aberrantes au démarrage du portefeuille.
 */
export function dailyReturns(points: ValuePoint[]): PeriodReturn[] {
  const returns: PeriodReturn[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous.valueUsd <= 0) continue;

    const flow = current.netInvestedUsd - previous.netInvestedUsd;
    returns.push({
      dayUtc: current.dayUtc,
      value: (current.valueUsd - flow) / previous.valueUsd - 1,
    });
  }

  return returns;
}

/** Compose une suite de rendements en performance cumulée. */
export function compound(returns: number[]): number {
  let factor = 1;
  for (const value of returns) factor *= 1 + value;
  return factor - 1;
}

/**
 * Indice de croissance base 100 : la trajectoire d'un euro investi au départ,
 * débarrassée des apports. C'est la série sur laquelle se mesure le risque.
 *
 * `startDayUtc` ajoute le point d'origine, au niveau de base. Il faut le
 * fournir : `dailyReturns` ne produit rien pour le premier jour, faute de
 * veille à comparer. Sans ce point, une baisse survenue dès le premier jour
 * deviendrait le sommet de la série et la perte serait comptée pour nulle.
 */
export function growthIndex(
  returns: PeriodReturn[],
  base = 100,
  startDayUtc?: number
): Array<{ dayUtc: number; value: number }> {
  const series: Array<{ dayUtc: number; value: number }> = [];
  if (startDayUtc !== undefined) {
    series.push({ dayUtc: startDayUtc, value: base });
  }
  let level = base;
  for (const entry of returns) {
    level *= 1 + entry.value;
    series.push({ dayUtc: entry.dayUtc, value: level });
  }
  return series;
}

/**
 * Passe un rendement cumulé en base annuelle.
 *
 * En dessous d'un an on extrapole, ce qui amplifie le bruit : la valeur reste
 * exacte mais doit être présentée comme une projection, pas comme un acquis.
 */
export function annualize(totalReturn: number, days: number): number {
  if (days <= 0) return 0;
  const growth = 1 + totalReturn;
  // Une valeur de portefeuille nulle ou négative rend la puissance indéfinie.
  if (growth <= 0) return -1;
  return Math.pow(growth, TRADING_DAYS_PER_YEAR / days) - 1;
}

/** Volatilité annualisée des rendements quotidiens. */
export function volatility(returns: number[]): number {
  return standardDeviation(returns) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/**
 * Déviation à la baisse : même calcul que la volatilité, mais les rendements
 * au-dessus du seuil comptent pour zéro. Un portefeuille qui monte
 * brutalement n'est pas risqué, il est simplement volatil à la hausse.
 */
export function downsideDeviation(returns: number[], minimumAcceptableReturn = 0): number {
  if (returns.length === 0) return 0;
  let sum = 0;
  for (const value of returns) {
    const shortfall = Math.min(0, value - minimumAcceptableReturn);
    sum += shortfall * shortfall;
  }
  return Math.sqrt(sum / returns.length) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/** Rendement excédentaire par unité de volatilité totale. */
export function sharpeRatio(annualReturn: number, annualVolatility: number, riskFreeRate = 0): number {
  if (annualVolatility === 0) return 0;
  return (annualReturn - riskFreeRate) / annualVolatility;
}

/** Rendement excédentaire par unité de volatilité baissière. */
export function sortinoRatio(annualReturn: number, annualDownside: number, riskFreeRate = 0): number {
  if (annualDownside === 0) return 0;
  return (annualReturn - riskFreeRate) / annualDownside;
}

/** Rendement annualisé rapporté à la pire perte subie. */
export function calmarRatio(annualReturn: number, maxDrawdown: number): number {
  if (maxDrawdown === 0) return 0;
  return annualReturn / Math.abs(maxDrawdown);
}

/* ─── Pertes maximales ─────────────────────────────────────────── */

export type DrawdownProfile = {
  /** Pire perte depuis un sommet, en proportion négative (−0.42 = −42 %). */
  maxDrawdown: number;
  /** Perte en cours par rapport au dernier sommet. */
  currentDrawdown: number;
  /** Jour du sommet précédant la pire perte. */
  peakDayUtc: number | null;
  /** Jour du point bas de la pire perte. */
  troughDayUtc: number | null;
  /** Jour où le sommet a été retrouvé, `null` si ce n'est pas encore le cas. */
  recoveryDayUtc: number | null;
  /** Plus longue série consécutive passée sous un sommet, en jours. */
  longestUnderwaterDays: number;
};

const DAY_MS = 86_400_000;

/**
 * Analyse des pertes sur une série. À alimenter avec l'indice de croissance,
 * pas avec la valeur brute du portefeuille.
 */
export function drawdownProfile(series: Array<{ dayUtc: number; value: number }>): DrawdownProfile {
  const empty: DrawdownProfile = {
    maxDrawdown: 0,
    currentDrawdown: 0,
    peakDayUtc: null,
    troughDayUtc: null,
    recoveryDayUtc: null,
    longestUnderwaterDays: 0,
  };
  if (series.length === 0) return empty;

  let peakValue = series[0].value;
  let peakDay = series[0].dayUtc;

  let maxDrawdown = 0;
  let worstPeakDay: number | null = null;
  let worstTroughDay: number | null = null;
  let recoveryDay: number | null = null;

  let underwaterSince: number | null = null;
  let longestUnderwaterDays = 0;

  for (const point of series) {
    if (point.value >= peakValue) {
      // Sommet retrouvé : on clôt l'épisode de baisse en cours.
      if (underwaterSince !== null) {
        longestUnderwaterDays = Math.max(
          longestUnderwaterDays,
          Math.round((point.dayUtc - underwaterSince) / DAY_MS)
        );
        // Cette remontée solde-t-elle la pire perte observée ?
        if (worstTroughDay !== null && recoveryDay === null && point.dayUtc > worstTroughDay) {
          recoveryDay = point.dayUtc;
        }
        underwaterSince = null;
      }
      peakValue = point.value;
      peakDay = point.dayUtc;
      continue;
    }

    if (underwaterSince === null) underwaterSince = peakDay;

    const drawdown = peakValue === 0 ? 0 : (point.value - peakValue) / peakValue;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
      worstPeakDay = peakDay;
      worstTroughDay = point.dayUtc;
      recoveryDay = null;
    }
  }

  // Épisode toujours en cours à la fin de la série.
  const last = series[series.length - 1];
  if (underwaterSince !== null) {
    longestUnderwaterDays = Math.max(
      longestUnderwaterDays,
      Math.round((last.dayUtc - underwaterSince) / DAY_MS)
    );
  }

  const currentDrawdown = peakValue === 0 ? 0 : Math.min(0, (last.value - peakValue) / peakValue);

  return {
    maxDrawdown,
    currentDrawdown,
    peakDayUtc: worstPeakDay,
    troughDayUtc: worstTroughDay,
    recoveryDayUtc: recoveryDay,
    longestUnderwaterDays,
  };
}

/* ─── Rendement pondéré par les flux (TRI) ─────────────────────── */

export type CashFlow = {
  dayUtc: number;
  /** Négatif pour un apport, positif pour un retrait ou la valeur finale. */
  amountUsd: number;
};

/** Valeur actuelle nette d'une suite de flux, à un taux annuel donné. */
function netPresentValue(flows: CashFlow[], annualRate: number): number {
  const origin = flows[0].dayUtc;
  let total = 0;
  for (const flow of flows) {
    const years = (flow.dayUtc - origin) / (DAY_MS * TRADING_DAYS_PER_YEAR);
    total += flow.amountUsd / Math.pow(1 + annualRate, years);
  }
  return total;
}

/**
 * Taux de rendement interne d'une suite de flux datés (TRI, ou XIRR).
 *
 * Résolu par dichotomie plutôt que par Newton-Raphson : c'est un peu plus
 * lent, mais la méthode converge toujours sur un intervalle encadrant, là où
 * Newton diverge sur les profils de flux irréguliers d'un DCA.
 *
 * Retourne `null` si les flux ne changent jamais de signe — sans capital
 * engagé puis récupéré, le taux n'est pas défini.
 */
export function moneyWeightedReturn(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;

  const sorted = [...flows].sort((a, b) => a.dayUtc - b.dayUtc);
  const hasPositive = sorted.some((flow) => flow.amountUsd > 0);
  const hasNegative = sorted.some((flow) => flow.amountUsd < 0);
  if (!hasPositive || !hasNegative) return null;

  // Bornes : une perte quasi totale d'un côté, un x1000 annuel de l'autre.
  let low = -0.9999;
  let high = 10;

  let npvLow = netPresentValue(sorted, low);
  let npvHigh = netPresentValue(sorted, high);

  // Élargit la borne haute si la solution sort de l'intervalle initial.
  let expansions = 0;
  while (npvLow * npvHigh > 0 && expansions < 12) {
    high *= 3;
    npvHigh = netPresentValue(sorted, high);
    expansions += 1;
  }
  if (npvLow * npvHigh > 0) return null;

  for (let iteration = 0; iteration < 200; iteration += 1) {
    const mid = (low + high) / 2;
    const npvMid = netPresentValue(sorted, mid);
    if (Math.abs(npvMid) < 1e-9) return mid;
    if (npvLow * npvMid <= 0) {
      high = mid;
    } else {
      low = mid;
      npvLow = npvMid;
    }
  }

  return (low + high) / 2;
}

/**
 * Construit les flux datés à partir de la série de valorisation : chaque
 * variation du capital net apporté devient un flux, et la valeur finale du
 * portefeuille clôt la série comme s'il était liquidé.
 */
export function cashFlowsFromPoints(points: ValuePoint[]): CashFlow[] {
  if (points.length === 0) return [];

  const flows: CashFlow[] = [];
  const first = points[0];

  // Le capital déjà présent au premier point est un apport initial.
  if (first.netInvestedUsd > 0) {
    flows.push({ dayUtc: first.dayUtc, amountUsd: -first.netInvestedUsd });
  }

  for (let index = 1; index < points.length; index += 1) {
    const delta = points[index].netInvestedUsd - points[index - 1].netInvestedUsd;
    if (delta !== 0) {
      flows.push({ dayUtc: points[index].dayUtc, amountUsd: -delta });
    }
  }

  const last = points[points.length - 1];
  flows.push({ dayUtc: last.dayUtc, amountUsd: last.valueUsd });

  return flows;
}

/* ─── Comparaison à une référence ──────────────────────────────── */

/** Covariance d'échantillon entre deux séries de même longueur. */
export function covariance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 2) return 0;
  const meanA = mean(a);
  const meanB = mean(b);
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) {
    sum += (a[index] - meanA) * (b[index] - meanB);
  }
  return sum / (a.length - 1);
}

/** Coefficient de corrélation de Pearson, entre −1 et 1. */
export function correlation(a: number[], b: number[]): number {
  const deviationA = standardDeviation(a);
  const deviationB = standardDeviation(b);
  if (deviationA === 0 || deviationB === 0) return 0;
  return covariance(a, b) / (deviationA * deviationB);
}

/**
 * Sensibilité du portefeuille à sa référence. Un bêta de 1,4 face à Bitcoin
 * signifie qu'une baisse de 10 % de BTC se traduit en moyenne par une baisse
 * de 14 % du portefeuille.
 */
export function beta(portfolioReturns: number[], benchmarkReturns: number[]): number {
  const benchmarkVariance = covariance(benchmarkReturns, benchmarkReturns);
  if (benchmarkVariance === 0) return 0;
  return covariance(portfolioReturns, benchmarkReturns) / benchmarkVariance;
}

/**
 * Alpha de Jensen, annualisé : la part du rendement qui n'est pas expliquée
 * par l'exposition à la référence. C'est la seule mesure qui distingue la
 * compétence de la simple prise de risque directionnel.
 */
export function jensenAlpha(
  annualPortfolioReturn: number,
  annualBenchmarkReturn: number,
  portfolioBeta: number,
  riskFreeRate = 0
): number {
  return (
    annualPortfolioReturn - (riskFreeRate + portfolioBeta * (annualBenchmarkReturn - riskFreeRate))
  );
}

/* ─── Concentration ────────────────────────────────────────────── */

export type Weighted = { key: string; valueUsd: number };

export type ConcentrationProfile = {
  /**
   * Indice de Herfindahl-Hirschman, entre 0 et 1 : somme des carrés des
   * poids. 1 signifie une position unique.
   */
  hhi: number;
  /**
   * Nombre effectif de positions (1 / HHI). Un portefeuille de vingt lignes
   * dont une pèse 80 % a un nombre effectif proche de 1,5 : c'est le chiffre
   * qui dit la vraie diversification, pas le nombre de lignes.
   */
  effectiveCount: number;
  /** Poids de la première position. */
  topWeight: number;
  /** Poids cumulé des trois premières. */
  top3Weight: number;
  /** Positions triées par poids décroissant. */
  weights: Array<{ key: string; weight: number; valueUsd: number }>;
};

export function concentration(entries: Weighted[]): ConcentrationProfile {
  const positive = entries.filter((entry) => entry.valueUsd > 0);
  const total = positive.reduce((sum, entry) => sum + entry.valueUsd, 0);

  if (total <= 0) {
    return { hhi: 0, effectiveCount: 0, topWeight: 0, top3Weight: 0, weights: [] };
  }

  const weights = positive
    .map((entry) => ({ key: entry.key, weight: entry.valueUsd / total, valueUsd: entry.valueUsd }))
    .sort((a, b) => b.weight - a.weight);

  const hhi = weights.reduce((sum, entry) => sum + entry.weight * entry.weight, 0);

  return {
    hhi,
    effectiveCount: hhi > 0 ? 1 / hhi : 0,
    topWeight: weights[0]?.weight ?? 0,
    top3Weight: weights.slice(0, 3).reduce((sum, entry) => sum + entry.weight, 0),
    weights,
  };
}

/**
 * Perte encourue si une position chute d'un pourcentage donné, tout le reste
 * étant inchangé. Répond à « que se passe-t-il si Bitcoin perd 30 % ? ».
 */
export function shockImpact(entries: Weighted[], key: string, shock: number): number {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.valueUsd), 0);
  if (total <= 0) return 0;
  const target = entries.find((entry) => entry.key === key);
  if (!target) return 0;
  return (Math.max(0, target.valueUsd) * shock) / total;
}

/* ─── Attribution de performance ───────────────────────────────── */

export type PositionResult = {
  key: string;
  /** Prix de revient des quantités encore détenues. */
  costBasisUsd: number;
  /** Valeur de marché actuelle de la ligne. */
  valueUsd: number;
  /** Résultat déjà encaissé sur cette ligne. */
  realizedPnlUsd: number;
};

export type AttributionRow = {
  key: string;
  /** Poids de la ligne dans le portefeuille actuel. */
  weight: number;
  /** Résultat total de la ligne : latent plus réalisé. */
  pnlUsd: number;
  /**
   * Contribution au rendement du portefeuille : ce que cette seule ligne a
   * ajouté à la performance d'ensemble.
   */
  contribution: number;
  /** Part du résultat total imputable à cette ligne, positive ou négative. */
  shareOfResult: number;
  /** Rendement propre de la ligne, rapporté à son propre prix de revient. */
  ownReturn: number;
};

export type AttributionReport = {
  rows: AttributionRow[];
  totalPnlUsd: number;
  totalCostBasisUsd: number;
  totalValueUsd: number;
};

/**
 * Décompose le résultat du portefeuille ligne par ligne.
 *
 * L'intérêt n'est pas de classer les positions par gain — c'est de confronter
 * leur **poids** à leur **contribution**. Une ligne qui pèse 5 % du
 * portefeuille et produit 60 % du résultat dit une chose ; l'inverse en dit
 * une autre, plus inconfortable.
 */
export function attribution(positions: PositionResult[]): AttributionReport {
  const totalCostBasisUsd = positions.reduce((sum, entry) => sum + Math.max(0, entry.costBasisUsd), 0);
  const totalValueUsd = positions.reduce((sum, entry) => sum + Math.max(0, entry.valueUsd), 0);

  const withPnl = positions.map((entry) => ({
    entry,
    pnlUsd: entry.valueUsd - entry.costBasisUsd + entry.realizedPnlUsd,
  }));

  const totalPnlUsd = withPnl.reduce((sum, item) => sum + item.pnlUsd, 0);

  const rows = withPnl
    .map(({ entry, pnlUsd }) => ({
      key: entry.key,
      weight: totalValueUsd > 0 ? Math.max(0, entry.valueUsd) / totalValueUsd : 0,
      pnlUsd,
      contribution: totalCostBasisUsd > 0 ? pnlUsd / totalCostBasisUsd : 0,
      // Le signe se perd si l'on rapporte à un total proche de zéro : on
      // préfère alors n'attribuer aucune part plutôt qu'un ratio explosif.
      shareOfResult: Math.abs(totalPnlUsd) > 1e-9 ? pnlUsd / totalPnlUsd : 0,
      ownReturn: entry.costBasisUsd > 0 ? pnlUsd / entry.costBasisUsd : 0,
    }))
    .sort((a, b) => b.pnlUsd - a.pnlUsd);

  return { rows, totalPnlUsd, totalCostBasisUsd, totalValueUsd };
}

/* ─── Corrélations ─────────────────────────────────────────────── */

export type CorrelationMatrix = {
  keys: string[];
  /** `values[i][j]` = corrélation entre `keys[i]` et `keys[j]`. */
  values: number[][];
  /** Moyenne des corrélations deux à deux, hors diagonale. */
  averagePairwise: number;
  /** Nombre d'observations réellement communes à toutes les séries. */
  observations: number;
};

/**
 * Matrice de corrélation entre séries de rendements.
 *
 * La plupart des portefeuilles crypto affichent des corrélations proches de
 * 0,9 : détenir dix jetons qui montent et descendent ensemble n'est pas de la
 * diversification, c'est une seule position en dix exemplaires. La moyenne
 * hors diagonale résume cette réalité en un chiffre.
 *
 * Les séries sont alignées sur leur longueur commune, en conservant les
 * observations les plus récentes — un actif détenu depuis peu ne doit pas
 * tronquer l'historique des autres au-delà du nécessaire.
 */
export function correlationMatrix(returnsByKey: Record<string, number[]>): CorrelationMatrix {
  const keys = Object.keys(returnsByKey).filter((key) => returnsByKey[key].length >= 2);

  if (keys.length === 0) {
    return { keys: [], values: [], averagePairwise: 0, observations: 0 };
  }

  const observations = Math.min(...keys.map((key) => returnsByKey[key].length));
  const aligned = keys.map((key) => returnsByKey[key].slice(-observations));

  const values = aligned.map((rowSeries) =>
    aligned.map((columnSeries) => correlation(rowSeries, columnSeries))
  );

  let sum = 0;
  let pairs = 0;
  for (let row = 0; row < keys.length; row += 1) {
    for (let column = row + 1; column < keys.length; column += 1) {
      sum += values[row][column];
      pairs += 1;
    }
  }

  return {
    keys,
    values,
    averagePairwise: pairs > 0 ? sum / pairs : 0,
    observations,
  };
}
