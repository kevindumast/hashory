import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUserId } from "./auth";
import { internal } from "./_generated/api";

const depositInput = v.object({
  depositId: v.string(),
  coin: v.string(),
  amount: v.number(),
  network: v.string(),
  status: v.string(),
  insertTime: v.number(),
  txId: v.string(),
});

const withdrawalInput = v.object({
  withdrawId: v.string(),
  coin: v.string(),
  amount: v.number(),
  network: v.string(),
  status: v.string(),
  applyTime: v.number(),
  txId: v.string(),
  fee: v.number(),
});

export const bulkInsertTransactions = mutation({
  args: {
    integrationId: v.id("integrations"),
    deposits: v.array(depositInput),
    withdrawals: v.array(withdrawalInput),
  },
  handler: async (ctx, args) => {
    const clerkUserId = await requireUserId(ctx);
    const integration = await ctx.runQuery(internal.integrations.getByIdInternal, {
      integrationId: args.integrationId,
    });
    if (!integration || integration.clerkUserId !== clerkUserId) {
      throw new Error("Not authorized");
    }

    const now = Date.now();
    let depositsInserted = 0;
    let withdrawalsInserted = 0;

    for (const d of args.deposits) {
      const existing = await ctx.db
        .query("deposits")
        .withIndex("by_integration_deposit", (q) =>
          q.eq("integrationId", args.integrationId).eq("depositId", d.depositId)
        )
        .first();
      if (existing) continue;
      await ctx.db.insert("deposits", {
        integrationId: args.integrationId,
        depositId: d.depositId,
        coin: d.coin,
        amount: d.amount,
        network: d.network,
        status: d.status,
        insertTime: d.insertTime,
        txId: d.txId,
        createdAt: now,
      });
      depositsInserted += 1;
    }

    for (const w of args.withdrawals) {
      const existing = await ctx.db
        .query("withdrawals")
        .withIndex("by_integration_withdraw", (q) =>
          q.eq("integrationId", args.integrationId).eq("withdrawId", w.withdrawId)
        )
        .first();
      if (existing) continue;
      await ctx.db.insert("withdrawals", {
        integrationId: args.integrationId,
        withdrawId: w.withdrawId,
        coin: w.coin,
        amount: w.amount,
        network: w.network,
        status: w.status,
        applyTime: w.applyTime,
        txId: w.txId,
        fee: w.fee,
        createdAt: now,
      });
      withdrawalsInserted += 1;
    }

    return { depositsInserted, withdrawalsInserted };
  },
});

/**
 * Renomme l'actif des dépôts et retraits d'une intégration, pour réparer les
 * lignes importées sous un symbole provisoire (un mint Solana tronqué, par
 * exemple). La synchro les ignore ensuite, puisqu'elle dédoublonne par
 * identifiant : sans cette réparation, le symbole fautif resterait.
 *
 * npx convex run blockchainSync:renameCoin '{"integrationId":"…","from":"BZLbGTNC","to":"IO"}'
 */
export const renameCoin = internalMutation({
  args: {
    integrationId: v.id("integrations"),
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, { integrationId, from, to }) => {
    const target = from.toUpperCase();
    let deposits = 0;
    let withdrawals = 0;

    const depositRows = await ctx.db
      .query("deposits")
      .withIndex("by_integration", (q) => q.eq("integrationId", integrationId))
      .collect();
    for (const row of depositRows) {
      if (row.coin.toUpperCase() !== target) continue;
      await ctx.db.patch(row._id, { coin: to });
      deposits += 1;
    }

    const withdrawalRows = await ctx.db
      .query("withdrawals")
      .withIndex("by_integration", (q) => q.eq("integrationId", integrationId))
      .collect();
    for (const row of withdrawalRows) {
      if (row.coin.toUpperCase() !== target) continue;
      await ctx.db.patch(row._id, { coin: to });
      withdrawals += 1;
    }

    return { deposits, withdrawals };
  },
});
