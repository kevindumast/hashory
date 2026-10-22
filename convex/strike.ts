import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { encryptSecret } from "./utils/encryption";
import { requireUserId } from "./auth";

const tradeSchema = v.object({
  externalId: v.string(),
  executedAt: v.number(),
  side: v.union(v.literal("BUY"), v.literal("SELL")),
  fiatCurrency: v.string(),
  fiatAmount: v.number(),
  fee: v.number(),
  btcAmount: v.number(),
  price: v.optional(v.number()),
});

const transferSchema = v.object({
  externalId: v.string(),
  executedAt: v.number(),
  asset: v.string(),
  amount: v.number(),
  fee: v.number(),
  txId: v.optional(v.string()),
  destination: v.optional(v.string()),
});

/**
 * Import d'un relevé Strike, lu par `lib/strike.ts` côté navigateur. Chaque
 * ligne rejoint la table de son espèce — trades, dépôts, retraits — pour
 * que le grand livre la traite comme n'importe quelle autre source. Les
 * références Strike servent d'identifiants : réimporter un relevé, ou deux
 * relevés qui se chevauchent, n'ajoute rien en double.
 */
export const ingestCsv = mutation({
  args: {
    trades: v.array(tradeSchema),
    deposits: v.array(transferSchema),
    withdrawals: v.array(transferSchema),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query("integrations")
      .withIndex("by_user_provider", (q) => q.eq("clerkUserId", userId).eq("provider", "strike"))
      .first();

    let integrationId;
    if (existing) {
      integrationId = existing._id;
      await ctx.db.patch(integrationId, { updatedAt: now, lastSyncedAt: now });
    } else {
      integrationId = await ctx.db.insert("integrations", {
        clerkUserId: userId,
        provider: "strike",
        displayName: "Strike",
        readOnly: true,
        encryptedCredentials: { apiKey: encryptSecret(""), apiSecret: encryptSecret("") },
        scopes: ["read"],
        createdAt: now,
        updatedAt: now,
        lastSyncedAt: now,
      });
    }

    let tradesInserted = 0;
    for (const trade of args.trades) {
      const providerTradeId = `strike:${trade.externalId}`;
      const known = await ctx.db
        .query("trades")
        .withIndex("by_integration_trade", (q) => q.eq("integrationId", integrationId).eq("providerTradeId", providerTradeId))
        .first();
      if (known) continue;

      const isBuy = trade.side === "BUY";
      const fiat = trade.fiatCurrency.toUpperCase();
      await ctx.db.insert("trades", {
        integrationId,
        providerTradeId,
        // Achat ou vente contre fiat : les montants sont ceux réellement
        // débités et crédités, frais compris.
        tradeType: "FIAT",
        symbol: `BTC${fiat}`,
        side: trade.side,
        quantity: trade.btcAmount,
        price: trade.price ?? (trade.btcAmount > 0 ? trade.fiatAmount / trade.btcAmount : 0),
        quoteQuantity: trade.fiatAmount,
        fee: trade.fee > 0 ? trade.fee : undefined,
        feeAsset: trade.fee > 0 ? fiat : undefined,
        isMaker: false,
        executedAt: trade.executedAt,
        fromAsset: isBuy ? fiat : "BTC",
        fromAmount: isBuy ? trade.fiatAmount : trade.btcAmount,
        toAsset: isBuy ? "BTC" : fiat,
        toAmount: isBuy ? trade.btcAmount : trade.fiatAmount,
        createdAt: now,
      });
      tradesInserted++;
    }

    let depositsInserted = 0;
    for (const deposit of args.deposits) {
      const depositId = `strike:${deposit.externalId}`;
      const known = await ctx.db
        .query("deposits")
        .withIndex("by_integration_deposit", (q) => q.eq("integrationId", integrationId).eq("depositId", depositId))
        .first();
      if (known) continue;
      await ctx.db.insert("deposits", {
        integrationId,
        depositId,
        txId: deposit.txId,
        coin: deposit.asset,
        amount: deposit.amount,
        status: "SUCCESS",
        insertTime: deposit.executedAt,
        createdAt: now,
      });
      depositsInserted++;
    }

    let withdrawalsInserted = 0;
    for (const withdrawal of args.withdrawals) {
      const withdrawId = `strike:${withdrawal.externalId}`;
      const known = await ctx.db
        .query("withdrawals")
        .withIndex("by_integration_withdraw", (q) => q.eq("integrationId", integrationId).eq("withdrawId", withdrawId))
        .first();
      if (known) continue;
      await ctx.db.insert("withdrawals", {
        integrationId,
        withdrawId,
        txId: withdrawal.txId,
        coin: withdrawal.asset,
        amount: withdrawal.amount,
        // Frais dans l'actif retiré : le relevé les donne par devise.
        fee: withdrawal.fee,
        address: withdrawal.destination,
        status: "SUCCESS",
        applyTime: withdrawal.executedAt,
        createdAt: now,
      });
      withdrawalsInserted++;
    }

    return { integrationId, tradesInserted, depositsInserted, withdrawalsInserted };
  },
});
