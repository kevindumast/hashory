import { useMemo } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { isConvexConfigured } from "@/convex/client";
import { computeCostBasis } from "@/lib/cost-basis";

const DATASET_SPOT_TRADES = "spot_trades";

export const currencyFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const numberFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 4,
});

export const priceFormatter = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 8,
});

export const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
});

const dayLabelFormatter = new Intl.DateTimeFormat("fr-FR", {
  month: "short",
  day: "numeric",
});

const parseAmount = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === "number") {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export type TradeRecord = {
  _id: Id<"trades">;
  integrationId: Id<"integrations">;
  provider: string;
  providerDisplayName: string;
  providerOrderId?: string;
  tradeType?: "SPOT" | "CONVERT" | "FIAT" | "DUST";
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  quoteQuantity?: number;
  fee?: number;
  feeAsset?: string;
  isMaker: boolean;
  executedAt: number;
  fromAsset?: string;
  fromAmount?: number;
  toAsset?: string;
  toAmount?: number;
  createdAt: number;
};

type SyncScopeRecord = {
  integrationId: Id<"integrations">;
  dataset: string;
  scope: string;
  updatedAt: number;
};

export type TrackedScope = {
  integrationId: Id<"integrations">;
  symbols: string[];
};

export type DepositRecord = {
  _id: Id<"deposits">;
  integrationId: Id<"integrations">;
  provider: string;
  providerDisplayName: string;
  coin: string;
  amount: number;
  network: string | null;
  status: string;
  address: string | null;
  addressTag: string | null;
  insertTime: number;
  txId: string | null;
};

export type WithdrawalRecord = {
  _id: Id<"withdrawals">;
  integrationId: Id<"integrations">;
  provider: string;
  providerDisplayName: string;
  coin: string;
  amount: number;
  network: string | null;
  status: string;
  address: string | null;
  addressTag: string | null;
  applyTime: number;
  updateTime: number | null;
  fee: number;
  txId: string | null;
};

export type BalanceRecord = {
  _id: Id<"balances">;
  integrationId: Id<"integrations">;
  provider: string;
  providerDisplayName: string;
  asset: string;
  name: string;
  free: string;
  locked: string;
  freeze: string;
  withdrawing: string;
  totalPosition: string;
  btcValuation: string;
  depositAddress?: string;
  updatedAt: number;
};

export type TransactionEntry =
  | {
      type: "trade";
      tradeType?: "SPOT" | "CONVERT" | "FIAT" | "DUST";
      id: string;
      integrationId: Id<"integrations">;
      provider: string;
      providerDisplayName: string;
      symbol: string;
      baseAsset: string;
      side: "BUY" | "SELL";
      quantity: number;
      price: number;
      quoteQuantity?: number;
      fee?: number;
      feeAsset?: string;
      executedAt: number;
    }
  | {
      type: "deposit";
      id: string;
      integrationId: Id<"integrations">;
      provider: string;
      providerDisplayName: string;
      baseAsset: string;
      amount: number;
      network: string | null;
      status: string;
      timestamp: number;
      txId: string | null;
      direction: "IN";
    }
  | {
      type: "withdrawal";
      id: string;
      integrationId: Id<"integrations">;
      provider: string;
      providerDisplayName: string;
      baseAsset: string;
      amount: number;
      network: string | null;
      status: string;
      timestamp: number;
      txId: string | null;
      fee: number;
      direction: "OUT";
    };

export type TokenTimelineEvent = {
  id: string;
  type: "BUY" | "SELL" | "DEPOSIT" | "WITHDRAWAL";
  timestamp: number;
  quantity: number;
  price?: number;
  valueUsd?: number;
  fee?: number;
  feeAsset?: string;
  provider: string;
  providerDisplayName: string;
  integrationId: Id<"integrations">;
  /** Whether the counter-asset of this trade is a USD stablecoin. Only set for BUY/SELL. */
  vsStablecoin?: boolean;
};

/** Quantité détenue sur une source, après réconciliation. */
export type SourceQuantity = {
  integrationId: string;
  provider: string;
  providerDisplayName: string;
  quantity: number;
};

export type PortfolioToken = {
  symbol: string;
  currentQuantity: number;
  /**
   * Détail du stock par plateforme. Issu de la même réconciliation que
   * `currentQuantity` : la somme des sources égale toujours le total.
   */
  quantityBySource: SourceQuantity[];
  buyQuantity: number;
  sellQuantity: number;
  depositQuantity: number;
  withdrawalQuantity: number;
  investedUsd: number;
  realizedUsd: number;
  buyValueUsd: number;
  sellValueUsd: number;
  netProfitUsd: number;
  /** Prix d'achat moyen pondéré AVCO (même calcul que Binance "Prix garanti") */
  avgCostBasis: number;
  /** PnL réalisé calculé avec AVCO */
  realizedPnlAvco: number;
  averageBuyPrice?: number;
  averageSellPrice?: number;
  lastActivityAt: number;
  tradeSymbols: string[];
  primarySymbol?: string;
  events: TokenTimelineEvent[];
};

export type PerformerSummary = {
  symbol: string;
  profitUsd: number;
  profitPercentage?: number;
};

export type ProfitSummary = {
  totalProfitUsd: number;
  costBasisUsd: number;
  profitPercentage: number;
  bestPerformer?: PerformerSummary | null;
  worstPerformer?: PerformerSummary | null;
};

export type HistoryPoint = {
  timestamp: number;
  label: string;
  profitUsd: number;
  netInvestedUsd: number;
};

export type PerformancePoint = {
  timestamp: number;
  label: string;
  profitPercent: number;
  benchmarkPercent: number;
};

const QUOTE_ASSETS = [
  "USDT",
  "USDC",
  "BUSD",
  "USD",
  "FDUSD",
  "TUSD",
  "DAI",
  "BTC",
  "ETH",
  "BNB",
  "EUR",
  "GBP",
  "TRY",
  "AUD",
  "CAD",
  "BRL",
];

/** Stablecoins dont on connaît la valeur ≈ 1 USD */
export const USD_STABLECOINS = new Set(["USDT", "USDC", "BUSD", "FDUSD", "TUSD", "DAI", "USD"]);

/**
 * Calcule le prix d'achat moyen pondéré (AVCO) et le PnL réalisé.
 * Identique à la méthode "Prix garanti" de Binance.
 */
function extractBaseAsset(symbol: string) {
  const upper = symbol.toUpperCase();
  for (const quote of QUOTE_ASSETS) {
    if (upper.endsWith(quote)) {
      return upper.slice(0, upper.length - quote.length) || upper;
    }
  }
  return upper;
}

export function useDashboardMetrics(refreshToken: number) {
  const { user, isLoaded } = useUser();

  const trades = useQuery(
    api.trades.listByUser,
    isConvexConfigured && isLoaded && user
      ? { limit: 1000, refreshToken }
      : "skip"
  );

  const orders = useQuery(
    api.orders.listByUser,
    isConvexConfigured && isLoaded && user
      ? { refreshToken }
      : "skip"
  );

  const deposits = useQuery(
    api.deposits.listByUser,
    isConvexConfigured && isLoaded && user
      ? { limit: 1000, refreshToken }
      : "skip"
  );

  const withdrawals = useQuery(
    api.withdrawals.listByUser,
    isConvexConfigured && isLoaded && user
      ? { limit: 1000, refreshToken }
      : "skip"
  );

  const fiatTransactions = useQuery(
    api.fiatTransactions.listByUser,
    isConvexConfigured && isLoaded && user
      ? {}
      : "skip"
  );

  const balances = useQuery(
    api.balances.listByUser,
    isConvexConfigured && isLoaded && user
      ? { refreshToken }
      : "skip"
  );

  const syncScopes = useQuery(
    api.integrations.listSyncScopes,
    isConvexConfigured && isLoaded && user
      ? { dataset: DATASET_SPOT_TRADES, refreshToken }
      : "skip"
  );

  const tradesList = useMemo<TradeRecord[]>(() => {
    if (!Array.isArray(trades)) {
      return [];
    }
    return [...trades].sort((a, b) => b.executedAt - a.executedAt);
  }, [trades]);

  // Orders non représentés dans la table trades (ex: TAKE_PROFIT_LIMIT SNX qui
  // a liquidé le stock mais n'apparaissait pas via /myTrades du symbole).
  // Dédup par volume agrégé : pour chaque (intégration, symbole, side), on ne
  // crée un trade synthétique que pour le delta entre volume orders et volume
  // trades. Nécessaire car providerOrderId n'est historiquement pas renseigné
  // dans la table trades.
  const ordersAsTrades = useMemo<TradeRecord[]>(() => {
    if (!Array.isArray(orders)) {
      return [];
    }
    const keyOf = (integrationId: Id<"integrations">, symbol: string, side: string) =>
      `${integrationId}|${symbol.toUpperCase()}|${side}`;

    const tradeQtyByKey = new Map<string, number>();
    for (const trade of tradesList) {
      if (trade.tradeType && trade.tradeType !== "SPOT") continue;
      const k = keyOf(trade.integrationId, trade.symbol, trade.side);
      tradeQtyByKey.set(k, (tradeQtyByKey.get(k) ?? 0) + trade.quantity);
    }

    type OrderItem = (typeof orders extends readonly (infer U)[] ? U : never);
    const ordersByKey = new Map<string, OrderItem[]>();
    for (const order of orders) {
      if (order.quantity <= 0 || order.quoteQuantity <= 0) continue;
      const status = order.status?.toUpperCase() ?? "";
      if (status !== "FILLED" && status !== "PARTIALLY_FILLED") continue;
      const k = keyOf(order.integrationId, order.symbol, order.side);
      const arr = ordersByKey.get(k) ?? [];
      arr.push(order);
      ordersByKey.set(k, arr);
    }

    const synthetic: TradeRecord[] = [];
    for (const [k, list] of ordersByKey) {
      const orderQty = list.reduce((s, o) => s + o.quantity, 0);
      const covered = tradeQtyByKey.get(k) ?? 0;
      const delta = orderQty - covered;
      // tolérance 0.1% pour absorber les arrondis de Binance
      if (delta <= orderQty * 0.001) continue;

      const orderQuoteSum = list.reduce((s, o) => s + o.quoteQuantity, 0);
      const avgPrice = orderQty > 0 ? orderQuoteSum / orderQty : 0;
      const deltaQuote = delta * avgPrice;
      const latest = list.reduce((a, b) => (b.executedAt > a.executedAt ? b : a));

      synthetic.push({
        _id: latest._id as unknown as Id<"trades">,
        integrationId: latest.integrationId,
        provider: latest.provider,
        providerDisplayName: latest.providerDisplayName,
        providerOrderId: latest.providerOrderId,
        tradeType: "SPOT",
        symbol: latest.symbol,
        side: latest.side,
        quantity: delta,
        price: avgPrice,
        quoteQuantity: deltaQuote,
        fee: undefined,
        feeAsset: undefined,
        isMaker: false,
        executedAt: latest.executedAt,
        fromAsset: latest.fromAsset,
        fromAmount: latest.side === "BUY" ? deltaQuote : delta,
        toAsset: latest.toAsset,
        toAmount: latest.side === "BUY" ? delta : deltaQuote,
        createdAt: latest.executedAt,
      });
    }

    return synthetic;
  }, [orders, tradesList]);

  const portfolioTradesList = useMemo<TradeRecord[]>(
    () => [...tradesList, ...ordersAsTrades].sort((a, b) => b.executedAt - a.executedAt),
    [tradesList, ordersAsTrades]
  );

  const depositList = useMemo<DepositRecord[]>(() => {
    if (!Array.isArray(deposits)) {
      return [];
    }
    return [...deposits].sort((a, b) => b.insertTime - a.insertTime);
  }, [deposits]);

  const withdrawalList = useMemo<WithdrawalRecord[]>(() => {
    if (!Array.isArray(withdrawals)) {
      return [];
    }
    return [...withdrawals].sort((a, b) => b.applyTime - a.applyTime);
  }, [withdrawals]);

  const fiatList = useMemo(() => {
    if (!Array.isArray(fiatTransactions)) return [];
    return fiatTransactions;
  }, [fiatTransactions]);

  const balanceList: BalanceRecord[] = Array.isArray(balances) ? balances : [];

  const syncScopeList = useMemo<SyncScopeRecord[]>(() => {
    if (!Array.isArray(syncScopes)) {
      return [];
    }
    return syncScopes;
  }, [syncScopes]);

  const tradeCount = tradesList.length;
  const totalVolume = tradesList.reduce(
    (sum, trade) => sum + (trade.quoteQuantity ?? trade.price * trade.quantity),
    0
  );
  const totalFees = tradesList.reduce((sum, trade) => sum + (trade.fee ?? 0), 0);

  const trackedAssets = useMemo(() => {
    const assets = new Set<string>();
    tradesList.forEach((trade) => assets.add(extractBaseAsset(trade.symbol)));
    depositList.forEach((deposit) => assets.add(deposit.coin.toUpperCase()));
    withdrawalList.forEach((withdrawal) => assets.add(withdrawal.coin.toUpperCase()));
    balanceList.forEach((balance) => assets.add(balance.asset.toUpperCase()));
    return assets;
  }, [balanceList, depositList, tradesList, withdrawalList]);

  const uniqueAssets = trackedAssets.size;
  const lastTradeAt = tradesList[0]?.executedAt ?? null;

  const trackedScopes = useMemo<TrackedScope[]>(() => {
    const map = new Map<Id<"integrations">, Set<string>>();

    syncScopeList.forEach((record) => {
      if (record.dataset !== DATASET_SPOT_TRADES) {
        return;
      }
      const symbol = record.scope.toUpperCase();
      if (!symbol) {
        return;
      }
      const symbols = map.get(record.integrationId) ?? new Set<string>();
      symbols.add(symbol);
      map.set(record.integrationId, symbols);
    });

    tradesList.forEach((trade) => {
      const symbol = trade.symbol.toUpperCase();
      const symbols = map.get(trade.integrationId) ?? new Set<string>();
      symbols.add(symbol);
      map.set(trade.integrationId, symbols);
    });

    return Array.from(map.entries()).map(([integrationId, symbols]) => ({
      integrationId,
      symbols: Array.from(symbols),
    }));
  }, [syncScopeList, tradesList]);

  const transactions = useMemo<TransactionEntry[]>(() => {
    const entries: TransactionEntry[] = portfolioTradesList.map((trade) => ({
      type: "trade",
      tradeType: trade.tradeType,
      id: trade._id,
      integrationId: trade.integrationId,
      provider: trade.provider,
      providerDisplayName: trade.providerDisplayName,
      symbol: trade.symbol,
      baseAsset: extractBaseAsset(trade.symbol),
      side: trade.side,
      quantity: trade.quantity,
      price: trade.price,
      quoteQuantity: trade.quoteQuantity,
      fee: trade.fee,
      feeAsset: trade.feeAsset,
      executedAt: trade.executedAt,
    }));

    depositList.forEach((deposit) => {
      entries.push({
        type: "deposit",
        id: deposit._id,
        integrationId: deposit.integrationId,
        provider: deposit.provider,
        providerDisplayName: deposit.providerDisplayName,
        baseAsset: deposit.coin.toUpperCase(),
        amount: deposit.amount,
        network: deposit.network,
        status: deposit.status,
        timestamp: deposit.insertTime,
        txId: deposit.txId,
        direction: "IN",
      });
    });

    withdrawalList.forEach((withdrawal) => {
      entries.push({
        type: "withdrawal",
        id: withdrawal._id,
        integrationId: withdrawal.integrationId,
        provider: withdrawal.provider,
        providerDisplayName: withdrawal.providerDisplayName,
        baseAsset: withdrawal.coin.toUpperCase(),
        amount: withdrawal.amount,
        network: withdrawal.network,
        status: withdrawal.status,
        timestamp: withdrawal.applyTime,
        txId: withdrawal.txId,
        fee: withdrawal.fee,
        direction: "OUT",
      });
    });

    fiatList.forEach((fiat) => {
      const status = (fiat.status ?? "").toUpperCase();
      if (status.includes("FAIL")) {
        return;
      }
      const hasCrypto = fiat.cryptoCurrency && fiat.cryptoAmount && fiat.cryptoAmount > 0;

      if (hasCrypto) {
        // Échange fiat → crypto (ex: Apple Pay EUR → USDC)
        const isBuy = fiat.txType === "0";
        const cryptoCurrency = fiat.cryptoCurrency!;
        const cryptoAmount = fiat.cryptoAmount!;
        const symbol = `${cryptoCurrency}${fiat.fiatCurrency.toUpperCase()}`;
        const price = fiat.fiatAmount > 0 ? fiat.fiatAmount / cryptoAmount : 0;
        entries.push({
          type: "trade",
          tradeType: "FIAT",
          id: fiat._id,
          integrationId: fiat.integrationId,
          provider: fiat.provider,
          providerDisplayName: fiat.providerDisplayName,
          symbol,
          baseAsset: cryptoCurrency,
          side: isBuy ? "BUY" : "SELL",
          quantity: cryptoAmount,
          price,
          quoteQuantity: fiat.fiatAmount,
          fee: fiat.fee ?? undefined,
          feeAsset: fiat.fiatCurrency.toUpperCase(),
          executedAt: fiat.updateTime,
        });
      } else if (fiat.txType === "0") {
        // Dépôt fiat pur (virement bancaire EUR)
        entries.push({
          type: "deposit",
          id: fiat._id,
          integrationId: fiat.integrationId,
          provider: fiat.provider,
          providerDisplayName: fiat.providerDisplayName,
          baseAsset: fiat.fiatCurrency.toUpperCase(),
          amount: fiat.fiatAmount,
          network: fiat.method ?? null,
          status: fiat.status,
          timestamp: fiat.updateTime,
          txId: null,
          direction: "IN",
        });
      } else {
        // Retrait fiat pur
        entries.push({
          type: "withdrawal",
          id: fiat._id,
          integrationId: fiat.integrationId,
          provider: fiat.provider,
          providerDisplayName: fiat.providerDisplayName,
          baseAsset: fiat.fiatCurrency.toUpperCase(),
          amount: fiat.fiatAmount,
          network: fiat.method ?? null,
          status: fiat.status,
          timestamp: fiat.updateTime,
          txId: null,
          fee: fiat.fee ?? 0,
          direction: "OUT",
        });
      }
    });

    return entries.sort((a, b) => {
      const getTime = (entry: TransactionEntry) => {
        if (entry.type === "trade") {
          return entry.executedAt;
        }
        return entry.timestamp;
      };
      return getTime(b) - getTime(a);
    });
  }, [depositList, fiatList, portfolioTradesList, withdrawalList]);

  const portfolioTokens = useMemo<PortfolioToken[]>(() => {
    // Le solde publié par une plateforme fait autorité pour SA part du stock,
    // et pour elle seule. On indexe donc par (intégration, actif) au lieu de
    // collapser sur le seul symbole : un même actif peut être détenu sur
    // plusieurs sources, et la table `balances` a une ligne par couple.
    const balanceByIntegrationAsset = new Map<string, number>();
    const integrationsReportingBalances = new Set<string>();
    const balanceSymbols = new Set<string>();

    balanceList.forEach((balance) => {
      const symbol = balance.asset.toUpperCase();
      const integrationId = String(balance.integrationId);
      const total = balance.totalPosition ?? balance.free ?? "0";
      balanceByIntegrationAsset.set(`${integrationId}:${symbol}`, parseAmount(total));
      integrationsReportingBalances.add(integrationId);
      balanceSymbols.add(symbol);
    });

    const map = new Map<string, {
      symbol: string;
      currentQuantity: number;
      /** Quantité dérivée des événements, ventilée par intégration. */
      quantityByIntegration: Map<string, number>;
      buyQuantity: number;
      sellQuantity: number;
      depositQuantity: number;
      withdrawalQuantity: number;
      convertQuantity: number;
      investedUsd: number;
      realizedUsd: number;
      buyValueUsd: number;
      sellValueUsd: number;
      lastActivityAt: number;
      events: TokenTimelineEvent[];
      tradeSymbols: Set<string>;
    }>();

    const ensureEntry = (symbol: string) => {
      const upper = symbol.toUpperCase();
      if (!map.has(upper)) {
        map.set(upper, {
          symbol: upper,
          currentQuantity: 0,
          quantityByIntegration: new Map<string, number>(),
          buyQuantity: 0,
          sellQuantity: 0,
          depositQuantity: 0,
          withdrawalQuantity: 0,
          convertQuantity: 0,
          investedUsd: 0,
          realizedUsd: 0,
          buyValueUsd: 0,
          sellValueUsd: 0,
          lastActivityAt: 0,
          events: [],
          tradeSymbols: new Set<string>(),
        });
      }
      return map.get(upper)!;
    };

    type TokenEntry = ReturnType<typeof ensureEntry>;

    /** Applique un mouvement de stock, au global et pour son intégration. */
    const addQuantity = (
      entry: TokenEntry,
      integrationId: Id<"integrations">,
      delta: number
    ) => {
      entry.currentQuantity += delta;
      const key = String(integrationId);
      entry.quantityByIntegration.set(key, (entry.quantityByIntegration.get(key) ?? 0) + delta);
    };

    // Identité des plateformes, reconstituée depuis les soldes et les
    // événements : les deux portent provider et providerDisplayName.
    const integrationMeta = new Map<string, { provider: string; providerDisplayName: string }>();
    const rememberIntegration = (
      integrationId: Id<"integrations">,
      provider: string,
      providerDisplayName: string
    ) => {
      const key = String(integrationId);
      if (!integrationMeta.has(key)) {
        integrationMeta.set(key, { provider, providerDisplayName });
      }
    };

    balanceList.forEach((balance) =>
      rememberIntegration(balance.integrationId, balance.provider, balance.providerDisplayName)
    );
    portfolioTradesList.forEach((trade) =>
      rememberIntegration(trade.integrationId, trade.provider, trade.providerDisplayName)
    );
    depositList.forEach((deposit) =>
      rememberIntegration(deposit.integrationId, deposit.provider, deposit.providerDisplayName)
    );
    withdrawalList.forEach((withdrawal) =>
      rememberIntegration(
        withdrawal.integrationId,
        withdrawal.provider,
        withdrawal.providerDisplayName
      )
    );

    balanceSymbols.forEach((symbol) => {
      ensureEntry(symbol);
    });

    portfolioTradesList.forEach((trade) => {
      // Handle CONVERT trades specially
      if (trade.tradeType === "CONVERT") {
        // Valeur USD de la conversion :
        // - Si fromAsset est un stablecoin (ex: USDT→TAO), on sait que fromAmount = USD dépensé
        // - Si toAsset est un stablecoin (ex: TAO→USDT), on sait que toAmount = USD reçu
        // - Sinon on estime avec quoteQuantity ou price×qty
        const fromIsStable = USD_STABLECOINS.has((trade.fromAsset ?? "").toUpperCase());
        const toIsStable   = USD_STABLECOINS.has((trade.toAsset ?? "").toUpperCase());
        const convertValueUsd =
          fromIsStable ? (trade.fromAmount ?? 0)
          : toIsStable ? (trade.toAmount ?? 0)
          : (trade.quoteQuantity ?? trade.price * (trade.toAmount ?? trade.quantity));

        // Process fromAsset (sale)
        if (trade.fromAsset && trade.fromAmount !== undefined) {
          const fromEntry = ensureEntry(trade.fromAsset);
          fromEntry.convertQuantity -= trade.fromAmount;
          addQuantity(fromEntry, trade.integrationId, -trade.fromAmount);
          fromEntry.sellQuantity += trade.fromAmount;
          fromEntry.sellValueUsd += convertValueUsd;
          fromEntry.realizedUsd += convertValueUsd;
          fromEntry.lastActivityAt = Math.max(fromEntry.lastActivityAt, trade.executedAt);

          fromEntry.events.push({
            id: trade._id,
            type: "SELL",
            timestamp: trade.executedAt,
            quantity: trade.fromAmount,
            price: fromIsStable ? 1 : (trade.toAmount ? convertValueUsd / trade.fromAmount : trade.price),
            valueUsd: convertValueUsd,
            fee: trade.fee,
            feeAsset: trade.feeAsset,
            provider: trade.provider,
            providerDisplayName: trade.providerDisplayName,
            integrationId: trade.integrationId,
            vsStablecoin: toIsStable,
          });
        }

        // Process toAsset (purchase)
        if (trade.toAsset && trade.toAmount !== undefined) {
          const toEntry = ensureEntry(trade.toAsset);
          toEntry.convertQuantity += trade.toAmount;
          addQuantity(toEntry, trade.integrationId, trade.toAmount);
          toEntry.buyQuantity += trade.toAmount;
          toEntry.buyValueUsd += convertValueUsd;   // ← bug corrigé
          toEntry.investedUsd += convertValueUsd;   // ← bug corrigé
          toEntry.lastActivityAt = Math.max(toEntry.lastActivityAt, trade.executedAt);

          toEntry.events.push({
            id: trade._id,
            type: "BUY",
            timestamp: trade.executedAt,
            quantity: trade.toAmount,
            price: toIsStable ? 1 : (trade.toAmount > 0 ? convertValueUsd / trade.toAmount : trade.price),
            valueUsd: convertValueUsd,
            fee: trade.fee,
            feeAsset: trade.feeAsset,
            provider: trade.provider,
            providerDisplayName: trade.providerDisplayName,
            integrationId: trade.integrationId,
            vsStablecoin: fromIsStable,
          });
        }
      } else {
        // Regular BUY/SELL trades
        const baseAsset = extractBaseAsset(trade.symbol);
        const entry = ensureEntry(baseAsset);
        const valueUsd = trade.quoteQuantity ?? trade.price * trade.quantity;
        const quoteAsset = trade.symbol.toUpperCase().slice(baseAsset.length);
        const quoteIsStable = USD_STABLECOINS.has(quoteAsset);

        entry.events.push({
          id: trade._id,
          type: trade.side,
          timestamp: trade.executedAt,
          quantity: trade.quantity,
          price: trade.price,
          valueUsd,
          fee: trade.fee,
          feeAsset: trade.feeAsset,
          provider: trade.provider,
          providerDisplayName: trade.providerDisplayName,
          integrationId: trade.integrationId,
          vsStablecoin: quoteIsStable,
        });

        entry.tradeSymbols.add(trade.symbol.toUpperCase());
        entry.lastActivityAt = Math.max(entry.lastActivityAt, trade.executedAt);

        // Binance qty is BEFORE fee deduction. When the fee is paid in the
        // received asset we must subtract it to match the real wallet balance.
        const feeInBase =
          trade.fee && trade.feeAsset?.toUpperCase() === baseAsset
            ? trade.fee
            : 0;

        if (trade.side === "BUY") {
          entry.buyQuantity += trade.quantity;
          entry.buyValueUsd += valueUsd;
          entry.investedUsd += valueUsd;
          addQuantity(entry, trade.integrationId, trade.quantity - feeInBase);
        } else {
          entry.sellQuantity += trade.quantity;
          entry.sellValueUsd += valueUsd;
          entry.realizedUsd += valueUsd;
          // For SELL, fee is usually in quote asset, but if paid in base asset
          // it means additional base was deducted
          addQuantity(entry, trade.integrationId, -(trade.quantity + feeInBase));
        }
      }
    });

    depositList.forEach((deposit) => {
      const entry = ensureEntry(deposit.coin);
      entry.events.push({
        id: deposit._id,
        type: "DEPOSIT",
        timestamp: deposit.insertTime,
        quantity: deposit.amount,
        provider: deposit.provider,
        providerDisplayName: deposit.providerDisplayName,
        integrationId: deposit.integrationId,
      });
      entry.depositQuantity += deposit.amount;
      addQuantity(entry, deposit.integrationId, deposit.amount);
      entry.lastActivityAt = Math.max(entry.lastActivityAt, deposit.insertTime);
    });

    withdrawalList.forEach((withdrawal) => {
      const entry = ensureEntry(withdrawal.coin);
      entry.events.push({
        id: withdrawal._id,
        type: "WITHDRAWAL",
        timestamp: withdrawal.applyTime,
        quantity: withdrawal.amount,
        provider: withdrawal.provider,
        providerDisplayName: withdrawal.providerDisplayName,
        integrationId: withdrawal.integrationId,
      });
      entry.withdrawalQuantity += withdrawal.amount;
      addQuantity(entry, withdrawal.integrationId, -withdrawal.amount);
      entry.lastActivityAt = Math.max(entry.lastActivityAt, withdrawal.applyTime);
    });

    const tokens = Array.from(map.values())
      .map((entry) => {
        const sortedEvents = [...entry.events].sort((a, b) => a.timestamp - b.timestamp);

        // AVCO : prix d'achat moyen pondéré (même méthode que Binance "Prix garanti")
        const { avgCostBasis, realizedPnlAvco } = computeCostBasis(sortedEvents, entry.symbol);

        const averageBuyPrice =
          entry.buyQuantity > 0 ? entry.buyValueUsd / entry.buyQuantity : undefined;
        const averageSellPrice =
          entry.sellQuantity > 0 ? entry.sellValueUsd / entry.sellQuantity : undefined;

        const tradeSymbols = Array.from(entry.tradeSymbols);

        const preferredPrimary = (() => {
          if (tradeSymbols.length === 0) {
            return undefined;
          }
          const preferredQuotes = [
            "USDT",
            "USDC",
            "BUSD",
            "FDUSD",
            "TUSD",
            "USD",
            "EUR",
            "BTC",
            "ETH",
          ];

          const scored = tradeSymbols.map((symbol) => {
            const upper = symbol.toUpperCase();
            const quote =
              preferredQuotes.find((item) => upper.endsWith(item)) ?? upper.slice(-4);
            const score = preferredQuotes.indexOf(quote);
            return { symbol: upper, score: score === -1 ? Number.MAX_SAFE_INTEGER : score };
          });

          scored.sort((a, b) => a.score - b.score || a.symbol.localeCompare(b.symbol));
          return scored[0]?.symbol;
        })();

        return {
          symbol: entry.symbol,
          currentQuantity: entry.currentQuantity,
          quantityByIntegration: entry.quantityByIntegration,
          buyQuantity: entry.buyQuantity,
          sellQuantity: entry.sellQuantity,
          depositQuantity: entry.depositQuantity,
          withdrawalQuantity: entry.withdrawalQuantity,
          investedUsd: entry.investedUsd,
          realizedUsd: entry.realizedUsd,
          buyValueUsd: entry.buyValueUsd,
          sellValueUsd: entry.sellValueUsd,
          netProfitUsd: entry.sellValueUsd - entry.buyValueUsd,
          avgCostBasis,
          realizedPnlAvco,
          averageBuyPrice,
          averageSellPrice,
          lastActivityAt: entry.lastActivityAt,
          tradeSymbols,
          primarySymbol: preferredPrimary,
          events: sortedEvents,
        };
      })
      .map(({ quantityByIntegration, ...entry }) => {
        // Réconciliation du stock, source par source.
        //
        // Une plateforme qui publie ses soldes fait autorité pour SA part du
        // stock : les transactions servent au PRU et au PnL, mais il peut
        // manquer des opérations (poussière, staking, distributions…).
        //
        // En revanche elle ne dit rien des autres sources. Auparavant le solde
        // Binance écrasait la quantité globale : un actif détenu à la fois sur
        // Binance et sur un wallet on-chain n'affichait que la part Binance.
        // Seul Binance alimente aujourd'hui la table `balances`, donc tout le
        // reste du portefeuille disparaissait du compte.
        let reconciled = 0;
        const quantityBySource: SourceQuantity[] = [];

        const pushSource = (integrationId: string, quantity: number) => {
          // Le bruit de flottant ne doit pas créer de ligne fantôme.
          if (Math.abs(quantity) < 1e-12) return;
          const meta = integrationMeta.get(integrationId);
          quantityBySource.push({
            integrationId,
            provider: meta?.provider ?? "inconnu",
            providerDisplayName: meta?.providerDisplayName ?? "Source inconnue",
            quantity,
          });
          reconciled += quantity;
        };

        quantityByIntegration.forEach((quantity, integrationId) => {
          // Les sources sans solde publié (wallets on-chain, imports CSV)
          // restent calculées à partir de leurs événements.
          if (!integrationsReportingBalances.has(integrationId)) {
            pushSource(integrationId, quantity);
          }
        });

        integrationsReportingBalances.forEach((integrationId) => {
          // Absent de la liste des soldes = plus détenu sur cette plateforme :
          // `upsertBatch` purge les actifs que l'API ne renvoie plus.
          pushSource(
            integrationId,
            balanceByIntegrationAsset.get(`${integrationId}:${entry.symbol}`) ?? 0
          );
        });

        quantityBySource.sort((a, b) => b.quantity - a.quantity);

        return { ...entry, currentQuantity: reconciled, quantityBySource };
      })
      .sort((a, b) => b.investedUsd - a.investedUsd);

    return tokens;
  }, [balanceList, depositList, portfolioTradesList, withdrawalList]);

  const profitSummary = useMemo<ProfitSummary>(() => {
    if (portfolioTokens.length === 0) {
      return {
        totalProfitUsd: 0,
        costBasisUsd: 0,
        profitPercentage: 0,
        bestPerformer: null,
        worstPerformer: null,
      };
    }

    let totalBuyValueUsd = 0;
    let totalSellValueUsd = 0;

    portfolioTokens.forEach((token) => {
      totalBuyValueUsd += token.buyValueUsd;
      totalSellValueUsd += token.sellValueUsd;
    });

    const totalProfitUsd = totalSellValueUsd - totalBuyValueUsd;
    const costBasisUsd = Math.max(totalBuyValueUsd - totalSellValueUsd, 0);
    const profitPercentage =
      costBasisUsd > 0 ? (totalProfitUsd / costBasisUsd) * 100 : 0;

    const tokensWithActivity = [...portfolioTokens].filter(
      (token) => token.buyValueUsd > 0 || token.sellValueUsd > 0
    );

    tokensWithActivity.sort((a, b) => b.netProfitUsd - a.netProfitUsd);

    const bestToken = tokensWithActivity[0] ?? null;
    const worstToken =
      tokensWithActivity.length > 1
        ? tokensWithActivity[tokensWithActivity.length - 1]
        : bestToken;

    const mapTokenToPerformer = (token: PortfolioToken | null): PerformerSummary | null => {
      if (!token) {
        return null;
      }
      return {
        symbol: token.symbol,
        profitUsd: token.netProfitUsd,
        profitPercentage:
          token.buyValueUsd > 0 ? (token.netProfitUsd / token.buyValueUsd) * 100 : undefined,
      };
    };

    return {
      totalProfitUsd,
      costBasisUsd,
      profitPercentage,
      bestPerformer: mapTokenToPerformer(bestToken),
      worstPerformer: mapTokenToPerformer(worstToken),
    };
  }, [portfolioTokens]);

  const historySeries = useMemo<HistoryPoint[]>(() => {
    if (tradesList.length === 0) {
      return [];
    }

    const sortedAsc = [...tradesList].sort((a, b) => a.executedAt - b.executedAt);
    const byDay = new Map<string, { timestamp: number; profitUsd: number; netInvestedUsd: number }>();

    let cumulativeProfit = 0;
    let netInvestedUsd = 0;

    sortedAsc.forEach((trade) => {
      const valueUsd = trade.quoteQuantity ?? trade.price * trade.quantity;
      if (trade.side === "BUY") {
        cumulativeProfit -= valueUsd;
        netInvestedUsd += valueUsd;
      } else {
        cumulativeProfit += valueUsd;
        netInvestedUsd = Math.max(netInvestedUsd - valueUsd, 0);
      }

      const executedDate = new Date(trade.executedAt);
      const key = executedDate.toISOString().slice(0, 10);
      const timestamp = Date.UTC(
        executedDate.getUTCFullYear(),
        executedDate.getUTCMonth(),
        executedDate.getUTCDate()
      );

      byDay.set(key, {
        timestamp,
        profitUsd: cumulativeProfit,
        netInvestedUsd,
      });
    });

    return Array.from(byDay.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((point) => ({
        timestamp: point.timestamp,
        label: dayLabelFormatter.format(new Date(point.timestamp)),
        profitUsd: point.profitUsd,
        netInvestedUsd: point.netInvestedUsd,
      }));
  }, [tradesList]);

  const performanceSeries = useMemo<PerformancePoint[]>(() => {
    if (historySeries.length === 0) {
      return [];
    }

    const initialInvestment = historySeries[0].netInvestedUsd;
    const denominator = Math.abs(initialInvestment) > 0 ? Math.abs(initialInvestment) : null;

    return historySeries.map((point) => {
      const profitPercent =
        denominator ? (point.profitUsd / denominator) * 100 : 0;
      const benchmarkPercent =
        denominator ? ((point.netInvestedUsd - initialInvestment) / denominator) * 100 : 0;
      return {
        timestamp: point.timestamp,
        label: point.label,
        profitPercent,
        benchmarkPercent,
      };
    });
  }, [historySeries]);

  const isLoading =
    isConvexConfigured &&
    isLoaded &&
    !!user &&
    (trades === undefined ||
      deposits === undefined ||
      withdrawals === undefined ||
      balances === undefined);

  return {
    trades: tradesList,
    deposits: depositList,
    withdrawals: withdrawalList,
    transactions,
    tradeCount,
    totalVolume,
    totalFees,
    uniqueSymbols: uniqueAssets,
    lastTradeAt,
    isLoading,
    trackedScopes,
    portfolioTokens,
    profitSummary,
    historySeries,
    performanceSeries,
  };
}
