import { internalQuery, mutation, query, type ActionCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { decryptSecret, encryptSecret } from "./utils/encryption";
import { optionalUserId, requireUserId } from "./auth";
import {
  dataProviderLabel,
  isSupportedDataProvider,
  maskKey,
  type DataProviderId,
} from "../lib/data-providers";

/**
 * Une clé d'API est une suite de caractères imprimables sans espace. Les
 * bornes écartent la saisie accidentelle (un mot, un paragraphe collé) sans
 * présumer du format propre à chaque fournisseur.
 */
const KEY_RE = /^[\x21-\x7E]{8,256}$/;

/** Clés enregistrées par l'utilisateur, sous forme d'indice uniquement. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const clerkUserId = await optionalUserId(ctx);
    if (!clerkUserId) return [];

    const rows = await ctx.db
      .query("dataProviderKeys")
      .withIndex("by_user_provider", (q) => q.eq("clerkUserId", clerkUserId))
      .collect();

    return rows.map((row) => ({
      provider: row.provider,
      hint: row.hint,
      updatedAt: row.updatedAt,
    }));
  },
});

export const save = mutation({
  args: { provider: v.string(), key: v.string() },
  handler: async (ctx, { provider, key }) => {
    const clerkUserId = await requireUserId(ctx);

    if (!isSupportedDataProvider(provider)) {
      throw new ConvexError({ message: "Fournisseur inconnu." });
    }
    const trimmed = key.trim();
    if (!KEY_RE.test(trimmed)) {
      throw new ConvexError({
        message: "Cette clé ne ressemble pas à une clé d'API : vérifiez qu'elle est complète.",
      });
    }

    const fields = {
      encryptedKey: encryptSecret(trimmed),
      hint: maskKey(trimmed),
      updatedAt: Date.now(),
    };

    const existing = await ctx.db
      .query("dataProviderKeys")
      .withIndex("by_user_provider", (q) =>
        q.eq("clerkUserId", clerkUserId).eq("provider", provider)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("dataProviderKeys", { clerkUserId, provider, ...fields });
    }

    return { provider, hint: fields.hint };
  },
});

export const remove = mutation({
  args: { provider: v.string() },
  handler: async (ctx, { provider }) => {
    const clerkUserId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("dataProviderKeys")
      .withIndex("by_user_provider", (q) =>
        q.eq("clerkUserId", clerkUserId).eq("provider", provider)
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

export const getEncryptedInternal = internalQuery({
  args: { clerkUserId: v.string(), provider: v.string() },
  handler: async (ctx, { clerkUserId, provider }) => {
    const row = await ctx.db
      .query("dataProviderKeys")
      .withIndex("by_user_provider", (q) =>
        q.eq("clerkUserId", clerkUserId).eq("provider", provider)
      )
      .unique();
    return row?.encryptedKey ?? null;
  },
});

/**
 * Clé de l'utilisateur pour un fournisseur, déchiffrée, à n'utiliser que
 * dans l'action qui interroge ce fournisseur. Il n'existe volontairement
 * aucun repli sur une clé de l'hébergeur.
 *
 * Les erreurs sont des `ConvexError` : leur message atteint l'interface,
 * là où une `Error` ordinaire est masquée en production.
 */
export async function requireDataProviderKey(
  ctx: ActionCtx,
  clerkUserId: string,
  provider: DataProviderId
): Promise<string> {
  const encrypted = await ctx.runQuery(internal.dataProviderKeys.getEncryptedInternal, {
    clerkUserId,
    provider,
  });
  const key = encrypted ? decryptSecret(encrypted) : "";
  if (!key) {
    throw new ConvexError({
      code: "missing_data_provider_key",
      provider,
      message: `Clé ${dataProviderLabel(provider)} manquante : ajoutez-la dans Réglages › Clés d'API.`,
    });
  }
  return key;
}

/** À lever quand le fournisseur refuse la clé (401 / 403). */
export function rejectedDataProviderKey(provider: DataProviderId): ConvexError<{
  code: string;
  provider: string;
  message: string;
}> {
  return new ConvexError({
    code: "rejected_data_provider_key",
    provider,
    message: `${dataProviderLabel(provider)} refuse votre clé : vérifiez-la dans Réglages › Clés d'API.`,
  });
}
