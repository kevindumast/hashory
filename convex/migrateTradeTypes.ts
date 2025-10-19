import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Migration to add tradeType to existing trades based on their providerTradeId
 *
 * Usage from Convex dashboard:
 * Run: migrateTradeTypes:backfillTradeTypes
 */

export const backfillTradeTypes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const trades = await ctx.db.query("trades").collect();

    let updated = 0;
    let skipped = 0;

    for (const trade of trades) {
      // Skip if already has tradeType
      if (trade.tradeType) {
        skipped++;
        continue;
      }

      // Determine tradeType from providerTradeId prefix
      let tradeType: "SPOT" | "CONVERT" | "FIAT";

      if (trade.providerTradeId.startsWith("convert:")) {
        tradeType = "CONVERT";
      } else if (trade.providerTradeId.startsWith("fiat:")) {
        tradeType = "FIAT";
      } else {
        // Pure numeric IDs are SPOT trades
        tradeType = "SPOT";
      }

      await ctx.db.patch(trade._id, { tradeType });
      updated++;
    }

    return {
      total: trades.length,
      updated,
      skipped,
      message: `Migration complete: ${updated} trades updated, ${skipped} already had tradeType`,
    };
  },
});
