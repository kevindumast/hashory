import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { encryptSecret } from "./utils/encryption";
import { requireUserId } from "./auth";

const bitstackTradeSchema = v.object({
  externalId: v.string(),
  executedAt: v.number(),
  fromAsset: v.string(),
  fromAmount: v.number(),
  toAsset: v.string(),
  toAmount: v.number(),
  fee: v.optional(v.number()),
  feeAsset: v.optional(v.string()),
  price: v.optional(v.number()),
});

const bitstackDepositSchema = v.object({
  externalId: v.string(),
  executedAt: v.number(),
  fiatCurrency: v.string(),
  fiatAmount: v.number(),
});

export const ingestCsv = mutation({
  args: {
    trades: v.array(bitstackTradeSchema),
    deposits: v.array(bitstackDepositSchema),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query("integrations")
      .withIndex("by_user_provider", (q) => q.eq("clerkUserId", userId).eq("provider", "bitstack"))
      .first();

    let integrationId;
    if (existing) {
      integrationId = existing._id;
      await ctx.db.patch(integrationId, { updatedAt: now, lastSyncedAt: now });
    } else {
      integrationId = await ctx.db.insert("integrations", {
        clerkUserId: userId,
        provider: "bitstack",
        displayName: args.displayName ?? "Bitstack",
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
    let depositsInserted = 0;

    for (const trade of args.trades) {
      const tradeId = `bitstack:${trade.externalId}`;
      const exists = await ctx.db
        .query("trades")
        .withIndex("by_integration_trade", (q) =>
          q.eq("integrationId", integrationId).eq("providerTradeId", tradeId)
        )
        .first();
      if (exists) continue;

      const computedPrice =
        trade.price ?? (trade.toAmount > 0 ? trade.fromAmount / trade.toAmount : 0);
      const symbol = `${trade.toAsset}${trade.fromAsset}`;

      await ctx.db.insert("trades", {
        integrationId,
        providerTradeId: tradeId,
        tradeType: "FIAT",
        symbol,
        side: "BUY",
        quantity: trade.toAmount,
        price: computedPrice,
        quoteQuantity: trade.fromAmount,
        fee: trade.fee,
        feeAsset: trade.feeAsset,
        isMaker: false,
        executedAt: trade.executedAt,
        fromAsset: trade.fromAsset,
        fromAmount: trade.fromAmount,
        toAsset: trade.toAsset,
        toAmount: trade.toAmount,
        createdAt: now,
      });
      tradesInserted++;
    }

    for (const deposit of args.deposits) {
      const orderId = `bitstack:${deposit.externalId}`;
      const exists = await ctx.db
        .query("fiatTransactions")
        .withIndex("by_integration_order", (q) =>
          q.eq("integrationId", integrationId).eq("orderId", orderId)
        )
        .first();
      if (exists) continue;

      await ctx.db.insert("fiatTransactions", {
        integrationId,
        orderId,
        source: "fiat_orders",
        txType: "1",
        fiatCurrency: deposit.fiatCurrency,
        fiatAmount: deposit.fiatAmount,
        status: "SUCCESS",
        createTime: deposit.executedAt,
        updateTime: deposit.executedAt,
        createdAt: now,
      });
      depositsInserted++;
    }

    return { tradesInserted, depositsInserted, integrationId };
  },
});
