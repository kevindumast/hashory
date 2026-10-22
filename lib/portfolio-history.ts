/**
 * Historique de valeur, de performance et de positions du portefeuille.
 *
 * La performance se mesure comme le fait un gérant : en **rendement pondéré
 * par le temps** (time-weighted return), chaîné jour par jour. Chaque jour,
 *
 *     rendement = valeur de fin de journée / (valeur de la veille + flux du jour) − 1
 *
 * puis les rendements quotidiens se composent. Les apports et retraits ne
 * comptent donc jamais comme des gains ou des pertes : seul le marché fait
 * varier l'indice. C'est aussi ce qui rend la comparaison au BTC honnête.
 *
 * Qu'est-ce qu'un flux ? Ce qui franchit la frontière du périmètre mesuré :
 *
 * - **portefeuille entier** : dépôts et retraits de fiat, crypto venue d'un
 *   compte non suivi ou partie vers lui. Un transfert entre deux comptes
 *   suivis n'est pas un flux ; ses frais réseau, si, une perte.
 * - **un seul compte** : tout ce qui y entre ou en sort, transferts
 *   internes compris, puisqu'ils franchissent la frontière de ce compte.
 *
 * Acheter du BTC avec des USDC déjà présents n'est jamais un flux : la
 * valeur change de forme, pas de propriétaire.
 *
 * Le même déroulé tient les **positions** au prix de revient moyen pondéré :
 * ce qui entre de l'extérieur entre à sa valeur de marché, un échange
 * réalise l'écart entre ce qu'il rapporte et le coût de ce qu'il cède, les
 * frais sont une perte réalisée, un transfert interne déplace les jetons
 * avec leur coût. D'où l'identité, vérifiée chaque jour par les tests :
 *
 *     résultat réalisé + plus-value latente = valeur − apports nets
 *
 * Un solde qui deviendrait négatif — l'historique ne dit pas d'où viennent
 * des jetons vendus — est complété par un apport implicite, au cours du
 * jour. Sans cela, une vente de jetons « sortis de nulle part » apparaissait
 * comme un gain pur.
 */

import { isFiat, type ExchangeOperation, type Operation, type TransferOperation } from "./ledger";
import { isCashLike, startOfUtcDay, type PriceBook } from "./valuation";

const DAY_MS = 86_400_000;
/** En deçà d'un dollar engagé, un rendement n'a pas de sens. */
const MIN_CAPITAL_USD = 1;
const DUST = 1e-12;

export type HistoryPoint = {
  dayUtc: number;
  /** Valeur de fin de journée, en dollars. */
  valueUsd: number;
  /** Apports (+) et retraits (−) externes du jour. */
  flowUsd: number;
  /** Cumul des apports nets depuis le début. */
  netContributionsUsd: number;
  /** Indice de performance, 1 au départ : 1,25 = +25 %. */
  twrIndex: number;
  /** Prix de revient des positions détenues en fin de journée. */
  costBasisUsd: number;
  /** Résultat réalisé cumulé. */
  realizedPnlUsd: number;
};

export type Position = {
  asset: string;
  quantity: number;
  /** Prix de revient de la quantité détenue. */
  costUsd: number;
  /** Résultat réalisé sur cet actif depuis le début. */
  realizedUsd: number;
};

export type PortfolioHistory = {
  points: HistoryPoint[];
  /** Positions en fin d'historique, tous comptes du périmètre confondus. */
  positions: Position[];
  /** Soldes en fin d'historique, compte par compte. */
  balances: { account: string; asset: string; quantity: number }[];
  /** Actifs détenus à un moment sans aucun cours pour les valoriser. */
  unpricedAssets: string[];
  /** Total des apports implicites (soldes négatifs comblés), en dollars. */
  implicitInflowsUsd: number;
};

/**
 * Contre-valeur en dollars d'un échange. Ce qui est versé en cash fait foi,
 * puis ce qui est reçu en cash, puis le cours de l'actif reçu ou cédé.
 */
export function exchangeValueUsd(operation: ExchangeOperation, book: PriceBook): number {
  const { given, received, timestamp } = operation;
  const valued = (asset: string, quantity: number) => {
    const price = book.usd(asset, timestamp);
    return price === null ? null : price * quantity;
  };
  if (isCashLike(given.asset)) {
    const value = valued(given.asset, given.quantity);
    if (value !== null) return value;
  }
  if (isCashLike(received.asset)) {
    const value = valued(received.asset, received.quantity);
    if (value !== null) return value;
  }
  return valued(received.asset, received.quantity) ?? valued(given.asset, given.quantity) ?? 0;
}

/**
 * Déroule les opérations jour par jour et construit la série de valeur,
 * l'indice de performance et les positions, pour tout le portefeuille ou
 * pour un compte.
 */
export function buildPortfolioHistory(
  operations: Operation[],
  book: PriceBook,
  options: { account?: string; todayUtc: number }
): PortfolioHistory {
  const scoped = options.account
    ? operations.filter((operation) => operation.account === options.account)
    : operations;
  if (scoped.length === 0) {
    return { points: [], positions: [], balances: [], unpricedAssets: [], implicitInflowsUsd: 0 };
  }

  const ordered = [...scoped].sort((a, b) => a.timestamp - b.timestamp);
  // Soldes par compte et par actif, même pour le portefeuille entier : un
  // compte ne peut pas vendre les jetons d'un autre. Mutualiser les soldes
  // laissait le BTC d'un wallet « couvrir » la vente d'un exchange dont
  // l'historique est incomplet.
  const holdings = new Map<string, { account: string; asset: string; quantity: number; costUsd: number }>();
  const realized = new Map<string, number>();
  const unpriced = new Set<string>();
  let implicitInflowsUsd = 0;
  let dayFlow = 0;

  const marketValue = (asset: string, quantity: number, timestamp: number): number =>
    quantity * (book.usd(asset, timestamp) ?? 0);

  const line = (account: string, asset: string) => {
    const key = `${account}\u0000${asset}`;
    const existing = holdings.get(key);
    if (existing) return existing;
    const created = { account, asset, quantity: 0, costUsd: 0 };
    holdings.set(key, created);
    return created;
  };

  const realize = (asset: string, amount: number) => {
    realized.set(asset, (realized.get(asset) ?? 0) + amount);
  };

  const credit = (account: string, asset: string, quantity: number, costUsd: number) => {
    const target = line(account, asset);
    target.quantity += quantity;
    target.costUsd += costUsd;
  };

  /**
   * Débite un solde et rend le coût de ce qui sort. Ce qui manque devient
   * d'abord un apport implicite, entré à sa valeur de marché.
   */
  const debit = (account: string, asset: string, quantity: number, timestamp: number): number => {
    const source = line(account, asset);
    const shortfall = quantity - source.quantity;
    if (shortfall > DUST) {
      const value = marketValue(asset, shortfall, timestamp);
      dayFlow += value;
      implicitInflowsUsd += value;
      source.quantity += shortfall;
      source.costUsd += value;
    }
    const share = source.quantity > DUST ? Math.min(1, quantity / source.quantity) : 0;
    const cost = source.costUsd * share;
    source.quantity = Math.max(0, source.quantity - quantity);
    source.costUsd = Math.max(0, source.costUsd - cost);
    return cost;
  };

  /** Le transfert franchit-il la frontière du périmètre mesuré ? */
  const crossesBoundary = (operation: TransferOperation) =>
    options.account !== undefined || operation.counterpart === undefined || isFiat(operation.asset);

  // Sur le portefeuille entier, un transfert interne se règle d'un bloc : le
  // retrait et le dépôt sont appliqués ensemble, au premier des deux. Sinon
  // les jetons « en transit » disparaissaient de la valeur — une fausse
  // chute un jour, une fausse hausse le lendemain, parfois à cheval sur
  // deux mois.
  const byId = new Map(ordered.map((operation) => [operation.id, operation]));
  const settled = new Set<string>();

  const apply = (operation: Operation) => {
    const { timestamp } = operation;

    if (operation.kind === "exchange") {
      const { account, given, received, fee } = operation;
      const value = exchangeValueUsd(operation, book);
      const cost = debit(account, given.asset, given.quantity, timestamp);
      realize(given.asset, value - cost);
      credit(account, received.asset, received.quantity, value);
      if (fee) realize(fee.asset, -debit(account, fee.asset, fee.quantity, timestamp));
      return;
    }

    if (!crossesBoundary(operation)) {
      const twin = byId.get(operation.counterpart!);
      const withdrawal = operation.kind === "withdrawal" ? operation : twin;
      const deposit = operation.kind === "deposit" ? operation : twin;
      if (withdrawal?.kind === "withdrawal" && deposit?.kind === "deposit") {
        const sent = withdrawal.quantity + withdrawal.fee;
        const cost = debit(withdrawal.account, withdrawal.asset, sent, timestamp);
        // Ce qui arrive emporte son coût ; les frais réseau sont une perte.
        const arrived = sent > 0 ? Math.min(1, deposit.quantity / sent) : 0;
        credit(deposit.account, deposit.asset, deposit.quantity, cost * arrived);
        realize(withdrawal.asset, -cost * (1 - arrived));
        settled.add(withdrawal.id);
        settled.add(deposit.id);
        return;
      }
    }

    if (operation.kind === "deposit") {
      // Ce qui entre de l'extérieur entre à sa valeur de marché.
      const value = marketValue(operation.asset, operation.quantity, timestamp);
      credit(operation.account, operation.asset, operation.quantity, value);
      dayFlow += value;
      return;
    }

    // Ce qui sort vers l'extérieur sort à sa valeur de marché : l'écart avec
    // son coût est réalisé. Les frais du retrait sont une perte.
    const value = marketValue(operation.asset, operation.quantity, timestamp);
    const cost = debit(operation.account, operation.asset, operation.quantity, timestamp);
    realize(operation.asset, value - cost);
    if (operation.fee > 0) {
      realize(operation.asset, -debit(operation.account, operation.asset, operation.fee, timestamp));
    }
    dayFlow -= value;
  };

  const points: HistoryPoint[] = [];
  let previousValue = 0;
  let netContributionsUsd = 0;
  let twrIndex = 1;
  let cursor = 0;

  const firstDay = startOfUtcDay(ordered[0].timestamp);
  const lastDay = Math.max(firstDay, startOfUtcDay(options.todayUtc));

  for (let day = firstDay; day <= lastDay; day += DAY_MS) {
    dayFlow = 0;

    while (cursor < ordered.length && ordered[cursor].timestamp < day + DAY_MS) {
      const operation = ordered[cursor++];
      if (!settled.has(operation.id)) apply(operation);
    }

    let value = 0;
    let costBasisUsd = 0;
    for (const holding of holdings.values()) {
      if (holding.quantity <= DUST) continue;
      costBasisUsd += holding.costUsd;
      const price = book.usd(holding.asset, day);
      if (price === null) {
        unpriced.add(holding.asset);
        continue;
      }
      value += holding.quantity * price;
    }

    const capital = previousValue + dayFlow;
    if (capital >= MIN_CAPITAL_USD) {
      twrIndex *= value / capital;
    }

    netContributionsUsd += dayFlow;
    let realizedPnlUsd = 0;
    for (const amount of realized.values()) realizedPnlUsd += amount;

    points.push({
      dayUtc: day,
      valueUsd: value,
      flowUsd: dayFlow,
      netContributionsUsd,
      twrIndex,
      costBasisUsd,
      realizedPnlUsd,
    });
    previousValue = value;
  }

  // Positions du périmètre, comptes confondus.
  const byAsset = new Map<string, Position>();
  const positionOf = (asset: string) => {
    const existing = byAsset.get(asset);
    if (existing) return existing;
    const created = { asset, quantity: 0, costUsd: 0, realizedUsd: 0 };
    byAsset.set(asset, created);
    return created;
  };
  for (const holding of holdings.values()) {
    const position = positionOf(holding.asset);
    position.quantity += holding.quantity;
    position.costUsd += holding.costUsd;
  }
  for (const [asset, amount] of realized) positionOf(asset).realizedUsd += amount;

  return {
    points,
    positions: Array.from(byAsset.values()).sort((a, b) => a.asset.localeCompare(b.asset)),
    balances: Array.from(holdings.values())
      .filter((holding) => holding.quantity > DUST)
      .map(({ account, asset, quantity }) => ({ account, asset, quantity })),
    unpricedAssets: Array.from(unpriced).sort(),
    implicitInflowsUsd,
  };
}

/**
 * Rendements mensuels, en pourcentage, tirés de l'indice : le rapport de
 * l'indice en fin de mois à celui de la fin du mois précédent. Les mois
 * hors de l'historique valent `null`.
 */
export function monthlyReturns(points: { dayUtc: number; twrIndex: number }[]): Map<number, (number | null)[]> {
  const result = new Map<number, (number | null)[]>();
  if (points.length === 0) return result;

  const ordered = [...points].sort((a, b) => a.dayUtc - b.dayUtc);
  const firstYear = new Date(ordered[0].dayUtc).getUTCFullYear();
  const lastYear = new Date(ordered[ordered.length - 1].dayUtc).getUTCFullYear();

  // Indice de clôture de chaque mois présent.
  const closing = new Map<string, number>();
  for (const point of ordered) {
    const date = new Date(point.dayUtc);
    closing.set(`${date.getUTCFullYear()}-${date.getUTCMonth()}`, point.twrIndex);
  }

  let previousClose = 1;
  for (let year = firstYear; year <= lastYear; year++) {
    const months: (number | null)[] = [];
    for (let month = 0; month < 12; month++) {
      const close = closing.get(`${year}-${month}`);
      if (close === undefined) {
        months.push(null);
        continue;
      }
      months.push(previousClose > 0 ? (close / previousClose - 1) * 100 : null);
      previousClose = close;
    }
    result.set(year, months);
  }
  return result;
}

/** Les rendements se composent : +10 % puis +10 % font +21 %, pas +20 %. */
export function compoundReturns(values: (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null);
  if (known.length === 0) return null;
  return (known.reduce((acc, value) => acc * (1 + value / 100), 1) - 1) * 100;
}

const QUARTER_MONTHS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]];

export function quarterlyReturns(monthly: Map<number, (number | null)[]>): Map<number, (number | null)[]> {
  const result = new Map<number, (number | null)[]>();
  for (const [year, months] of monthly) {
    result.set(year, QUARTER_MONTHS.map((quarter) => compoundReturns(quarter.map((m) => months[m]))));
  }
  return result;
}
