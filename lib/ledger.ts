/**
 * Grand livre unique du portefeuille.
 *
 * Chaque source (exchanges, wallets, imports CSV) range ses opérations dans
 * des tables différentes et avec ses propres conventions : une conversion est
 * tantôt une « vente » de l'actif donné, tantôt un « achat » de l'actif reçu ;
 * un dépôt Bitstack porte le code qu'utilise Binance pour un retrait ; les
 * swaps Finary vivent dans une table que rien d'autre ne lisait.
 *
 * Ce module ramène tout à deux formes comptables, et à elles seules :
 *
 * - un **échange** : sur un compte, je donne une quantité d'un actif et j'en
 *   reçois une d'un autre, avec éventuellement des frais ;
 * - un **transfert** : une quantité d'un actif entre sur un compte ou en sort.
 *
 * Les transferts sont ensuite rapprochés : un retrait d'un compte suivi du
 * dépôt correspondant sur un autre compte suivi est un mouvement interne. Il
 * ne crée ni apport, ni retrait de capital, ni acquisition fiscale.
 *
 * Performance, fiscalité et soldes partent tous de ce même livre : c'est ce
 * qui garantit que les chiffres concordent d'un écran à l'autre.
 */

// ─── Classes d'actifs ─────────────────────────────────────────────────────

/** Monnaies ayant cours légal : leur cession contre crypto est une acquisition. */
export const FIAT_CURRENCIES = new Set([
  "EUR", "USD", "GBP", "CHF", "JPY", "CAD", "AUD", "NZD", "TRY", "BRL", "ARS",
  "MXN", "INR", "KRW", "SGD", "HKD", "NOK", "SEK", "DKK", "ZAR", "CZK", "PLN",
  "HUF", "RON", "RUB", "UAH", "NGN", "COP", "PEN",
]);

/** Stablecoins adossés au dollar, valorisés à 1 $ faute de mieux. */
export const USD_STABLECOINS = new Set([
  "USDT", "USDC", "BUSD", "FDUSD", "TUSD", "DAI", "USDP", "USDD", "PYUSD", "USDG",
  "GUSD", "LUSD", "FRAX", "CRVUSD", "USDE",
]);

/** Stablecoins adossés à l'euro. */
export const EUR_STABLECOINS = new Set(["EURC", "EUROC", "EURI", "EURT"]);

/** Codes historiques de certaines plateformes (Kraken) ramenés au standard. */
const ASSET_ALIASES: Record<string, string> = {
  XBT: "BTC",
  XXBT: "BTC",
  XETH: "ETH",
  XXDG: "DOGE",
  XDG: "DOGE",
  ZEUR: "EUR",
  ZUSD: "USD",
  ZGBP: "GBP",
};

export function normalizeAsset(asset: string): string {
  const upper = asset.trim().toUpperCase();
  return ASSET_ALIASES[upper] ?? upper;
}

export function isFiat(asset: string): boolean {
  return FIAT_CURRENCIES.has(normalizeAsset(asset));
}

/** Cotations connues, des plus longues aux plus courtes : FDUSD avant USD. */
const QUOTES = [
  ...FIAT_CURRENCIES,
  ...USD_STABLECOINS,
  ...EUR_STABLECOINS,
  "BTC", "ETH", "BNB",
].sort((a, b) => b.length - a.length);

/** Sépare une paire en actif de base et cotation : BTCUSDT, BTC-USDT, BTC/USDT. */
export function splitPair(symbol: string): { base: string; quote: string } | null {
  const upper = symbol.toUpperCase();
  const separated = upper.split(/[-/_]/);
  if (separated.length === 2 && separated[0] && separated[1]) {
    return { base: normalizeAsset(separated[0]), quote: normalizeAsset(separated[1]) };
  }
  for (const quote of QUOTES) {
    if (upper.endsWith(quote) && upper.length > quote.length) {
      return { base: normalizeAsset(upper.slice(0, -quote.length)), quote };
    }
  }
  return null;
}

// ─── Entrées : les enregistrements tels que stockés ───────────────────────

export type LedgerTradeInput = {
  id: string;
  account: string;
  providerTradeId?: string;
  tradeType?: "SPOT" | "CONVERT" | "FIAT" | "DUST";
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  quoteQuantity?: number;
  fee?: number;
  feeAsset?: string;
  executedAt: number;
  fromAsset?: string;
  fromAmount?: number;
  toAsset?: string;
  toAmount?: number;
};

/** Ligne de la table `convertTrades` (swaps Binance, Finary, imports KuCoin). */
export type LedgerConvertInput = {
  id: string;
  account: string;
  providerTradeId: string;
  status?: string;
  fromAsset: string;
  fromAmount: number;
  toAsset: string;
  toAmount: number;
  fee?: number;
  feeAsset?: string;
  executedAt: number;
};

/** Ordre exécuté, utilisé seulement pour ce que les trades ne couvrent pas. */
export type LedgerOrderInput = {
  id: string;
  account: string;
  symbol: string;
  side: "BUY" | "SELL";
  status?: string;
  quantity: number;
  quoteQuantity: number;
  executedAt: number;
};

export type LedgerTransferInput = {
  id: string;
  account: string;
  asset: string;
  amount: number;
  fee?: number;
  status?: string;
  timestamp: number;
  txId?: string;
};

export type LedgerFiatInput = {
  id: string;
  account: string;
  orderId: string;
  txType: "0" | "1";
  fiatCurrency: string;
  fiatAmount: number;
  cryptoCurrency?: string;
  cryptoAmount?: number;
  fee?: number;
  status?: string;
  timestamp: number;
};

export type LedgerInput = {
  trades: LedgerTradeInput[];
  converts?: LedgerConvertInput[];
  orders?: LedgerOrderInput[];
  deposits: LedgerTransferInput[];
  withdrawals: LedgerTransferInput[];
  fiat?: LedgerFiatInput[];
  /** Plateforme de chaque compte : certains codes de statut en dépendent. */
  providers?: Record<string, string>;
};

// ─── Sortie : les opérations canoniques ───────────────────────────────────

export type Amount = { asset: string; quantity: number };

export type ExchangeOperation = {
  kind: "exchange";
  id: string;
  account: string;
  timestamp: number;
  given: Amount;
  received: Amount;
  /** Frais débités en plus des montants échangés. */
  fee?: Amount;
  origin: "spot" | "convert" | "fiat" | "dust" | "order";
};

export type TransferOperation = {
  kind: "deposit" | "withdrawal";
  id: string;
  account: string;
  timestamp: number;
  asset: string;
  /** Quantité qui entre (dépôt, nette de frais) ou qui part (retrait). */
  quantity: number;
  /** Frais d'un retrait, débités en plus de la quantité envoyée. */
  fee: number;
  txId?: string;
  /** Opération jumelle quand le transfert relie deux comptes suivis. */
  counterpart?: string;
};

export type Operation = ExchangeOperation | TransferOperation;

export function isInternalTransfer(operation: Operation): boolean {
  return operation.kind !== "exchange" && operation.counterpart !== undefined;
}

// ─── Statuts ──────────────────────────────────────────────────────────────

const FAILED_STATUS = /fail|cancel|reject|expire|refund|invalid/i;

/**
 * Binance publie des codes numériques : 1 annulé, 3 rejeté, 5 échec pour un
 * retrait ; 2 rejeté, 7 dépôt erroné pour un dépôt. Ailleurs, un statut
 * textuel d'échec suffit.
 */
function isSettled(
  status: string | undefined,
  provider: string | undefined,
  direction: "deposit" | "withdrawal"
): boolean {
  if (!status) return true;
  if (FAILED_STATUS.test(status)) return false;
  if (provider === "binance" && /^\d+$/.test(status)) {
    const failed = direction === "withdrawal" ? ["1", "3", "5"] : ["2", "7"];
    return !failed.includes(status);
  }
  return true;
}

// ─── Normalisation ────────────────────────────────────────────────────────

function positive(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;
}

function tradeToExchange(trade: LedgerTradeInput): ExchangeOperation | null {
  const fee =
    positive(trade.fee) > 0 && trade.feeAsset
      ? { asset: normalizeAsset(trade.feeAsset), quantity: trade.fee! }
      : undefined;

  // Les conversions et achats en fiat portent leurs deux jambes explicitement.
  if (trade.fromAsset && trade.toAsset && positive(trade.fromAmount) && positive(trade.toAmount)) {
    const origin =
      trade.tradeType === "FIAT" ? "fiat" : trade.tradeType === "DUST" ? "dust" : "convert";
    const given = { asset: normalizeAsset(trade.fromAsset), quantity: trade.fromAmount! };
    return {
      kind: "exchange",
      id: trade.id,
      account: trade.account,
      timestamp: trade.executedAt,
      given,
      received: { asset: normalizeAsset(trade.toAsset), quantity: trade.toAmount! },
      // Achats en fiat (Bitstack, Finary, carte Binance) : le montant envoyé
      // inclut déjà les frais. Poussière Binance : le BNB crédité est net.
      // Une conversion Kraken, elle, débite ses frais en plus — c'est ce que
      // vérifie le test « Kraken solde à zéro ».
      fee: origin === "convert" ? fee : undefined,
      origin,
    };
  }

  const pair = splitPair(trade.symbol);
  if (!pair) return null;
  const quoteQuantity = positive(trade.quoteQuantity) || trade.price * trade.quantity;
  if (!(trade.quantity > 0) || !(quoteQuantity > 0)) return null;

  const base = { asset: pair.base, quantity: trade.quantity };
  const quote = { asset: pair.quote, quantity: quoteQuantity };
  return {
    kind: "exchange",
    id: trade.id,
    account: trade.account,
    timestamp: trade.executedAt,
    given: trade.side === "BUY" ? quote : base,
    received: trade.side === "BUY" ? base : quote,
    // Frais sans actif précisé : prélevés dans la cotation, l'usage courant.
    fee: positive(trade.fee) > 0 ? { asset: fee?.asset ?? pair.quote, quantity: trade.fee! } : undefined,
    origin: "spot",
  };
}

/**
 * Ordres exécutés que les trades ne couvrent pas (historique /myTrades
 * incomplet). Agrégés par compte, paire et sens : seul l'excédent de
 * quantité des ordres sur les trades est ajouté.
 */
function uncoveredOrders(
  orders: LedgerOrderInput[],
  trades: LedgerTradeInput[]
): ExchangeOperation[] {
  const covered = new Map<string, number>();
  for (const trade of trades) {
    if (trade.tradeType && trade.tradeType !== "SPOT") continue;
    const key = `${trade.account}|${trade.symbol.toUpperCase()}|${trade.side}`;
    covered.set(key, (covered.get(key) ?? 0) + trade.quantity);
  }

  const groups = new Map<string, LedgerOrderInput[]>();
  for (const order of orders) {
    const status = (order.status ?? "").toUpperCase();
    if (status !== "FILLED" && status !== "PARTIALLY_FILLED") continue;
    if (!(order.quantity > 0) || !(order.quoteQuantity > 0)) continue;
    const key = `${order.account}|${order.symbol.toUpperCase()}|${order.side}`;
    groups.set(key, [...(groups.get(key) ?? []), order]);
  }

  const result: ExchangeOperation[] = [];
  for (const [key, list] of groups) {
    const quantity = list.reduce((sum, order) => sum + order.quantity, 0);
    const delta = quantity - (covered.get(key) ?? 0);
    if (delta <= quantity * 0.001) continue;
    const quoteTotal = list.reduce((sum, order) => sum + order.quoteQuantity, 0);
    const latest = list.reduce((a, b) => (b.executedAt > a.executedAt ? b : a));
    const pair = splitPair(latest.symbol);
    if (!pair) continue;
    const base = { asset: pair.base, quantity: delta };
    const quote = { asset: pair.quote, quantity: delta * (quoteTotal / quantity) };
    result.push({
      kind: "exchange",
      id: `orders:${key}`,
      account: latest.account,
      timestamp: latest.executedAt,
      given: latest.side === "BUY" ? quote : base,
      received: latest.side === "BUY" ? base : quote,
      origin: "order",
    });
  }
  return result;
}

/**
 * Sens d'un mouvement fiat sans contrepartie crypto. Binance code 0 un dépôt
 * et 1 un retrait ; l'import Bitstack a toujours rangé ses dépôts sous le
 * code 1, ce que l'identifiant permet de reconnaître.
 */
export function fiatMovementDirection(record: { orderId: string; txType: "0" | "1" }): "deposit" | "withdrawal" {
  if (record.orderId.startsWith("bitstack:")) return "deposit";
  return record.txType === "0" ? "deposit" : "withdrawal";
}

function fiatToOperation(record: LedgerFiatInput): Operation | null {
  if (record.status && FAILED_STATUS.test(record.status)) return null;
  const fiat = normalizeAsset(record.fiatCurrency || "EUR");
  if (!(record.fiatAmount > 0)) return null;

  if (record.cryptoCurrency && positive(record.cryptoAmount) > 0) {
    // Achat ou vente directe contre fiat (carte, Apple Pay…).
    const crypto = { asset: normalizeAsset(record.cryptoCurrency), quantity: record.cryptoAmount! };
    const cash = { asset: fiat, quantity: record.fiatAmount };
    const isBuy = record.txType === "0";
    return {
      kind: "exchange",
      id: record.id,
      account: record.account,
      timestamp: record.timestamp,
      given: isBuy ? cash : crypto,
      received: isBuy ? crypto : cash,
      origin: "fiat",
    };
  }

  const direction = fiatMovementDirection(record);
  const fee = positive(record.fee);
  return {
    kind: direction,
    id: record.id,
    account: record.account,
    timestamp: record.timestamp,
    asset: fiat,
    quantity: direction === "deposit" ? Math.max(0, record.fiatAmount - fee) : record.fiatAmount,
    fee: direction === "withdrawal" ? fee : 0,
  };
}

// ─── Rapprochement des transferts internes ────────────────────────────────

const MATCH_BEFORE_MS = 2 * 3_600_000;
const MATCH_AFTER_MS = 4 * 86_400_000;

function amountsMatch(withdrawal: TransferOperation, deposit: TransferOperation): boolean {
  // Le dépôt peut être amputé des frais réseau, jamais supérieur au retrait.
  const tolerance = Math.max(withdrawal.fee, withdrawal.quantity * 0.005) + 1e-9;
  return (
    deposit.quantity <= withdrawal.quantity + tolerance &&
    deposit.quantity >= withdrawal.quantity - tolerance
  );
}

/**
 * Apparie chaque retrait crypto au dépôt qui lui correspond sur un autre
 * compte suivi : même identifiant de transaction quand les deux en portent
 * un, sinon même actif, montant compatible et dépôt peu après le retrait.
 * Un dépôt ne sert qu'une fois. Le fiat passe par une banque, hors du
 * périmètre : il n'est jamais apparié.
 */
export function matchInternalTransfers(operations: Operation[]): void {
  const deposits = operations.filter(
    (op): op is TransferOperation => op.kind === "deposit" && !isFiat(op.asset)
  );
  const withdrawals = operations
    .filter((op): op is TransferOperation => op.kind === "withdrawal" && !isFiat(op.asset))
    .sort((a, b) => a.timestamp - b.timestamp);
  const used = new Set<string>();

  for (const withdrawal of withdrawals) {
    const candidates = deposits.filter(
      (deposit) =>
        !used.has(deposit.id) &&
        deposit.account !== withdrawal.account &&
        deposit.asset === withdrawal.asset
    );

    const byTxId = withdrawal.txId
      ? candidates.find(
          (deposit) => deposit.txId && deposit.txId.toLowerCase() === withdrawal.txId!.toLowerCase()
        )
      : undefined;

    const match =
      byTxId ??
      candidates
        .filter(
          (deposit) =>
            deposit.timestamp >= withdrawal.timestamp - MATCH_BEFORE_MS &&
            deposit.timestamp <= withdrawal.timestamp + MATCH_AFTER_MS &&
            amountsMatch(withdrawal, deposit)
        )
        .sort(
          (a, b) =>
            Math.abs(a.timestamp - withdrawal.timestamp) - Math.abs(b.timestamp - withdrawal.timestamp)
        )[0];

    if (match) {
      used.add(match.id);
      withdrawal.counterpart = match.id;
      match.counterpart = withdrawal.id;
    }
  }
}

// ─── Construction du livre ────────────────────────────────────────────────

/**
 * Traduit toutes les sources en opérations canoniques, triées par date, avec
 * les transferts internes rapprochés.
 */
export function buildLedger(input: LedgerInput): Operation[] {
  const providers = input.providers ?? {};
  const operations: Operation[] = [];

  const tradeIds = new Set<string>();
  for (const trade of input.trades) {
    if (trade.providerTradeId) tradeIds.add(`${trade.account}|${trade.providerTradeId}`);
    const exchange = tradeToExchange(trade);
    if (exchange) operations.push(exchange);
  }

  // Binance range ses conversions dans les deux tables : seules celles qui
  // n'existent qu'ici (Finary, imports KuCoin) sont ajoutées.
  for (const convert of input.converts ?? []) {
    if (convert.status && !/success|done|complete/i.test(convert.status)) continue;
    if (tradeIds.has(`${convert.account}|${convert.providerTradeId}`)) continue;
    if (!(convert.fromAmount > 0) || !(convert.toAmount > 0)) continue;
    operations.push({
      kind: "exchange",
      id: convert.id,
      account: convert.account,
      timestamp: convert.executedAt,
      given: { asset: normalizeAsset(convert.fromAsset), quantity: convert.fromAmount },
      received: { asset: normalizeAsset(convert.toAsset), quantity: convert.toAmount },
      fee:
        positive(convert.fee) > 0 && convert.feeAsset
          ? { asset: normalizeAsset(convert.feeAsset), quantity: convert.fee! }
          : undefined,
      origin: "convert",
    });
  }

  operations.push(...uncoveredOrders(input.orders ?? [], input.trades));

  for (const deposit of input.deposits) {
    if (!isSettled(deposit.status, providers[deposit.account], "deposit")) continue;
    const quantity = deposit.amount - positive(deposit.fee);
    if (!(quantity > 0)) continue;
    operations.push({
      kind: "deposit",
      id: deposit.id,
      account: deposit.account,
      timestamp: deposit.timestamp,
      asset: normalizeAsset(deposit.asset),
      quantity,
      fee: 0,
      txId: deposit.txId,
    });
  }

  for (const withdrawal of input.withdrawals) {
    if (!isSettled(withdrawal.status, providers[withdrawal.account], "withdrawal")) continue;
    if (!(withdrawal.amount > 0)) continue;
    operations.push({
      kind: "withdrawal",
      id: withdrawal.id,
      account: withdrawal.account,
      timestamp: withdrawal.timestamp,
      asset: normalizeAsset(withdrawal.asset),
      quantity: withdrawal.amount,
      fee: withdrawalFee(withdrawal, providers[withdrawal.account]),
      txId: withdrawal.txId,
    });
  }

  for (const record of input.fiat ?? []) {
    const operation = fiatToOperation(record);
    if (operation) operations.push(operation);
  }

  operations.sort((a, b) => a.timestamp - b.timestamp || rank(a) - rank(b));
  matchInternalTransfers(operations);
  return operations;
}

/**
 * Frais d'un retrait, dans l'actif retiré. La table ne porte pas de devise
 * de frais : l'import Finary y a longtemps rangé des frais en euros, qu'il
 * faut ignorer — 0,84 € de frais sur un retrait de BTC devenaient 0,84 BTC.
 * Et des frais réseau supérieurs au montant envoyé ne sont jamais dans
 * l'actif retiré.
 */
function withdrawalFee(withdrawal: LedgerTransferInput, provider: string | undefined): number {
  const fee = positive(withdrawal.fee);
  if (provider === "finary") return 0;
  return fee > withdrawal.amount ? 0 : fee;
}

/** À horodatage égal, ce qui alimente un compte passe avant ce qui le vide. */
function rank(operation: Operation): number {
  return operation.kind === "deposit" ? 0 : operation.kind === "exchange" ? 1 : 2;
}

// ─── Soldes ───────────────────────────────────────────────────────────────

/** Variations de solde d'une opération, compte par compte. */
export function balanceChanges(operation: Operation): { account: string; asset: string; delta: number }[] {
  if (operation.kind === "exchange") {
    const changes = [
      { account: operation.account, asset: operation.given.asset, delta: -operation.given.quantity },
      { account: operation.account, asset: operation.received.asset, delta: operation.received.quantity },
    ];
    if (operation.fee) {
      changes.push({ account: operation.account, asset: operation.fee.asset, delta: -operation.fee.quantity });
    }
    return changes;
  }
  if (operation.kind === "deposit") {
    return [{ account: operation.account, asset: operation.asset, delta: operation.quantity }];
  }
  return [{ account: operation.account, asset: operation.asset, delta: -(operation.quantity + operation.fee) }];
}

/** Soldes par compte et par actif après toutes les opérations jusqu'à `until`. */
export function balancesAt(
  operations: Operation[],
  until = Number.POSITIVE_INFINITY
): Map<string, Map<string, number>> {
  const balances = new Map<string, Map<string, number>>();
  for (const operation of operations) {
    if (operation.timestamp > until) break;
    for (const change of balanceChanges(operation)) {
      const account = balances.get(change.account) ?? new Map<string, number>();
      account.set(change.asset, (account.get(change.asset) ?? 0) + change.delta);
      balances.set(change.account, account);
    }
  }
  return balances;
}

export type BalanceGap = {
  account: string;
  asset: string;
  computed: number;
  reported: number;
  /** Écart rapporté au solde publié : 0,1 = 10 %. */
  relativeGap: number;
};

/**
 * Compare les soldes recalculés depuis les transactions à ceux que publient
 * les plateformes. Un écart signale une opération manquante (staking,
 * airdrop, historique tronqué) : c'est le contrôle de cohérence du livre.
 */
export function reconcileBalances(
  computed: Map<string, Map<string, number>>,
  reported: { account: string; asset: string; quantity: number }[],
  tolerance = 0.01
): BalanceGap[] {
  const gaps: BalanceGap[] = [];
  for (const line of reported) {
    const asset = normalizeAsset(line.asset);
    const value = computed.get(line.account)?.get(asset) ?? 0;
    const scale = Math.max(Math.abs(line.quantity), Math.abs(value), 1e-12);
    const relativeGap = Math.abs(value - line.quantity) / scale;
    if (relativeGap > tolerance && Math.abs(value - line.quantity) > 1e-8) {
      gaps.push({ account: line.account, asset, computed: value, reported: line.quantity, relativeGap });
    }
  }
  return gaps;
}
