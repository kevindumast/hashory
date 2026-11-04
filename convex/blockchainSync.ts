import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { swapLikeHashes } from "../lib/evm-transfers";
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
  counterparty: v.optional(v.string()),
  protocol: v.optional(v.string()),
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
  counterparty: v.optional(v.string()),
  protocol: v.optional(v.string()),
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
      if (existing) {
        // Ligne enregistrée avant la lecture de l'adresse d'en face : on complète.
        const patch = enrichment(existing, d);
        if (patch) await ctx.db.patch(existing._id, patch);
        continue;
      }
      await ctx.db.insert("deposits", {
        integrationId: args.integrationId,
        depositId: d.depositId,
        coin: d.coin,
        amount: d.amount,
        network: d.network,
        status: d.status,
        insertTime: d.insertTime,
        txId: d.txId,
        ...(d.counterparty ? { counterparty: d.counterparty } : {}),
        ...(d.protocol !== undefined ? { protocol: d.protocol } : {}),
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
      if (existing) {
        const patch = enrichment(existing, w);
        if (patch) await ctx.db.patch(existing._id, patch);
        continue;
      }
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
        ...(w.counterparty ? { counterparty: w.counterparty } : {}),
        ...(w.protocol !== undefined ? { protocol: w.protocol } : {}),
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

/** Champs à compléter sur une ligne déjà enregistrée, ou null. */
function enrichment(
  existing: { counterparty?: string; protocol?: string },
  incoming: { counterparty?: string; protocol?: string }
): { counterparty?: string; protocol?: string } | null {
  const patch: { counterparty?: string; protocol?: string } = {};
  if (!existing.counterparty && incoming.counterparty) patch.counterparty = incoming.counterparty;
  if (!existing.protocol && incoming.protocol) patch.protocol = incoming.protocol;
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Hash des transactions d'un wallet qui ressemblent à un swap et dont le
 * DEX n'a pas encore été cherché. La synchronisation les traite par lots :
 * l'historique déjà importé se complète ainsi au fil des synchronisations.
 */
export const swapHashesToIdentify = internalQuery({
  args: { integrationId: v.id("integrations"), limit: v.number() },
  handler: async (ctx, { integrationId, limit }) => {
    const [deposits, withdrawals] = await Promise.all([
      ctx.db.query("deposits").withIndex("by_integration", (q) => q.eq("integrationId", integrationId)).collect(),
      ctx.db.query("withdrawals").withIndex("by_integration", (q) => q.eq("integrationId", integrationId)).collect(),
    ]);
    return swapLikeHashes(deposits, withdrawals).slice(0, limit);
  },
});

/**
 * Enregistre le DEX de transactions : toutes les lignes du hash le portent.
 * Une chaîne vide note « cherché, non reconnu », pour ne pas redemander.
 */
export const setSwapProtocols = internalMutation({
  args: {
    integrationId: v.id("integrations"),
    items: v.array(v.object({ txId: v.string(), protocol: v.string(), contract: v.optional(v.string()) })),
  },
  handler: async (ctx, { integrationId, items }) => {
    if (items.length === 0) return;
    const byHash = new Map(items.map((item) => [item.txId.toLowerCase(), item]));
    for (const table of ["deposits", "withdrawals"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_integration", (q) => q.eq("integrationId", integrationId))
        .collect();
      for (const row of rows) {
        const item = row.txId ? byHash.get(row.txId.toLowerCase()) : undefined;
        if (!item || row.protocol) continue;
        await ctx.db.patch(row._id, {
          protocol: item.protocol,
          // Le contrat appelé, sur un envoi : c'est l'adresse à montrer.
          ...(table === "withdrawals" && item.contract && !row.counterparty ? { counterparty: item.contract } : {}),
        });
      }
    }
  },
});
