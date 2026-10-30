import { internalQuery, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { LedgerInput } from "../lib/ledger";
import { storedWithdrawalFee } from "./withdrawals";

/**
 * Réunit, pour un utilisateur, tout ce dont le grand livre a besoin : les
 * six tables d'opérations de tous ses comptes. Snapshots de performance et
 * déclaration fiscale passent par ici, et lisent donc exactement les mêmes
 * données. Les champs bruts (`raw`) restent en base : ils ne servent à
 * aucun calcul et alourdiraient le transfert.
 */
export async function loadLedgerInput(
  ctx: QueryCtx,
  clerkId: string
): Promise<{ input: LedgerInput; accounts: { id: Id<"integrations">; provider: string; displayName: string }[] }> {
  const integrations = await ctx.db
    .query("integrations")
    .withIndex("by_user", (q) => q.eq("clerkUserId", clerkId))
    .collect();

  const input: LedgerInput = {
    trades: [],
    converts: [],
    orders: [],
    deposits: [],
    withdrawals: [],
    fiat: [],
    providers: {},
  };

  for (const integration of integrations) {
    const account = String(integration._id);
    input.providers![account] = integration.provider;

    const [trades, converts, orders, deposits, withdrawals, fiat] = await Promise.all([
      ctx.db.query("trades").withIndex("by_integration", (q) => q.eq("integrationId", integration._id)).collect(),
      ctx.db.query("convertTrades").withIndex("by_integration", (q) => q.eq("integrationId", integration._id)).collect(),
      ctx.db.query("orders").withIndex("by_integration", (q) => q.eq("integrationId", integration._id)).collect(),
      ctx.db.query("deposits").withIndex("by_integration", (q) => q.eq("integrationId", integration._id)).collect(),
      ctx.db.query("withdrawals").withIndex("by_integration", (q) => q.eq("integrationId", integration._id)).collect(),
      ctx.db.query("fiatTransactions").withIndex("by_integration", (q) => q.eq("integrationId", integration._id)).collect(),
    ]);

    for (const trade of trades) {
      input.trades.push({
        id: String(trade._id),
        account,
        providerTradeId: trade.providerTradeId,
        tradeType: trade.tradeType,
        symbol: trade.symbol,
        side: trade.side,
        quantity: trade.quantity,
        price: trade.price,
        quoteQuantity: trade.quoteQuantity,
        fee: trade.fee,
        feeAsset: trade.feeAsset,
        executedAt: trade.executedAt,
        fromAsset: trade.fromAsset,
        fromAmount: trade.fromAmount,
        toAsset: trade.toAsset,
        toAmount: trade.toAmount,
      });
    }
    for (const convert of converts) {
      input.converts!.push({
        id: String(convert._id),
        account,
        providerTradeId: convert.providerTradeId,
        status: convert.orderStatus,
        fromAsset: convert.fromAsset,
        fromAmount: convert.fromAmount,
        toAsset: convert.toAsset,
        toAmount: convert.toAmount,
        fee: convert.fee,
        feeAsset: convert.feeAsset,
        executedAt: convert.executedAt,
      });
    }
    for (const order of orders) {
      input.orders!.push({
        id: String(order._id),
        account,
        symbol: order.symbol,
        side: order.side,
        status: order.status,
        quantity: order.quantity,
        quoteQuantity: order.quoteQuantity,
        executedAt: order.executedAt,
      });
    }
    for (const deposit of deposits) {
      input.deposits.push({
        id: String(deposit._id),
        account,
        asset: deposit.coin,
        amount: deposit.amount,
        fee: deposit.fee,
        status: deposit.status,
        timestamp: deposit.insertTime,
        txId: deposit.txId,
      });
    }
    for (const withdrawal of withdrawals) {
      input.withdrawals.push({
        id: String(withdrawal._id),
        account,
        asset: withdrawal.coin,
        amount: withdrawal.amount,
        fee: storedWithdrawalFee(withdrawal),
        status: withdrawal.status,
        timestamp: withdrawal.applyTime,
        txId: withdrawal.txId,
      });
    }
    for (const record of fiat) {
      input.fiat!.push({
        id: String(record._id),
        account,
        orderId: record.orderId,
        txType: record.txType,
        fiatCurrency: record.fiatCurrency,
        fiatAmount: record.fiatAmount,
        cryptoCurrency: record.cryptoCurrency,
        cryptoAmount: record.cryptoAmount,
        fee: record.fee,
        status: record.status,
        timestamp: record.updateTime,
      });
    }
  }

  return {
    input,
    accounts: integrations.map((integration) => ({
      id: integration._id,
      provider: integration.provider,
      displayName: integration.displayName ?? integration.provider,
    })),
  };
}

/** Version appelable depuis une action (recalcul des snapshots). */
export const loadLedgerInputInternal = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    const { input, accounts } = await loadLedgerInput(ctx, clerkId);
    return { input, accounts: accounts.map((account) => String(account.id)) };
  },
});

/** Historique de change EUR/USD sur une plage. */
export const loadFxInternal = internalQuery({
  args: { fromDay: v.number(), toDay: v.number() },
  handler: async (ctx, { fromDay, toDay }) => {
    const rows = await ctx.db
      .query("fxRateHistory")
      .withIndex("by_day", (q) => q.gte("dayUtc", fromDay).lte("dayUtc", toDay))
      .collect();
    return rows.map((row) => ({ dayUtc: row.dayUtc, eurPerUsd: row.eurPerUsd }));
  },
});

/** Série de cours d'un actif : un appel par actif reste sous les limites de lecture. */
export const loadPriceSeriesInternal = internalQuery({
  args: { symbol: v.string(), fromDay: v.number(), toDay: v.number() },
  handler: async (ctx, { symbol, fromDay, toDay }) => {
    const rows = await ctx.db
      .query("tokenPriceHistory")
      .withIndex("by_symbol_day", (q) => q.eq("symbol", symbol).gte("dayUtc", fromDay).lte("dayUtc", toDay))
      .collect();
    return rows.map((row) => ({ dayUtc: row.dayUtc, closeUsd: row.closeUsd }));
  },
});
