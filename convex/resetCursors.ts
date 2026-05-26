import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireUserId } from "./auth";

/**
 * Réinitialise tous les curseurs de sync d'une intégration.
 * Le prochain sync repartira de zéro.
 */
export const resetAllCursors = action({
  args: {
    integrationId: v.id("integrations"),
  },
  handler: async (ctx, args) => {
    const clerkUserId = await requireUserId(ctx);

    const integration = await ctx.runQuery(internal.integrations.getByIdInternal, {
      integrationId: args.integrationId,
    });

    if (!integration || integration.clerkUserId !== clerkUserId) {
      throw new Error("Not authorized");
    }

    const result: { deleted: number } = await ctx.runMutation(internal.integrations.deleteAllSyncStates, {
      integrationId: args.integrationId,
    });

    return {
      success: true,
      message: `${result.deleted} curseurs supprimés — le prochain sync repartira de zéro`,
      deleted: result.deleted,
    };
  },
});
