import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { encryptSecret } from "./utils/encryption";
import { requireUserId } from "./auth";

const finaryTradeSchema = v.object({
  externalId: v.string(),
  executedAt: v.number(),
  receivedAmount: v.number(),
  receivedCurrency: v.string(),
  sentAmount: v.number(),
  sentCurrency: v.string(),
  feeAmount: v.optional(v.number()),
  feeCurrency: v.optional(v.string()),
  description: v.string(),
});

const finaryWithdrawalSchema = v.object({
  externalId: v.string(),
  executedAt: v.number(),
  sentAmount: v.number(),
  sentCurrency: v.string(),
  feeAmount: v.optional(v.number()),
  feeCurrency: v.optional(v.string()),
  address: v.optional(v.string()),
  txHash: v.optional(v.string()),
});

export const ingestCsv = mutation({
  args: {
    trades: v.array(finaryTradeSchema),
    withdrawals: v.array(finaryWithdrawalSchema),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query("integrations")
      .withIndex("by_user_provider", (q) => q.eq("clerkUserId", userId).eq("provider", "finary"))
      .first();

    let integrationId;
    if (existing) {
      integrationId = existing._id;
      await ctx.db.patch(integrationId, { updatedAt: now, lastSyncedAt: now });
    } else {
      integrationId = await ctx.db.insert("integrations", {
        clerkUserId: userId,
        provider: "finary",
        displayName: args.displayName ?? "Finary",
        readOnly: true,
        encryptedCredentials: {
          apiKey: encryptSecret(""),
          apiSecret: encryptSecret(""),
        },
        scopes: ["read"],
        createdAt: now,
        updatedAt: now,
        lastSyncedAt: now,
      });
    }

    let tradesInserted = 0;
    let withdrawalsInserted = 0;

    for (const trade of args.trades) {
      const tradeId = `finary:${trade.externalId}`;
      const isSwap = trade.description.toLowerCase() === "swap";

      if (isSwap) {
        const exists = await ctx.db
          .query("convertTrades")
          .withIndex("by_integration_trade", (q) =>
            q.eq("integrationId", integrationId).eq("providerTradeId", tradeId)
          )
          .first();
        if (exists) continue;

        const price = trade.sentAmount > 0 ? trade.receivedAmount / trade.sentAmount : 0;

        await ctx.db.insert("convertTrades", {
          integrationId,
          providerTradeId: tradeId,
          orderStatus: "SUCCESS",
          fromAsset: trade.sentCurrency,
          fromAmount: trade.sentAmount,
          toAsset: trade.receivedCurrency,
          toAmount: trade.receivedAmount,
          price,
          fee: trade.feeAmount && trade.feeAmount > 0 ? trade.feeAmount : undefined,
          feeAsset: trade.feeCurrency,
          executedAt: trade.executedAt,
          createdAt: now,
        });
      } else {
        const exists = await ctx.db
          .query("trades")
          .withIndex("by_integration_trade", (q) =>
            q.eq("integrationId", integrationId).eq("providerTradeId", tradeId)
          )
          .first();
        if (exists) continue;

        const computedPrice = trade.receivedAmount > 0 ? trade.sentAmount / trade.receivedAmount : 0;
        const symbol = `${trade.receivedCurrency}${trade.sentCurrency}`;

        await ctx.db.insert("trades", {
          integrationId,
          providerTradeId: tradeId,
          tradeType: "FIAT",
          symbol,
          side: "BUY",
          quantity: trade.receivedAmount,
          price: computedPrice,
          quoteQuantity: trade.sentAmount,
          fee: trade.feeAmount && trade.feeAmount > 0 ? trade.feeAmount : undefined,
          feeAsset: trade.feeCurrency,
          isMaker: false,
          executedAt: trade.executedAt,
          fromAsset: trade.sentCurrency,
          fromAmount: trade.sentAmount,
          toAsset: trade.receivedCurrency,
          toAmount: trade.receivedAmount,
          createdAt: now,
        });
      }
      tradesInserted++;
    }

    for (const withdrawal of args.withdrawals) {
      const withdrawId = `finary:${withdrawal.externalId}`;
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
        txId: withdrawal.txHash,
        coin: withdrawal.sentCurrency,
        amount: withdrawal.sentAmount,
        address: withdrawal.address,
        fee: withdrawal.feeAmount ?? 0,
        status: "SUCCESS",
        applyTime: withdrawal.executedAt,
        createdAt: now,
      });
      withdrawalsInserted++;
    }

    return { tradesInserted, withdrawalsInserted, integrationId };
  },
});
