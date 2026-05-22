import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

/**
 * Reset ALL sync cursors for an integration (every dataset, every symbol scope).
 * After reset, next sync will re-fetch everything from scratch.
 */
export const resetAllCursors = action({
  args: {
    integrationId: v.id("integrations"),
  },
  handler: async (ctx, args) => {
    console.log(`🗑️ Deleting ALL sync states for integration ${args.integrationId}`);

    const result: { deleted: number } = await ctx.runMutation(api.integrations.deleteAllSyncStates, {
      integrationId: args.integrationId,
    });

    console.log(`✅ Deleted ${result.deleted} sync state entries`);

    return {
      success: true,
      message: `${result.deleted} sync cursors deleted — next sync will start from scratch`,
      deleted: result.deleted,
    };
  },
});
