import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

/**
 * Action pour réinitialiser tous les cursors de synchronisation d'une intégration
 * Utile quand les cursors contiennent des données corrompues
 */
export const resetAllCursors = action({
  args: {
    integrationId: v.id("integrations"),
  },
  handler: async (ctx, args) => {
    const datasets = [
      "spot_trades",
      "convert_trades",
      "fiat_orders",
      "capital_deposits",
      "capital_withdrawals",
    ];

    console.log(`Resetting all cursors for integration ${args.integrationId}`);

    let resetCount = 0;
    let errorCount = 0;

    for (const dataset of datasets) {
      try {
        // For spot_trades, we need to reset all symbol scopes
        if (dataset === "spot_trades") {
          // Get all sync states for spot_trades
          const integration = await ctx.runQuery(api.integrations.getById, {
            integrationId: args.integrationId,
          });

          if (integration) {
            console.log(`🔄 Resetting spot trades cursors...`);
            // Reset default scope (will reset all symbol-specific cursors on next sync)
            await ctx.runMutation(api.integrations.updateSyncState, {
              integrationId: args.integrationId,
              dataset: "spot_trades",
              scope: "default",
              cursor: {
                initialized: false,
                lastTradeId: null,
                lastTradeTime: null,
              },
            });
            resetCount++;
          }
        } else {
          await ctx.runMutation(api.integrations.updateSyncState, {
            integrationId: args.integrationId,
            dataset,
            scope: "default",
            cursor: {
              initialized: false,
              lastUpdateTime: null,
              lastApplyTime: null,
              lastInsertTime: null,
              earliestUpdateTime: null,
              earliestApplyTime: null,
              earliestInsertTime: null,
            },
          });
          resetCount++;
        }
        console.log(`✅ Reset cursor for ${dataset}`);
      } catch (error) {
        console.error(`❌ Failed to reset cursor for ${dataset}:`, error);
        errorCount++;
      }
    }

    return {
      success: true,
      message: `${resetCount} cursors reset successfully${errorCount > 0 ? `, ${errorCount} failed` : ""}`,
      resetCount,
      errorCount,
    };
  },
});
