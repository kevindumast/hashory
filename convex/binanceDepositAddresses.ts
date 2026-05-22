import { action, internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { decryptSecret } from "./utils/encryption";
import type { ActionCtx } from "./_generated/server";
import HmacSHA256 from "crypto-js/hmac-sha256";

const BINANCE_API_URL = "https://api.binance.com";

// ─── Query: obtenir l'adresse de dépôt pour une pièce ────────────────────────

export const getAddress = query({
  args: { coin: v.string() },
  handler: async (ctx, { coin }) => {
    return await ctx.db
      .query("binanceDepositAddresses")
      .withIndex("by_coin", (q) => q.eq("coin", coin.toUpperCase()))
      .unique();
  },
});

// ─── Query: obtenir toutes les adresses ──────────────────────────────────────

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const addresses = await ctx.db.query("binanceDepositAddresses").collect();
    const map: Record<string, string> = {};
    for (const addr of addresses) {
      map[addr.coin] = addr.address;
    }
    return map;
  },
});

// ─── Mutation interne: upsert une adresse ────────────────────────────────────

export const upsertAddress = internalMutation({
  args: {
    coin: v.string(),
    address: v.string(),
    network: v.optional(v.string()),
  },
  handler: async (ctx, { coin, address, network }) => {
    const existing = await ctx.db
      .query("binanceDepositAddresses")
      .withIndex("by_coin", (q) => q.eq("coin", coin.toUpperCase()))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        address,
        network,
        updatedAt: Date.now(),
      });
      return { _id: existing._id, action: "updated" };
    } else {
      const id = await ctx.db.insert("binanceDepositAddresses", {
        coin: coin.toUpperCase(),
        address,
        network,
        updatedAt: Date.now(),
      });
      return { _id: id, action: "inserted" };
    }
  },
});

// ─── Action: syncer les adresses de dépôt depuis Binance ──────────────────────

export const syncFromBinance = action({
  args: {
    coins: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { coins }) => {
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw new Error("Binance credentials not configured");
    }

    // Coins à tracker (les principaux)
    const coinsToSync = coins ?? [
      "BTC",
      "ETH",
      "USDT",
      "USDC",
      "BNB",
      "SOL",
      "ADA",
      "XRP",
      "DOGE",
      "MATIC",
      "DOT",
      "LINK",
      "AVAX",
      "ATOM",
      "FIL",
      "INJ",
      "TAO",
      "ONDO",
      "FET",
      "GRT",
      "STRK",
    ];

    console.log(`🏦 Syncing ${coinsToSync.length} deposit addresses from Binance...`);

    let synced = 0;
    let failed = 0;

    for (const coin of coinsToSync) {
      try {
        const address = await fetchDepositAddress(apiKey, apiSecret, coin);
        if (address) {
          await ctx.runMutation(internal.binanceDepositAddresses.upsertAddress, {
            coin,
            address: address.address,
            network: address.network,
          });
          synced++;
          console.log(`  ✓ ${coin}: ${address.address.slice(0, 10)}...`);
        }
      } catch (error) {
        failed++;
        console.log(`  ✗ ${coin}: ${error}`);
      }
    }

    console.log(`✅ Sync done: ${synced} synced, ${failed} failed`);
    return { synced, failed, total: coinsToSync.length };
  },
});

// ─── Fonction utilitaire: fetch une adresse de dépôt ─────────────────────────

async function fetchDepositAddress(
  apiKey: string,
  apiSecret: string,
  coin: string
): Promise<{ address: string; network: string } | null> {
  const timestamp = Date.now();
  const params = new URLSearchParams({
    coin: coin.toUpperCase(),
    timestamp: timestamp.toString(),
  });

  // Signature HMAC
  const signature = HmacSHA256(params.toString(), apiSecret).toString();
  params.append("signature", signature);

  const res = await fetch(
    `${BINANCE_API_URL}/sapi/v1/capital/deposit/address?${params.toString()}`,
    {
      headers: {
        "X-MBX-APIKEY": apiKey,
      },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Binance API error ${res.status}: ${err}`);
  }

  const data = await res.json();

  return {
    address: data.address,
    network: data.coin, // Binance returns the coin as network identifier
  };
}
