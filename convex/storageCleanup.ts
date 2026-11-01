import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

/**
 * Migration ponctuelle : retire des séries quotidiennes les champs de
 * l'ancien moteur (`costBasisUsd`, `realizedPnlUsd`), plus écrits ni lus.
 * Se relance d'elle-même lot par lot jusqu'au bout de la table.
 *
 * Lancement : npx convex run storageCleanup:clearLegacySnapshotFields --prod
 * Une fois passée, ce fichier et les deux champs du schéma peuvent partir.
 */
export const clearLegacySnapshotFields = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("portfolioSnapshots").paginate({ cursor: cursor ?? null, numItems: 500 });
    let cleared = 0;
    for (const row of page.page) {
      if (row.costBasisUsd === undefined && row.realizedPnlUsd === undefined) continue;
      await ctx.db.patch(row._id, { costBasisUsd: undefined, realizedPnlUsd: undefined });
      cleared += 1;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.storageCleanup.clearLegacySnapshotFields, {
        cursor: page.continueCursor,
      });
    }
    return { cleared, done: page.isDone };
  },
});
