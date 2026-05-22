import { mutation } from "./_generated/server";
import { v } from "convex/values";

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
