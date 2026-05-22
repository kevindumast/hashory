import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

const DAY_MS = 86_400_000;

const QUOTE_ASSETS = [
  "USDT", "USDC", "BUSD", "USD", "FDUSD", "TUSD", "DAI",
  "BTC", "ETH", "BNB", "EUR", "GBP", "TRY", "AUD", "CAD", "BRL", "ARS",
];
const STABLECOINS = new Set(["USDT", "USDC", "BUSD", "FDUSD", "TUSD", "DAI", "USD"]);

function startOfUtcDay(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function extractBaseAsset(symbol: string): string {
  const upper = symbol.toUpperCase();
  for (const quote of QUOTE_ASSETS) {
    if (upper.endsWith(quote)) {
      const base = upper.slice(0, upper.length - quote.length);
      if (base) return base;
    }
  }
  return upper;
}

// ─── Public query: read user snapshots ────────────────────────────────

export const listByUser = query({
  args: {
    clerkId: v.string(),
    refreshToken: v.optional(v.number()),
  },
  handler: async (ctx, { clerkId }) => {
    const snapshots = await ctx.db
      .query("portfolioSnapshots")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .collect();
    return snapshots.sort((a, b) => a.dayUtc - b.dayUtc);
  },
});

export const getState = query({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    return await ctx.db
      .query("portfolioSnapshotState")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .unique();
  },
});

// ─── Internal queries for the recompute action ────────────────────────

export const collectUserEvents = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    const integrations = await ctx.db
      .query("integrations")
      .withIndex("by_user", (q) => q.eq("clerkUserId", clerkId))
      .collect();

    if (integrations.length === 0) {
      return { trades: [], deposits: [], withdrawals: [], fiat: [], orders: [] };
    }

    const integrationIds = integrations.map((i) => i._id);

    const trades = (
      await Promise.all(
        integrationIds.map((id) =>
          ctx.db
            .query("trades")
            .withIndex("by_integration", (q) => q.eq("integrationId", id))
            .collect()
        )
      )
    ).flat();

    const orders = (
      await Promise.all(
        integrationIds.map((id) =>
          ctx.db
            .query("orders")
            .withIndex("by_integration", (q) => q.eq("integrationId", id))
            .collect()
        )
      )
    ).flat();

    const deposits = (
      await Promise.all(
        integrationIds.map((id) =>
          ctx.db
            .query("deposits")
            .withIndex("by_integration", (q) => q.eq("integrationId", id))
            .collect()
        )
      )
    ).flat();

    const withdrawals = (
      await Promise.all(
        integrationIds.map((id) =>
          ctx.db
            .query("withdrawals")
            .withIndex("by_integration", (q) => q.eq("integrationId", id))
            .collect()
        )
      )
    ).flat();

    const fiat = (
      await Promise.all(
        integrationIds.map((id) =>
          ctx.db
            .query("fiatTransactions")
            .withIndex("by_integration", (q) => q.eq("integrationId", id))
            .collect()
        )
      )
    ).flat();

    return { trades, deposits, withdrawals, fiat, orders };
  },
});

export const getPriceMap = internalQuery({
  args: {
    symbols: v.array(v.string()),
    fromDay: v.number(),
    toDay: v.number(),
  },
  handler: async (ctx, { symbols, fromDay, toDay }) => {
    const result: Record<string, { dayUtc: number; closeUsd: number }[]> = {};
    for (const symbol of symbols) {
      const upper = symbol.toUpperCase();
      const rows = await ctx.db
        .query("tokenPriceHistory")
        .withIndex("by_symbol_day", (q) =>
          q.eq("symbol", upper).gte("dayUtc", fromDay).lte("dayUtc", toDay)
        )
        .collect();
      result[upper] = rows
        .map((r) => ({ dayUtc: r.dayUtc, closeUsd: r.closeUsd }))
        .sort((a, b) => a.dayUtc - b.dayUtc);
    }
    return result;
  },
});

// ─── Mutations: persist results ───────────────────────────────────────

export const deleteSnapshotsFrom = internalMutation({
  args: { clerkId: v.string(), fromDay: v.number() },
  handler: async (ctx, { clerkId, fromDay }) => {
    // Bounded batch delete. Convex caps mutations at ~16k ops, so we drain
    // page-by-page from the same action via repeated calls if needed.
    const batch = await ctx.db
      .query("portfolioSnapshots")
      .withIndex("by_user_day", (q) => q.eq("clerkId", clerkId).gte("dayUtc", fromDay))
      .take(2000);
    for (const doc of batch) {
      await ctx.db.delete(doc._id);
    }
    return { deleted: batch.length, hasMore: batch.length === 2000 };
  },
});

export const insertSnapshots = internalMutation({
  args: {
    clerkId: v.string(),
    snapshots: v.array(
      v.object({
        dayUtc: v.number(),
        valueUsd: v.number(),
        costBasisUsd: v.number(),
        realizedPnlUsd: v.number(),
        netInvestedUsd: v.number(),
        profitPercent: v.number(),
        btcPercent: v.number(),
      })
    ),
  },
  handler: async (ctx, { clerkId, snapshots }) => {
    const now = Date.now();
    for (const s of snapshots) {
      await ctx.db.insert("portfolioSnapshots", {
        clerkId,
        dayUtc: s.dayUtc,
        valueUsd: s.valueUsd,
        costBasisUsd: s.costBasisUsd,
        realizedPnlUsd: s.realizedPnlUsd,
        netInvestedUsd: s.netInvestedUsd,
        profitPercent: s.profitPercent,
        btcPercent: s.btcPercent,
        computedAt: now,
      });
    }
    return { inserted: snapshots.length };
  },
});

export const upsertState = internalMutation({
  args: {
    clerkId: v.string(),
    earliestEventDay: v.optional(v.number()),
    lastComputedDay: v.optional(v.number()),
    lastTradeAt: v.optional(v.number()),
  },
  handler: async (ctx, { clerkId, earliestEventDay, lastComputedDay, lastTradeAt }) => {
    const existing = await ctx.db
      .query("portfolioSnapshotState")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .unique();
    const payload = { clerkId, earliestEventDay, lastComputedDay, lastTradeAt, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("portfolioSnapshotState", payload);
  },
});

// ─── Core compute (pure JS) ───────────────────────────────────────────

type NormalizedEvent = {
  timestamp: number;
  symbol: string;
  /** Quantity entering (+) or leaving (−) the holdings */
  qtyDelta: number;
  /** USD spent (BUY > 0) or received (SELL > 0). Used for cost basis / realized pnl. */
  cashFlowUsd: number;
  /** Set when the event impacts cost basis */
  kind: "BUY" | "SELL" | "DEPOSIT" | "WITHDRAWAL";
};

type Trade = Doc<"trades">;
type Order = Doc<"orders">;
type Deposit = Doc<"deposits">;
type Withdrawal = Doc<"withdrawals">;
type Fiat = Doc<"fiatTransactions">;

function normalizeEvents(input: {
  trades: Trade[];
  orders: Order[];
  deposits: Deposit[];
  withdrawals: Withdrawal[];
  fiat: Fiat[];
}): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];

  // 1. Normal trades + CONVERT
  for (const trade of input.trades) {
    const valueUsd = trade.quoteQuantity ?? trade.price * trade.quantity;

    if (trade.tradeType === "CONVERT") {
      const fromIsStable = STABLECOINS.has((trade.fromAsset ?? "").toUpperCase());
      const toIsStable = STABLECOINS.has((trade.toAsset ?? "").toUpperCase());
      const convertValueUsd = fromIsStable
        ? trade.fromAmount ?? 0
        : toIsStable
          ? trade.toAmount ?? 0
          : valueUsd;

      if (trade.fromAsset && trade.fromAmount !== undefined) {
        events.push({
          timestamp: trade.executedAt,
          symbol: trade.fromAsset.toUpperCase(),
          qtyDelta: -trade.fromAmount,
          cashFlowUsd: convertValueUsd,
          kind: "SELL",
        });
      }
      if (trade.toAsset && trade.toAmount !== undefined) {
        events.push({
          timestamp: trade.executedAt,
          symbol: trade.toAsset.toUpperCase(),
          qtyDelta: trade.toAmount,
          cashFlowUsd: convertValueUsd,
          kind: "BUY",
        });
      }
      continue;
    }

    const baseAsset = extractBaseAsset(trade.symbol);
    const feeInBase = trade.fee && trade.feeAsset?.toUpperCase() === baseAsset ? trade.fee : 0;

    if (trade.side === "BUY") {
      events.push({
        timestamp: trade.executedAt,
        symbol: baseAsset,
        qtyDelta: trade.quantity - feeInBase,
        cashFlowUsd: valueUsd,
        kind: "BUY",
      });
    } else {
      events.push({
        timestamp: trade.executedAt,
        symbol: baseAsset,
        qtyDelta: -(trade.quantity + feeInBase),
        cashFlowUsd: valueUsd,
        kind: "SELL",
      });
    }
  }

  // 2. Orders not represented in trades — same dedup logic as the client hook (ordersAsTrades).
  // We aggregate by (integration|symbol|side) to avoid double-counting filled orders that were
  // also imported through /myTrades.
  const tradeQtyByKey = new Map<string, number>();
  for (const trade of input.trades) {
    if (trade.tradeType && trade.tradeType !== "SPOT") continue;
    const key = `${trade.integrationId}|${trade.symbol.toUpperCase()}|${trade.side}`;
    tradeQtyByKey.set(key, (tradeQtyByKey.get(key) ?? 0) + trade.quantity);
  }
  const ordersByKey = new Map<string, Order[]>();
  for (const order of input.orders) {
    if (order.quantity <= 0 || order.quoteQuantity <= 0) continue;
    const status = order.status?.toUpperCase() ?? "";
    if (status !== "FILLED" && status !== "PARTIALLY_FILLED") continue;
    const key = `${order.integrationId}|${order.symbol.toUpperCase()}|${order.side}`;
    const arr = ordersByKey.get(key) ?? [];
    arr.push(order);
    ordersByKey.set(key, arr);
  }
  for (const [key, list] of ordersByKey) {
    const orderQty = list.reduce((s, o) => s + o.quantity, 0);
    const covered = tradeQtyByKey.get(key) ?? 0;
    const delta = orderQty - covered;
    if (delta <= orderQty * 0.001) continue;
    const orderQuoteSum = list.reduce((s, o) => s + o.quoteQuantity, 0);
    const avgPrice = orderQty > 0 ? orderQuoteSum / orderQty : 0;
    const deltaQuote = delta * avgPrice;
    const latest = list.reduce((a, b) => (b.executedAt > a.executedAt ? b : a));
    const baseAsset = extractBaseAsset(latest.symbol);
    if (latest.side === "BUY") {
      events.push({
        timestamp: latest.executedAt,
        symbol: baseAsset,
        qtyDelta: delta,
        cashFlowUsd: deltaQuote,
        kind: "BUY",
      });
    } else {
      events.push({
        timestamp: latest.executedAt,
        symbol: baseAsset,
        qtyDelta: -delta,
        cashFlowUsd: deltaQuote,
        kind: "SELL",
      });
    }
  }

  // 3. Deposits
  for (const deposit of input.deposits) {
    events.push({
      timestamp: deposit.insertTime,
      symbol: deposit.coin.toUpperCase(),
      qtyDelta: deposit.amount,
      cashFlowUsd: 0,
      kind: "DEPOSIT",
    });
  }

  // 4. Withdrawals
  for (const withdrawal of input.withdrawals) {
    events.push({
      timestamp: withdrawal.applyTime,
      symbol: withdrawal.coin.toUpperCase(),
      qtyDelta: -withdrawal.amount,
      cashFlowUsd: 0,
      kind: "WITHDRAWAL",
    });
  }

  // 5. Fiat: only crypto-purchase rows actually move tokens
  for (const fiat_ of input.fiat) {
    const status = (fiat_.status ?? "").toUpperCase();
    if (status.includes("FAIL")) continue;
    if (!fiat_.cryptoCurrency || !fiat_.cryptoAmount || fiat_.cryptoAmount <= 0) continue;
    const isBuy = fiat_.txType === "0";
    events.push({
      timestamp: fiat_.updateTime,
      symbol: fiat_.cryptoCurrency.toUpperCase(),
      qtyDelta: isBuy ? fiat_.cryptoAmount : -fiat_.cryptoAmount,
      cashFlowUsd: fiat_.fiatAmount,
      kind: isBuy ? "BUY" : "SELL",
    });
  }

  events.sort((a, b) => a.timestamp - b.timestamp);
  return events;
}

type TokenState = {
  qty: number;
  avgCost: number;
  realizedPnl: number;
};

function applyEvent(state: TokenState, event: NormalizedEvent): TokenState {
  switch (event.kind) {
    case "BUY": {
      const newQty = state.qty + event.qtyDelta;
      const avgCost = newQty > 0
        ? (state.qty * state.avgCost + event.cashFlowUsd) / newQty
        : 0;
      return { qty: newQty, avgCost, realizedPnl: state.realizedPnl };
    }
    case "SELL": {
      const soldQty = -event.qtyDelta; // positive
      const proceeds = event.cashFlowUsd;
      const realized = state.realizedPnl + (proceeds - soldQty * state.avgCost);
      return {
        qty: Math.max(0, state.qty + event.qtyDelta),
        avgCost: state.avgCost,
        realizedPnl: realized,
      };
    }
    case "DEPOSIT":
      return { ...state, qty: state.qty + event.qtyDelta };
    case "WITHDRAWAL":
      return { ...state, qty: Math.max(0, state.qty + event.qtyDelta) };
  }
}

function buildSnapshots(
  events: NormalizedEvent[],
  prices: Record<string, { dayUtc: number; closeUsd: number }[]>,
  todayUtc: number
): {
  earliestEventDay: number;
  snapshots: {
    dayUtc: number;
    valueUsd: number;
    costBasisUsd: number;
    realizedPnlUsd: number;
    netInvestedUsd: number;
    profitPercent: number;
    btcPercent: number;
  }[];
} {
  if (events.length === 0) {
    return { earliestEventDay: todayUtc, snapshots: [] };
  }

  const earliestEventDay = startOfUtcDay(events[0].timestamp);

  // Forward-fill price lookup: at day D, return the most recent close ≤ D.
  // For perf we walk pointers per symbol since both events and snapshots are time-ordered.
  const priceCursors = new Map<string, { idx: number; current: number }>();
  for (const symbol of Object.keys(prices)) {
    priceCursors.set(symbol, { idx: -1, current: 0 });
  }
  function priceAt(symbol: string, day: number): number {
    if (STABLECOINS.has(symbol)) return 1;
    const series = prices[symbol];
    if (!series || series.length === 0) return 0;
    const cursor = priceCursors.get(symbol)!;
    while (cursor.idx + 1 < series.length && series[cursor.idx + 1].dayUtc <= day) {
      cursor.idx += 1;
      cursor.current = series[cursor.idx].closeUsd;
    }
    return cursor.current;
  }

  const tokenStates = new Map<string, TokenState>();
  let netInvestedUsd = 0;
  let eventIdx = 0;

  const snapshots: {
    dayUtc: number;
    valueUsd: number;
    costBasisUsd: number;
    realizedPnlUsd: number;
    netInvestedUsd: number;
    profitPercent: number;
    btcPercent: number;
  }[] = [];

  // BTC reference price for benchmark = price at (or before) the first day
  const btcSeries = prices["BTC"] ?? [];
  let btcInitial = 0;
  if (btcSeries.length > 0) {
    // Walk to the first day ≤ earliestEventDay
    for (let i = 0; i < btcSeries.length; i += 1) {
      if (btcSeries[i].dayUtc > earliestEventDay) break;
      btcInitial = btcSeries[i].closeUsd;
    }
    if (btcInitial === 0) btcInitial = btcSeries[0].closeUsd;
  }

  let costBasisInitial = 0; // updated lazily on first non-zero value

  for (let day = earliestEventDay; day <= todayUtc; day += DAY_MS) {
    // Apply all events whose timestamp falls within this day
    const dayEnd = day + DAY_MS;
    while (eventIdx < events.length && events[eventIdx].timestamp < dayEnd) {
      const ev = events[eventIdx];
      const prev = tokenStates.get(ev.symbol) ?? { qty: 0, avgCost: 0, realizedPnl: 0 };
      tokenStates.set(ev.symbol, applyEvent(prev, ev));
      if (ev.kind === "BUY") netInvestedUsd += ev.cashFlowUsd;
      else if (ev.kind === "SELL") netInvestedUsd = Math.max(0, netInvestedUsd - ev.cashFlowUsd);
      eventIdx += 1;
    }

    let valueUsd = 0;
    let costBasisUsd = 0;
    let realizedPnlUsd = 0;
    for (const [symbol, state] of tokenStates) {
      if (state.qty > 0) {
        valueUsd += state.qty * priceAt(symbol, day);
        costBasisUsd += state.qty * state.avgCost;
      }
      realizedPnlUsd += state.realizedPnl;
    }

    if (costBasisInitial === 0 && costBasisUsd > 0) {
      costBasisInitial = costBasisUsd;
    }

    const denom = costBasisInitial > 0 ? costBasisInitial : (netInvestedUsd > 0 ? netInvestedUsd : 1);
    const profitPercent = ((valueUsd - costBasisUsd + realizedPnlUsd) / denom) * 100;

    const btcNow = priceAt("BTC", day);
    const btcPercent = btcInitial > 0 ? ((btcNow - btcInitial) / btcInitial) * 100 : 0;

    snapshots.push({
      dayUtc: day,
      valueUsd,
      costBasisUsd,
      realizedPnlUsd,
      netInvestedUsd,
      profitPercent,
      btcPercent,
    });
  }

  return { earliestEventDay, snapshots };
}

// ─── Main action: recompute snapshots for a user ───────────────────────

export const recomputeForUser = action({
  args: {
    clerkId: v.string(),
    /** Force a full rebuild even if nothing changed since last compute */
    force: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { clerkId, force }
  ): Promise<{ status: string; days?: number; backfilled?: number }> => {
    // 1. Read current state to know if a rebuild is needed
    const state: Doc<"portfolioSnapshotState"> | null = await ctx.runQuery(
      internal.portfolioSnapshots.getStateInternal,
      { clerkId }
    );
    const todayUtc = startOfUtcDay(Date.now());

    // 2. Pull all events
    const raw: {
      trades: Trade[];
      orders: Order[];
      deposits: Deposit[];
      withdrawals: Withdrawal[];
      fiat: Fiat[];
    } = await ctx.runQuery(internal.portfolioSnapshots.collectUserEvents, { clerkId });
    const lastTradeAt = raw.trades.reduce((max, t) => Math.max(max, t.executedAt), 0);
    const totalEvents = raw.trades.length + raw.deposits.length + raw.withdrawals.length + raw.fiat.length + raw.orders.length;

    if (totalEvents === 0) {
      return { status: "no-events" };
    }

    // Skip recompute if nothing changed and snapshots already cover today
    if (
      !force &&
      state &&
      state.lastTradeAt === lastTradeAt &&
      state.lastComputedDay === todayUtc
    ) {
      return { status: "up-to-date" };
    }

    // 3. Normalize and identify all symbols touched
    const events = normalizeEvents(raw);
    const symbols = new Set<string>();
    for (const ev of events) symbols.add(ev.symbol);
    symbols.add("BTC"); // benchmark
    const earliestTs = events[0]?.timestamp ?? Date.now();

    // 4. Backfill any missing prices (idempotent — only fetches days not already stored)
    let backfilled = 0;
    for (const symbol of symbols) {
      const r: { inserted: number } = await ctx.runAction(internal.priceHistory.backfillSymbol, {
        symbol,
        fromTs: earliestTs,
      });
      backfilled += r.inserted;
    }

    // 5. Load all needed prices in one shot
    const fromDay = startOfUtcDay(earliestTs);
    const prices: Record<string, { dayUtc: number; closeUsd: number }[]> = await ctx.runQuery(
      internal.portfolioSnapshots.getPriceMap,
      { symbols: Array.from(symbols), fromDay, toDay: todayUtc }
    );

    // 6. Compute the daily series in memory
    const { earliestEventDay, snapshots } = buildSnapshots(events, prices, todayUtc);

    // 7. Drain the affected range first
    while (true) {
      const r: { hasMore: boolean } = await ctx.runMutation(
        internal.portfolioSnapshots.deleteSnapshotsFrom,
        { clerkId, fromDay: earliestEventDay }
      );
      if (!r.hasMore) break;
    }

    // 8. Insert the new series, chunked to stay under Convex mutation limits
    const CHUNK = 400;
    for (let i = 0; i < snapshots.length; i += CHUNK) {
      const slice = snapshots.slice(i, i + CHUNK);
      await ctx.runMutation(internal.portfolioSnapshots.insertSnapshots, {
        clerkId,
        snapshots: slice,
      });
    }

    await ctx.runMutation(internal.portfolioSnapshots.upsertState, {
      clerkId,
      earliestEventDay,
      lastComputedDay: todayUtc,
      lastTradeAt,
    });

    return { status: "rebuilt", days: snapshots.length, backfilled };
  },
});

export const getStateInternal = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    return await ctx.db
      .query("portfolioSnapshotState")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .unique();
  },
});
