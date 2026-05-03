import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUserId } from "./auth";

const spotTradeSchema = v.object({
  orderId: v.string(),
  symbol: v.string(),
  side: v.union(v.literal("BUY"), v.literal("SELL")),
  avgFilledPrice: v.number(),
  filledAmount: v.number(),
  filledVolume: v.number(),
  fee: v.number(),
  feeAsset: v.string(),
  executedAt: v.number(),
});

const convertSchema = v.object({
  sellAsset: v.string(),
  sellAmount: v.number(),
  buyAsset: v.string(),
  buyAmount: v.number(),
  symbol: v.string(),
  side: v.union(v.literal("BUY"), v.literal("SELL")),
  executedAt: v.number(),
});

const depositSchema = v.object({
  hash: v.string(),
  coin: v.string(),
  amount: v.number(),
  fee: v.number(),
  address: v.string(),
  network: v.string(),
  executedAt: v.number(),
});

const withdrawalSchema = v.object({
  hash: v.string(),
  coin: v.string(),
  amount: v.number(),
  fee: v.number(),
  address: v.string(),
  network: v.string(),
  executedAt: v.number(),
});

const transferSchema = v.object({
  transferId: v.string(),
  account: v.string(),
  coin: v.string(),
  amount: v.number(),
  fee: v.optional(v.number()),
  executedAt: v.number(),
});

export const ingestXlsx = mutation({
  args: {
    integrationId: v.id("integrations"),
    spotTrades: v.array(spotTradeSchema),
    converts: v.array(convertSchema),
    deposits: v.array(depositSchema),
    withdrawals: v.array(withdrawalSchema),
    transfers: v.array(transferSchema),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();

    const integration = await ctx.db.get(args.integrationId);
    if (!integration || integration.clerkUserId !== userId) {
      throw new Error("Intégration introuvable.");
    }
    if (integration.provider !== "kucoin") {
      throw new Error("Cette intégration n'est pas de type KuCoin.");
    }

    const { integrationId } = args;
    let spotInserted = 0;
    let convertsInserted = 0;
    let depositsInserted = 0;
    let withdrawalsInserted = 0;
    let transfersInserted = 0;

    for (const trade of args.spotTrades) {
      const providerTradeId = `kucoin-order:${trade.orderId}`;
      const exists = await ctx.db
        .query("trades")
        .withIndex("by_integration_trade", (q) =>
          q.eq("integrationId", integrationId).eq("providerTradeId", providerTradeId)
        )
        .first();
      if (exists) continue;

      const fromAsset = trade.side === "BUY"
        ? trade.symbol.replace(/-?USDT$|-?USDC$|-?BTC$|-?ETH$|-?KCS$/, "")
        : trade.symbol.split("-")[0] ?? trade.symbol;

      await ctx.db.insert("trades", {
        integrationId,
        providerTradeId,
        providerOrderId: trade.orderId,
        tradeType: "SPOT",
        symbol: trade.symbol.replace("-", ""),
        side: trade.side,
        quantity: trade.filledAmount,
        price: trade.avgFilledPrice,
        quoteQuantity: trade.filledVolume,
        fee: trade.fee > 0 ? trade.fee : undefined,
        feeAsset: trade.feeAsset || undefined,
        isMaker: false,
        executedAt: trade.executedAt,
        createdAt: now,
      });
      spotInserted++;
    }

    for (const convert of args.converts) {
      const providerTradeId = `kucoin-xlsx-convert:${convert.executedAt}:${convert.sellAmount}:${convert.sellAsset}`;
      const exists = await ctx.db
        .query("trades")
        .withIndex("by_integration_trade", (q) =>
          q.eq("integrationId", integrationId).eq("providerTradeId", providerTradeId)
        )
        .first();
      if (exists) continue;

      const quantity = convert.side === "BUY" ? convert.buyAmount : convert.sellAmount;
      const quoteQuantity = convert.side === "BUY" ? convert.sellAmount : convert.buyAmount;
      const price = quantity > 0 ? quoteQuantity / quantity : 0;
      const inversePrice = quoteQuantity > 0 ? quantity / quoteQuantity : undefined;

      await ctx.db.insert("trades", {
        integrationId,
        providerTradeId,
        tradeType: "CONVERT",
        symbol: convert.symbol,
        side: convert.side,
        quantity,
        price,
        quoteQuantity,
        isMaker: false,
        executedAt: convert.executedAt,
        fromAsset: convert.sellAsset,
        fromAmount: convert.sellAmount,
        toAsset: convert.buyAsset,
        toAmount: convert.buyAmount,
        createdAt: now,
      });

      await ctx.db.insert("convertTrades", {
        integrationId,
        providerTradeId,
        orderStatus: "SUCCESS",
        fromAsset: convert.sellAsset,
        fromAmount: convert.sellAmount,
        toAsset: convert.buyAsset,
        toAmount: convert.buyAmount,
        price,
        inversePrice,
        executedAt: convert.executedAt,
        createdAt: now,
      });

      convertsInserted++;
    }

    for (const deposit of args.deposits) {
      const depositId = `kucoin-deposit:${deposit.hash}`;
      const exists = await ctx.db
        .query("deposits")
        .withIndex("by_integration_deposit", (q) =>
          q.eq("integrationId", integrationId).eq("depositId", depositId)
        )
        .first();
      if (exists) continue;

      await ctx.db.insert("deposits", {
        integrationId,
        depositId,
        txId: deposit.hash || undefined,
        coin: deposit.coin,
        amount: deposit.amount,
        network: deposit.network || undefined,
        status: "SUCCESS",
        address: deposit.address || undefined,
        insertTime: deposit.executedAt,
        createdAt: now,
      });
      depositsInserted++;
    }

    for (const withdrawal of args.withdrawals) {
      const withdrawId = `kucoin-withdrawal:${withdrawal.hash}`;
      const exists = await ctx.db
        .query("withdrawals")
        .withIndex("by_integration_withdraw", (q) =>
          q.eq("integrationId", integrationId).eq("withdrawId", withdrawId)
        )
        .first();
      if (exists) continue;

      await ctx.db.insert("withdrawals", {
        integrationId,
        withdrawId,
        txId: withdrawal.hash || undefined,
        coin: withdrawal.coin,
        amount: withdrawal.amount,
        fee: withdrawal.fee,
        network: withdrawal.network || undefined,
        address: withdrawal.address || undefined,
        status: "SUCCESS",
        applyTime: withdrawal.executedAt,
        createdAt: now,
      });
      withdrawalsInserted++;
    }

    for (const transfer of args.transfers) {
      const exists = await ctx.db
        .query("internalTransfers")
        .withIndex("by_integration_transfer", (q) =>
          q.eq("integrationId", integrationId).eq("transferId", transfer.transferId)
        )
        .first();
      if (exists) continue;

      await ctx.db.insert("internalTransfers", {
        integrationId,
        transferId: transfer.transferId,
        account: transfer.account,
        coin: transfer.coin,
        amount: transfer.amount,
        fee: transfer.fee && transfer.fee > 0 ? transfer.fee : undefined,
        executedAt: transfer.executedAt,
        createdAt: now,
      });
      transfersInserted++;
    }

    return { spotInserted, convertsInserted, depositsInserted, withdrawalsInserted, transfersInserted };
  },
});
