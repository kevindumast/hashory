import { useMemo } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { isConvexConfigured } from "@/convex/client";

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

export type TradeRecord = {
  _id: Id<"trades">;
  integrationId: Id<"integrations">;
  provider: string;
  providerDisplayName: string;
  tradeType?: "SPOT" | "CONVERT" | "FIAT";
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

export type OverviewCard = {
  label: string;
  value: string;
  description: string;
};

export type AnalyticsStat = {
  label: string;
  value: string;
  trend: string;
  negative?: boolean;
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

export type TransactionEntry =
  | {
      type: "trade";
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
};

export type PortfolioToken = {
  symbol: string;
  currentQuantity: number;
  buyQuantity: number;
  sellQuantity: number;
  depositQuantity: number;
  withdrawalQuantity: number;
  investedUsd: number;
  realizedUsd: number;
  buyValueUsd: number;
  sellValueUsd: number;
  netProfitUsd: number;
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
      ? { clerkId: user.id, limit: 1000, refreshToken }
      : "skip"
  );

  const deposits = useQuery(
    api.deposits.listByUser,
    isConvexConfigured && isLoaded && user
      ? { clerkId: user.id, limit: 1000, refreshToken }
      : "skip"
  );

  const withdrawals = useQuery(
    api.withdrawals.listByUser,
    isConvexConfigured && isLoaded && user
      ? { clerkId: user.id, limit: 1000, refreshToken }
      : "skip"
  );

  const syncScopes = useQuery(
    api.integrations.listSyncScopes,
    isConvexConfigured && isLoaded && user
      ? { clerkId: user.id, dataset: DATASET_SPOT_TRADES, refreshToken }
      : "skip"
  );

  const tradesList = useMemo<TradeRecord[]>(() => {
    if (!Array.isArray(trades)) {
      return [];
    }
    return [...trades].sort((a, b) => b.executedAt - a.executedAt);
  }, [trades]);

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
    return assets;
  }, [depositList, tradesList, withdrawalList]);

  const uniqueAssets = trackedAssets.size;
  const lastTradeAt = tradesList[0]?.executedAt ?? null;

  const overviewCards = useMemo<OverviewCard[]>(
    () => [
      {
        label: "Imported trades",
        value: tradeCount.toString(),
        description: tradeCount === 0 ? "No transaction imported yet." : "Aggregated across all providers.",
      },
      {
        label: "Traded volume (USD)",
        value: currencyFormatter.format(totalVolume || 0),
        description:
          uniqueAssets > 0
            ? `${uniqueAssets} tracked asset${uniqueAssets > 1 ? "s" : ""}`
            : "Import your first Binance trades to populate the dashboard.",
      },
      {
        label: "Total fees",
        value: currencyFormatter.format(totalFees || 0),
        description: totalFees === 0 ? "No fee recorded so far." : "Sum of all reported commissions.",
      },
      {
        label: "Last transaction",
        value: lastTradeAt ? dateFormatter.format(new Date(lastTradeAt)) : "Never",
        description:
          tradeCount > 0 ? "Sync successful." : "Run a sync to import your trading history.",
      },
    ],
    [lastTradeAt, totalFees, totalVolume, tradeCount, uniqueAssets]
  );

  const navSeries = useMemo(() => {
    if (tradesList.length === 0) {
      return [];
    }
    const byDay = new Map<string, number>();
    const sortedAsc = [...tradesList].sort((a, b) => a.executedAt - b.executedAt);
    sortedAsc.forEach((trade) => {
      const date = new Date(trade.executedAt);
      const key = date.toISOString().slice(0, 10);
      const value = trade.quoteQuantity ?? trade.price * trade.quantity;
      byDay.set(key, (byDay.get(key) ?? 0) + value);
    });
    let cumulative = 0;
    return Array.from(byDay.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, value]) => {
        cumulative += value;
        const [year, month, day] = key.split("-").map((part) => Number(part));
        const timestamp = Date.UTC(year, month - 1, day);
        return {
          timestamp,
          label: dayLabelFormatter.format(new Date(timestamp)),
          nav: cumulative,
        };
      });
  }, [tradesList]);

  const allocation = useMemo(() => {
    if (tradesList.length === 0) {
      return [];
    }

    const byAsset = new Map<string, number>();
    tradesList.forEach((trade) => {
      const baseAsset = extractBaseAsset(trade.symbol);
      const value = trade.quoteQuantity ?? trade.price * trade.quantity;
      byAsset.set(baseAsset, (byAsset.get(baseAsset) ?? 0) + value);
    });

    const total = Array.from(byAsset.values()).reduce((sum, value) => sum + value, 0);
    if (total === 0) {
      return [];
    }

    return Array.from(byAsset.entries())
      .map(([symbol, value]) => ({
        symbol,
        share: (value / total) * 100,
        value,
      }))
      .sort((a, b) => b.share - a.share);
  }, [tradesList]);

  const latestTrades = useMemo(() => tradesList.slice(0, 20), [tradesList]);

  const analyticsStats = useMemo<AnalyticsStat[]>(
    () => [
      {
        label: "Active providers",
        value: new Set(tradesList.map((trade) => trade.providerDisplayName)).size.toString(),
        trend:
          tradeCount > 0
            ? `${tradeCount} imported trade${tradeCount > 1 ? "s" : ""}`
            : "No provider connected",
        negative: tradeCount === 0,
      },
      {
        label: "Tracked transactions",
        value: tradeCount.toString(),
        trend: tradeCount > 0 ? "Activity detected" : "Import your data",
        negative: tradeCount === 0,
      },
      {
        label: "Last activity",
        value: lastTradeAt ? dateFormatter.format(new Date(lastTradeAt)) : "Never",
        trend: lastTradeAt ? "Sync completed" : "No data yet",
        negative: !lastTradeAt,
      },
      {
        label: "Tracked assets",
        value: uniqueAssets.toString(),
        trend: "Distinct symbols",
        negative: tradeCount === 0,
      },
    ],
    [lastTradeAt, tradeCount, tradesList, uniqueAssets]
  );

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
    const entries: TransactionEntry[] = tradesList.map((trade) => ({
      type: "trade",
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

    return entries.sort((a, b) => {
      const getTime = (entry: TransactionEntry) => {
        if (entry.type === "trade") {
          return entry.executedAt;
        }
        return entry.timestamp;
      };
      return getTime(b) - getTime(a);
    });
  }, [depositList, tradesList, withdrawalList]);

  const portfolioTokens = useMemo<PortfolioToken[]>(() => {
    const map = new Map<string, {
      symbol: string;
      currentQuantity: number;
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

    tradesList.forEach((trade) => {
      // Handle CONVERT trades specially
      if (trade.tradeType === "CONVERT") {
        // Process fromAsset (sale)
        if (trade.fromAsset && trade.fromAmount !== undefined) {
          const fromEntry = ensureEntry(trade.fromAsset);
          fromEntry.convertQuantity -= trade.fromAmount;
          fromEntry.currentQuantity -= trade.fromAmount;
          fromEntry.sellQuantity += trade.fromAmount;
          fromEntry.lastActivityAt = Math.max(fromEntry.lastActivityAt, trade.executedAt);

          fromEntry.events.push({
            id: trade._id,
            type: "SELL",
            timestamp: trade.executedAt,
            quantity: trade.fromAmount,
            price: trade.price,
            valueUsd: trade.quoteQuantity ?? 0,
            fee: trade.fee,
            feeAsset: trade.feeAsset,
            provider: trade.provider,
            providerDisplayName: trade.providerDisplayName,
            integrationId: trade.integrationId,
          });
        }

        // Process toAsset (purchase)
        if (trade.toAsset && trade.toAmount !== undefined) {
          const toEntry = ensureEntry(trade.toAsset);
          toEntry.convertQuantity += trade.toAmount;
          toEntry.currentQuantity += trade.toAmount;
          toEntry.buyQuantity += trade.toAmount;
          toEntry.lastActivityAt = Math.max(toEntry.lastActivityAt, trade.executedAt);

          toEntry.events.push({
            id: trade._id,
            type: "BUY",
            timestamp: trade.executedAt,
            quantity: trade.toAmount,
            price: trade.price,
            valueUsd: trade.quoteQuantity ?? 0,
            fee: trade.fee,
            feeAsset: trade.feeAsset,
            provider: trade.provider,
            providerDisplayName: trade.providerDisplayName,
            integrationId: trade.integrationId,
          });
        }
      } else {
        // Regular BUY/SELL trades
        const baseAsset = extractBaseAsset(trade.symbol);
        const entry = ensureEntry(baseAsset);
        const valueUsd = trade.quoteQuantity ?? trade.price * trade.quantity;

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
        });

        entry.tradeSymbols.add(trade.symbol.toUpperCase());
        entry.lastActivityAt = Math.max(entry.lastActivityAt, trade.executedAt);

        if (trade.side === "BUY") {
          entry.buyQuantity += trade.quantity;
          entry.buyValueUsd += valueUsd;
          entry.investedUsd += valueUsd;
          entry.currentQuantity += trade.quantity;
        } else {
          entry.sellQuantity += trade.quantity;
          entry.sellValueUsd += valueUsd;
          entry.realizedUsd += valueUsd;
          entry.currentQuantity -= trade.quantity;
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
      entry.currentQuantity += deposit.amount;
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
      entry.currentQuantity -= withdrawal.amount;
      entry.lastActivityAt = Math.max(entry.lastActivityAt, withdrawal.applyTime);
    });

    return Array.from(map.values())
      .map((entry) => {
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

        const sortedEvents = [...entry.events].sort((a, b) => a.timestamp - b.timestamp);

        return {
          symbol: entry.symbol,
          currentQuantity: entry.currentQuantity,
          buyQuantity: entry.buyQuantity,
          sellQuantity: entry.sellQuantity,
          depositQuantity: entry.depositQuantity,
          withdrawalQuantity: entry.withdrawalQuantity,
          investedUsd: entry.investedUsd,
          realizedUsd: entry.realizedUsd,
          buyValueUsd: entry.buyValueUsd,
          sellValueUsd: entry.sellValueUsd,
          netProfitUsd: entry.sellValueUsd - entry.buyValueUsd,
          averageBuyPrice,
          averageSellPrice,
          lastActivityAt: entry.lastActivityAt,
          tradeSymbols,
          primarySymbol: preferredPrimary,
          events: sortedEvents,
        };
      })
      .sort((a, b) => b.investedUsd - a.investedUsd);
  }, [depositList, tradesList, withdrawalList]);

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
    (trades === undefined || deposits === undefined || withdrawals === undefined);

  return {
    overviewCards,
    navSeries,
    allocation,
    latestTrades,
    analyticsStats,
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
