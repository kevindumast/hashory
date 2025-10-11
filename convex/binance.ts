import { action } from "./_generated/server";
import { v } from "convex/values";
import HmacSHA256 from "crypto-js/hmac-sha256";
import { decryptSecret } from "./utils/encryption";
import { api } from "./_generated/api";

type BinanceTrade = {
  symbol: string;
  id: number;
  orderId: number;
  price: string;
  qty: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  isBuyer: boolean;
  isMaker: boolean;
  isBestMatch: boolean;
};

const DATASET_SPOT_TRADES = "spot_trades";
const DEFAULT_BASE_URL = "https://api.binance.com";
const MAX_LIMIT = 1000;

export const syncTrades = action({
  args: {
    integrationId: v.id("integrations"),
    symbol: v.string(),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.runQuery(api.integrations.getById, {
      integrationId: args.integrationId,
    });

    if (!integration) {
      throw new Error("Integration introuvable.");
    }
    if (integration.provider !== "binance") {
      throw new Error("Integration provider mismatch.");
    }

    const { apiKey, apiSecret } = integration.encryptedCredentials;
    const decryptedKey = decryptSecret(apiKey);
    const decryptedSecret = decryptSecret(apiSecret);

    const scope = args.symbol.toUpperCase();
    const syncState = await ctx.runQuery(api.integrations.getSyncState, {
      integrationId: args.integrationId,
      dataset: DATASET_SPOT_TRADES,
      scope,
    });

    let fromId: number | null = null;
    let lastTradeTime: number | null = null;

    if (syncState?.cursor) {
      const cursor = syncState.cursor as { lastTradeId?: number; lastTradeTime?: number };
      if (typeof cursor.lastTradeId === "number") {
        fromId = cursor.lastTradeId;
      }
      if (typeof cursor.lastTradeTime === "number") {
        lastTradeTime = cursor.lastTradeTime;
      }
    }

    const baseUrl = DEFAULT_BASE_URL;

    let fetched = 0;
    let inserted = 0;
    let lastTradeId: number | null = fromId;

    while (true) {
      const searchParams = new URLSearchParams();
      searchParams.set("symbol", scope);
      searchParams.set("timestamp", Date.now().toString());
      searchParams.set("limit", MAX_LIMIT.toString());
      if (fromId !== null) {
        searchParams.set("fromId", (fromId + 1).toString());
      }

      const signature = HmacSHA256(searchParams.toString(), decryptedSecret).toString();
      searchParams.set("signature", signature);

      const response = await fetch(`${baseUrl}/api/v3/myTrades?${searchParams.toString()}`, {
        headers: {
          "X-MBX-APIKEY": decryptedKey,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Binance API error ${response.status}: ${errorText}`);
      }

      const trades = (await response.json()) as BinanceTrade[];
      if (!Array.isArray(trades) || trades.length === 0) {
        break;
      }

      fetched += trades.length;

      const formattedTrades = trades.map((trade) => {
        const side: "BUY" | "SELL" = trade.isBuyer ? "BUY" : "SELL";
        return {
          providerTradeId: trade.id.toString(),
          symbol: trade.symbol,
          side,
          quantity: Number(trade.qty),
          price: Number(trade.price),
          quoteQuantity: Number(trade.quoteQty),
          fee: Number(trade.commission),
          feeAsset: trade.commissionAsset ?? undefined,
          isMaker: Boolean(trade.isMaker),
          executedAt: Number(trade.time),
          raw: trade,
        };
      });

      const result = await ctx.runMutation(api.trades.ingestBatch, {
        integrationId: args.integrationId,
        trades: formattedTrades,
      });
      inserted += result.inserted;

      const lastTrade = trades[trades.length - 1];
      fromId = lastTrade.id;
      lastTradeId = lastTrade.id;
      lastTradeTime = lastTrade.time;

      if (trades.length < MAX_LIMIT) {
        break;
      }
    }

    await ctx.runMutation(api.integrations.updateSyncState, {
      integrationId: args.integrationId,
      dataset: DATASET_SPOT_TRADES,
      scope,
      cursor: {
        lastTradeId: lastTradeId ?? null,
        lastTradeTime: lastTradeTime ?? null,
      },
    });

    return {
      fetched,
      inserted,
      scope,
      cursor: {
        lastTradeId: lastTradeId ?? null,
        lastTradeTime: lastTradeTime ?? null,
      },
    };
  },
});
