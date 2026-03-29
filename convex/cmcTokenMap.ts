import { action, internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const CMC_BASE_URL = "https://pro-api.coinmarketcap.com";

// ─── Query: lire le mapping depuis la base ───────────────────────────────────

// Only allow symbols with ASCII letters, digits, and dots (no $, no unicode)
const VALID_SYMBOL_RE = /^[A-Za-z0-9.]+$/;

// ─── Action: ajouter un token manuellement (sans appel API) ────────────────

export const addToken = action({
  args: {
    symbol: v.string(),
    cmcId: v.optional(v.number()),
    iconUrl: v.optional(v.string()),
    name: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, { symbol, cmcId, iconUrl, name, slug }): Promise<any> => {
    // Valider le symbol
    if (!VALID_SYMBOL_RE.test(symbol)) {
      throw new Error(`Invalid symbol: ${symbol}. Only ASCII letters, digits, and dots allowed.`);
    }

    // Construire ou utiliser iconUrl
    let finalIconUrl: string;
    if (iconUrl) {
      finalIconUrl = iconUrl;
    } else if (cmcId) {
      finalIconUrl = `https://s2.coinmarketcap.com/static/img/coins/64x64/${cmcId}.png`;
    } else {
      throw new Error("Either cmcId or iconUrl must be provided");
    }

    // Insert (will throw if symbol already exists)
    const id: string = await ctx.runMutation(internal.cmcTokenMap.insertOne, {
      symbol,
      cmcId,
      iconUrl: finalIconUrl,
      name,
      slug,
    });

    return { _id: id, symbol, cmcId, iconUrl: finalIconUrl, name, slug };
  },
});

// ─── Mutation interne: insert one token ─────────────────────────────────────

export const insertOne = internalMutation({
  args: {
    symbol: v.string(),
    cmcId: v.optional(v.number()),
    iconUrl: v.string(),
    name: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, { symbol, cmcId, iconUrl, name, slug }) => {
    // Check if exists
    const existing = await ctx.db
      .query("cmcTokenMap")
      .withIndex("by_symbol", (q) => q.eq("symbol", symbol))
      .unique();

    if (existing) {
      throw new Error(`Token ${symbol} already exists`);
    }

    return await ctx.db.insert("cmcTokenMap", {
      symbol,
      cmcId,
      iconUrl,
      name,
      slug,
    });
  },
});

// ─── Mutation interne: construire les iconUrl par batch ─────────────────────

export const buildIconUrlsBatch = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ processed: number; updated: number; hasMore: boolean }> => {
    let updated = 0;
    const batch = await ctx.db.query("cmcTokenMap").take(100);

    for (const token of batch) {
      // Skip if already has iconUrl
      if (token.iconUrl) {
        continue;
      }

      // Build iconUrl from cmcId if available
      if (token.cmcId) {
        const iconUrl = `https://s2.coinmarketcap.com/static/img/coins/64x64/${token.cmcId}.png`;
        await ctx.db.patch(token._id, { iconUrl });
        updated++;
      }
    }

    return { processed: batch.length, updated, hasMore: batch.length === 100 };
  },
});

// ─── Action: construire les iconUrl pour tous les tokens ──────────────────

export const buildIconUrlsForAll = action({
  args: {},
  handler: async (ctx) => {
    console.log("🖼️ Building icon URLs for all tokens...");

    let totalProcessed = 0;
    let totalUpdated = 0;
    let hasMore = true;

    while (hasMore) {
      const result = await ctx.runMutation(internal.cmcTokenMap.buildIconUrlsBatch);
      totalProcessed += result.processed;
      totalUpdated += result.updated;
      hasMore = result.hasMore;

      console.log(`  Batch: ${result.processed} processed, ${result.updated} updated`);
    }

    console.log(`✅ Icon URL build done: ${totalUpdated}/${totalProcessed} updated`);
    return { processed: totalProcessed, updated: totalUpdated };
  },
});

// ─── Internal mutation: clear la table par batch ────────────────────────────

export const clearAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    let totalDeleted = 0;
    let batch = await ctx.db.query("cmcTokenMap").take(100);

    while (batch.length > 0) {
      for (const t of batch) {
        await ctx.db.delete(t._id);
      }
      totalDeleted += batch.length;
      batch = await ctx.db.query("cmcTokenMap").take(100);
    }

    return { deleted: totalDeleted };
  },
});

export const getAll = query({
  args: {},
  handler: async (ctx): Promise<Record<string, string>> => {
    const tokens = await ctx.db.query("cmcTokenMap").collect();
    const map: Record<string, string> = {};
    for (const t of tokens) {
      if (!VALID_SYMBOL_RE.test(t.symbol)) continue;
      if (t.iconUrl) {
        map[t.symbol] = t.iconUrl;
      }
    }
    return map;
  },
});

// ─── Internal mutation: upsert les tokens en base ────────────────────────────

export const upsertBatch = internalMutation({
  args: {
    tokens: v.array(
      v.object({
        symbol: v.string(),
        cmcId: v.number(),
        iconUrl: v.string(),
        name: v.string(),
        slug: v.string(),
      })
    ),
  },
  handler: async (ctx, { tokens }) => {
    let inserted = 0;
    let updated = 0;

    for (const token of tokens) {
      const existing = await ctx.db
        .query("cmcTokenMap")
        .withIndex("by_symbol", (q) => q.eq("symbol", token.symbol))
        .unique();

      if (existing) {
        if (existing.cmcId !== token.cmcId || existing.iconUrl !== token.iconUrl || existing.name !== token.name || existing.slug !== token.slug) {
          await ctx.db.patch(existing._id, {
            cmcId: token.cmcId,
            iconUrl: token.iconUrl,
            name: token.name,
            slug: token.slug,
          });
          updated++;
        }
      } else {
        await ctx.db.insert("cmcTokenMap", {
          symbol: token.symbol,
          cmcId: token.cmcId,
          iconUrl: token.iconUrl,
          name: token.name,
          slug: token.slug,
        });
        inserted++;
      }
    }

    return { inserted, updated };
  },
});

// ─── Action: fetch CMC API et stocker en base ────────────────────────────────

export const syncFromCmc = action({
  args: {},
  handler: async (ctx) => {
    const apiKey = process.env.CMC_API_KEY;
    if (!apiKey) {
      throw new Error("CMC_API_KEY environment variable is not set in Convex.");
    }

    console.log("🪙 Clearing old token map...");
    await ctx.runMutation(internal.cmcTokenMap.clearAll);
    console.log("🪙 Starting CMC token map sync...");

    const params = new URLSearchParams({
      listing_status: "active",
      sort: "cmc_rank",
      limit: "5000",
    });

    const res = await fetch(
      `${CMC_BASE_URL}/v1/cryptocurrency/map?${params.toString()}`,
      {
        headers: {
          "X-CMC_PRO_API_KEY": apiKey,
          Accept: "application/json",
        },
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`CMC API error ${res.status}: ${err}`);
    }

    const data = await res.json();

    // Dédupliquer par symbol (garder le premier = meilleur rank)
    const seen = new Set<string>();
    const tokens: { symbol: string; cmcId: number; iconUrl: string; name: string; slug: string }[] = [];

    for (const coin of data.data) {
      // Skip symbols with invalid characters (non-ASCII, special chars, etc)
      if (!VALID_SYMBOL_RE.test(coin.symbol)) continue;
      if (!seen.has(coin.symbol)) {
        seen.add(coin.symbol);
        tokens.push({
          symbol: coin.symbol,
          cmcId: coin.id,
          iconUrl: `https://s2.coinmarketcap.com/static/img/coins/64x64/${coin.id}.png`,
          name: coin.name,
          slug: coin.slug,
        });
      }
    }

    // Upsert par batch de 500 (limite Convex mutations)
    const BATCH_SIZE = 500;
    let totalInserted = 0;
    let totalUpdated = 0;

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);
      const result = await ctx.runMutation(internal.cmcTokenMap.upsertBatch, {
        tokens: batch,
      });
      totalInserted += result.inserted;
      totalUpdated += result.updated;
    }

    console.log(
      `✅ CMC sync done: ${totalInserted} inserted, ${totalUpdated} updated, ${tokens.length} total tokens`
    );

    return { inserted: totalInserted, updated: totalUpdated, total: tokens.length };
  },
});
