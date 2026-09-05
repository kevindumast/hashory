import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { decryptSecret, encryptSecret } from "./utils/encryption";
import type { GenericId } from "convex/values";
import { optionalUserId, requireUserId } from "./auth";
import { SUPPORTED_PROVIDERS, WALLET_PROVIDERS } from "../lib/providers";
import type { SyncJob } from "../lib/sync-health";

export const list = query({
  args: {
    refreshToken: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    void args.refreshToken;
    const clerkUserId = await optionalUserId(ctx);
    if (!clerkUserId) {
      return [];
    }

    const integrations = await ctx.db
      .query("integrations")
      .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
      .order("desc")
      .collect();

    return Promise.all(integrations.map(async (integration) => {
      let publicAddress: string | null = null;
      if (WALLET_PROVIDERS.has(integration.provider)) {
        try {
          publicAddress = decryptSecret(integration.encryptedCredentials.apiKey);
        } catch {
          publicAddress = null;
        }
      }

      // État des étapes planifiées, lu directement chez le planificateur.
      // C'est la seule source qui dise si un travail est encore à venir ;
      // le statut, lui, n'est qu'un souvenir de la dernière écriture.
      const syncJobs: SyncJob[] = [];
      if (integration.syncStatus === "syncing") {
        for (const jobId of integration.syncJobIds ?? []) {
          const job = await ctx.db.system.get(jobId as GenericId<"_scheduled_functions">);
          if (!job) continue;
          syncJobs.push({
            state: job.state.kind,
            error: job.state.kind === "failed" ? job.state.error : null,
          });
        }
      }

      return {
        _id: integration._id,
        provider: integration.provider,
        displayName: integration.displayName ?? integration.provider,
        readOnly: integration.readOnly,
        scopes: integration.scopes ?? [],
        createdAt: integration.createdAt,
        updatedAt: integration.updatedAt,
        lastSyncedAt: integration.lastSyncedAt ?? null,
        syncStatus: integration.syncStatus ?? "idle",
        // Les synchronisations parties avant l'existence de ce champ n'ont
        // pas de départ enregistré. `updatedAt` en tient lieu : le passage
        // au statut « en cours » est justement une écriture, donc une borne
        // haute honnête pour une synchronisation qui n'a plus rien écrit
        // depuis. Ce repli ne sert que le temps que les comptes bloqués
        // soient repris en main.
        syncStartedAt: integration.syncStartedAt ?? integration.updatedAt,
        syncJobs,
        accountCreatedAt: integration.accountCreatedAt ?? null,
        // Absent = actif : le champ n'existe pas sur les comptes antérieurs.
        syncEnabled: integration.syncEnabled ?? true,
        publicAddress,
      };
    }));
  },
});

// Public: retourne les scopes de sync de l'utilisateur authentifié
export const listSyncScopes = query({
  args: {
    dataset: v.optional(v.string()),
    refreshToken: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    void args.refreshToken;
    const clerkUserId = await optionalUserId(ctx);
    if (!clerkUserId) return [];

    const integrations = await ctx.db
      .query("integrations")
      .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
      .collect();

    if (integrations.length === 0) return [];

    const scopes = [];
    for (const integration of integrations) {
      const states = await ctx.db
        .query("integrationSyncStates")
        .withIndex("by_integration_dataset_scope", (q) => q.eq("integrationId", integration._id))
        .collect();

      for (const state of states) {
        if (args.dataset && state.dataset !== args.dataset) continue;
        scopes.push({
          integrationId: integration._id,
          dataset: state.dataset,
          scope: state.scope,
          updatedAt: state.updatedAt,
        });
      }
    }
    return scopes;
  },
});

// Interne: même chose mais accepte clerkId explicite (pour les actions serveur planifiées)
export const listSyncScopesInternal = internalQuery({
  args: {
    clerkId: v.string(),
    dataset: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const integrations = await ctx.db
      .query("integrations")
      .withIndex("by_user", (q) => q.eq("clerkUserId", args.clerkId))
      .collect();

    if (integrations.length === 0) return [];

    const scopes = [];
    for (const integration of integrations) {
      const states = await ctx.db
        .query("integrationSyncStates")
        .withIndex("by_integration_dataset_scope", (q) => q.eq("integrationId", integration._id))
        .collect();

      for (const state of states) {
        if (args.dataset && state.dataset !== args.dataset) continue;
        scopes.push({
          integrationId: integration._id,
          dataset: state.dataset,
          scope: state.scope,
          updatedAt: state.updatedAt,
        });
      }
    }
    return scopes;
  },
});

export const upsert = mutation({
  args: {
    provider: v.string(),
    apiKey: v.string(),
    apiSecret: v.optional(v.string()),
    passphrase: v.optional(v.string()),
    readOnly: v.boolean(),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clerkUserId = await requireUserId(ctx);

    if (!SUPPORTED_PROVIDERS.includes(args.provider)) {
      throw new Error(`Unsupported provider: ${args.provider}`);
    }

    const now = Date.now();

    const encryptedCredentials = {
      apiKey: encryptSecret(args.apiKey),
      apiSecret: encryptSecret(args.apiSecret ?? ""),
      passphrase: args.passphrase ? encryptSecret(args.passphrase) : undefined,
    };

    const existingForProvider = await ctx.db
      .query("integrations")
      .withIndex("by_user_provider", (q) => q.eq("clerkUserId", clerkUserId).eq("provider", args.provider))
      .collect();

    const existing = existingForProvider.find((integration) => {
      try {
        return decryptSecret(integration.encryptedCredentials.apiKey) === args.apiKey;
      } catch {
        return false;
      }
    });

    if (existing) {
      await ctx.db.patch(existing._id, {
        encryptedCredentials,
        readOnly: args.readOnly,
        displayName: args.displayName,
        updatedAt: now,
      });
      return { status: "updated", provider: args.provider };
    }

    await ctx.db.insert("integrations", {
      clerkUserId: clerkUserId,
      provider: args.provider,
      displayName: args.displayName,
      readOnly: args.readOnly,
      encryptedCredentials,
      scopes: args.readOnly ? ["read"] : [],
      createdAt: now,
      updatedAt: now,
      accountCreatedAt: undefined,
    });

    return { status: "created", provider: args.provider };
  },
});

// Public: retourne l'intégration sans les credentials (vérifie la propriété)
export const getById = query({
  args: { integrationId: v.id("integrations") },
  handler: async (ctx, args) => {
    const clerkUserId = await requireUserId(ctx);
    const integration = await ctx.db.get(args.integrationId);
    if (!integration || integration.clerkUserId !== clerkUserId) return null;
    // Ne jamais exposer les credentials chiffrés au client
    const { encryptedCredentials: _creds, ...safe } = integration;
    return safe;
  },
});

// Interne: retourne l'intégration complète avec credentials (pour les actions serveur)
export const getByIdInternal = internalQuery({
  args: { integrationId: v.id("integrations") },
  handler: async (ctx, args) => {
    return (await ctx.db.get(args.integrationId)) ?? null;
  },
});

export const getSyncState = query({
  args: {
    integrationId: v.id("integrations"),
    dataset: v.string(),
    scope: v.string(),
  },
  handler: async (ctx, args) => {
    const clerkUserId = await requireUserId(ctx);
    const integration = await ctx.db.get(args.integrationId);
    if (!integration || integration.clerkUserId !== clerkUserId) return null;

    const record = await ctx.db
      .query("integrationSyncStates")
      .withIndex("by_integration_dataset_scope", (q) =>
        q.eq("integrationId", args.integrationId).eq("dataset", args.dataset).eq("scope", args.scope)
      )
      .first();

    if (!record) return null;

    let cursor: Record<string, unknown> | null = null;
    try {
      cursor = JSON.parse(record.cursor);
    } catch {
      cursor = null;
    }

    return { ...record, cursor };
  },
});

/**
 * Interne : le même curseur, sans exiger d'utilisateur connecté.
 *
 * Les étapes de synchronisation lancées en tâche de fond n'en ont pas :
 * une tâche planifiée s'exécute sans authentification. Passer par la
 * version publique les faisait échouer dès la lecture du premier curseur.
 * L'appartenance du compte a déjà été vérifiée à l'entrée de la
 * synchronisation, avant toute planification.
 */
export const getSyncStateInternal = internalQuery({
  args: {
    integrationId: v.id("integrations"),
    dataset: v.string(),
    scope: v.string(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("integrationSyncStates")
      .withIndex("by_integration_dataset_scope", (q) =>
        q.eq("integrationId", args.integrationId).eq("dataset", args.dataset).eq("scope", args.scope)
      )
      .first();

    if (!record) return null;

    let cursor: Record<string, unknown> | null = null;
    try {
      cursor = JSON.parse(record.cursor);
    } catch {
      cursor = null;
    }

    return { ...record, cursor };
  },
});

// Interne: mise à jour du curseur de sync (appelé depuis les actions serveur)
export const updateSyncState = internalMutation({
  args: {
    integrationId: v.id("integrations"),
    dataset: v.string(),
    scope: v.string(),
    cursor: v.any(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const cursorJson = JSON.stringify(args.cursor ?? {});

    const existing = await ctx.db
      .query("integrationSyncStates")
      .withIndex("by_integration_dataset_scope", (q) =>
        q.eq("integrationId", args.integrationId).eq("dataset", args.dataset).eq("scope", args.scope)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { cursor: cursorJson, updatedAt: now });
    } else {
      await ctx.db.insert("integrationSyncStates", {
        integrationId: args.integrationId,
        dataset: args.dataset,
        scope: args.scope,
        cursor: cursorJson,
        updatedAt: now,
      });
    }

    await ctx.db.patch(args.integrationId, { lastSyncedAt: now, updatedAt: now });
    return { status: "ok", updatedAt: now };
  },
});

export const purgeAllData = mutation({
  args: {
    integrationId: v.id("integrations"),
  },
  handler: async (ctx, args) => {
    const clerkUserId = await requireUserId(ctx);
    const integration = await ctx.db.get(args.integrationId);
    if (!integration || integration.clerkUserId !== clerkUserId) {
      throw new Error("Not authorized");
    }

    const id = args.integrationId;

    async function purgeTable(queryFn: () => Promise<Array<{ _id: any }>>) {
      const rows = await queryFn();
      for (const row of rows) await ctx.db.delete(row._id);
      return rows.length;
    }

    const trades = await purgeTable(() =>
      ctx.db.query("trades").withIndex("by_integration", (q) => q.eq("integrationId", id)).collect()
    );
    const orders = await purgeTable(() =>
      ctx.db.query("orders").withIndex("by_integration", (q) => q.eq("integrationId", id)).collect()
    );
    const convertTrades = await purgeTable(() =>
      ctx.db.query("convertTrades").withIndex("by_integration", (q) => q.eq("integrationId", id)).collect()
    );
    const deposits = await purgeTable(() =>
      ctx.db.query("deposits").withIndex("by_integration", (q) => q.eq("integrationId", id)).collect()
    );
    const withdrawals = await purgeTable(() =>
      ctx.db.query("withdrawals").withIndex("by_integration", (q) => q.eq("integrationId", id)).collect()
    );
    const fiatTransactions = await purgeTable(() =>
      ctx.db.query("fiatTransactions").withIndex("by_integration", (q) => q.eq("integrationId", id)).collect()
    );
    const balances = await purgeTable(() =>
      ctx.db.query("balances").withIndex("by_integration", (q) => q.eq("integrationId", id)).collect()
    );
    const syncStates = await purgeTable(() =>
      ctx.db.query("integrationSyncStates").withIndex("by_integration_dataset_scope", (q) => q.eq("integrationId", id)).collect()
    );

    return { trades, orders, convertTrades, deposits, withdrawals, fiatTransactions, balances, syncStates };
  },
});

export const deleteIntegration = mutation({
  args: {
    integrationId: v.id("integrations"),
  },
  handler: async (ctx, args) => {
    const clerkUserId = await requireUserId(ctx);
    const integration = await ctx.db.get(args.integrationId);
    if (!integration || integration.clerkUserId !== clerkUserId) {
      throw new Error("Not authorized");
    }

    const id = args.integrationId;

    async function purgeTable(queryFn: () => Promise<Array<{ _id: any }>>) {
      const rows = await queryFn();
      for (const row of rows) await ctx.db.delete(row._id);
      return rows.length;
    }

    await purgeTable(() =>
      ctx.db.query("trades").withIndex("by_integration", (q) => q.eq("integrationId", id)).collect()
    );
    await purgeTable(() =>
      ctx.db.query("orders").withIndex("by_integration", (q) => q.eq("integrationId", id)).collect()
    );
    await purgeTable(() =>
      ctx.db.query("convertTrades").withIndex("by_integration", (q) => q.eq("integrationId", id)).collect()
    );
    await purgeTable(() =>
      ctx.db.query("deposits").withIndex("by_integration", (q) => q.eq("integrationId", id)).collect()
    );
    await purgeTable(() =>
      ctx.db.query("withdrawals").withIndex("by_integration", (q) => q.eq("integrationId", id)).collect()
    );
    await purgeTable(() =>
      ctx.db.query("fiatTransactions").withIndex("by_integration", (q) => q.eq("integrationId", id)).collect()
    );
    await purgeTable(() =>
      ctx.db.query("balances").withIndex("by_integration", (q) => q.eq("integrationId", id)).collect()
    );
    await purgeTable(() =>
      ctx.db.query("integrationSyncStates").withIndex("by_integration_dataset_scope", (q) => q.eq("integrationId", id)).collect()
    );

    await ctx.db.delete(id);
    return { deleted: true };
  },
});

// Interne: suppression des curseurs (appelé depuis les actions serveur)
export const deleteAllSyncStates = internalMutation({
  args: {
    integrationId: v.id("integrations"),
  },
  handler: async (ctx, args) => {
    const states = await ctx.db
      .query("integrationSyncStates")
      .withIndex("by_integration_dataset_scope", (q) => q.eq("integrationId", args.integrationId))
      .collect();

    let deleted = 0;
    for (const state of states) {
      await ctx.db.delete(state._id);
      deleted++;
    }
    return { deleted };
  },
});

// Interne: mise à jour du statut de sync (appelé depuis les actions serveur)
export const updateSyncStatus = internalMutation({
  args: {
    integrationId: v.id("integrations"),
    syncStatus: v.union(v.literal("idle"), v.literal("syncing"), v.literal("synced"), v.literal("error")),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.db.get(args.integrationId);
    const payload: Record<string, unknown> = {
      syncStatus: args.syncStatus,
      updatedAt: Date.now(),
    };

    if (args.syncStatus === "syncing") {
      // Une synchronisation se déroule en plusieurs étapes, dont chacune
      // repose le statut. Seule la première marque le départ : le remettre à
      // chaque étape ferait paraître récente une synchronisation partie
      // depuis des heures.
      if (integration?.syncStatus !== "syncing") {
        payload.syncStartedAt = Date.now();
        payload.syncJobIds = [];
      }
    } else {
      // Le travail est fini : plus aucune tâche ne reste à suivre.
      payload.syncJobIds = [];
    }

    await ctx.db.patch(args.integrationId, payload);
    return { status: "ok" };
  },
});

/**
 * Interne : oublie les curseurs d'un compte, sans toucher aux données.
 *
 * Un curseur fait gagner du temps mais fige le passé : une correction
 * apportée à la lecture d'un relevé ne profite qu'aux entrées à venir, et
 * les anciennes restent telles qu'elles ont été mal comprises. L'oublier
 * fait relire l'historique complet, ce qui ne crée aucun doublon puisque
 * chaque insertion est dédoublonnée.
 */
export const clearSyncStates = internalMutation({
  args: {
    integrationId: v.id("integrations"),
  },
  handler: async (ctx, { integrationId }) => {
    const states = await ctx.db
      .query("integrationSyncStates")
      .withIndex("by_integration_dataset_scope", (q) => q.eq("integrationId", integrationId))
      .collect();

    for (const state of states) await ctx.db.delete(state._id);
    return { cleared: states.length };
  },
});

/**
 * Interne : enregistre une tâche planifiée par la synchronisation en cours.
 *
 * Sans cela, une étape planifiée qui échoue ne laisse aucune trace côté
 * application — le statut reste à « en cours » et rien ne permet de savoir
 * qu'il n'y a plus rien à attendre.
 */
export const recordSyncJob = internalMutation({
  args: {
    integrationId: v.id("integrations"),
    jobId: v.string(),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.db.get(args.integrationId);
    if (!integration) return { status: "missing" };

    const existing = integration.syncJobIds ?? [];
    if (existing.includes(args.jobId)) return { status: "ok" };

    await ctx.db.patch(args.integrationId, { syncJobIds: [...existing, args.jobId] });
    return { status: "ok" };
  },
});

/**
 * Arrête la synchronisation en cours.
 *
 * Ce qui est réellement interrompu : les étapes encore en attente, annulées
 * auprès du planificateur. Une étape déjà en train de s'exécuter va, elle,
 * jusqu'au bout — rien ne permet d'interrompre une action Convex en vol.
 * Le compte redevient disponible immédiatement dans les deux cas, et les
 * données déjà importées sont conservées : chaque insertion est dédoublonnée,
 * une synchronisation reprise ne crée donc pas de doublon.
 */
export const cancelSync = mutation({
  args: {
    integrationId: v.id("integrations"),
  },
  handler: async (ctx, { integrationId }) => {
    const clerkUserId = await requireUserId(ctx);

    const integration = await ctx.db.get(integrationId);
    if (!integration || integration.clerkUserId !== clerkUserId) {
      throw new Error("Intégration introuvable.");
    }

    let cancelled = 0;
    for (const jobId of integration.syncJobIds ?? []) {
      try {
        await ctx.scheduler.cancel(jobId as GenericId<"_scheduled_functions">);
        cancelled += 1;
      } catch {
        // Une tâche déjà terminée n'est plus annulable : rien à signaler.
      }
    }

    await ctx.db.patch(integrationId, {
      syncStatus: "idle",
      syncJobIds: [],
      updatedAt: Date.now(),
    });

    return { cancelled };
  },
});

// Interne: mise à jour des métadonnées (appelé depuis les actions serveur)
export const updateMetadata = internalMutation({
  args: {
    integrationId: v.id("integrations"),
    accountCreatedAt: v.optional(v.number()),
    lastSyncedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const payload: Record<string, unknown> = {};
    if (args.accountCreatedAt !== undefined) payload.accountCreatedAt = args.accountCreatedAt;
    if (args.lastSyncedAt !== undefined) payload.lastSyncedAt = args.lastSyncedAt;
    if (Object.keys(payload).length === 0) return { status: "noop" };
    await ctx.db.patch(args.integrationId, payload);
    return { status: "ok" };
  },
});

/**
 * Active ou suspend la synchronisation automatique d'un compte.
 *
 * Suspendre ne supprime rien : l'historique reste en base et continue
 * d'alimenter le portefeuille et la déclaration fiscale. Seules les
 * interrogations automatiques de l'API cessent, ce qui est le comportement
 * attendu d'un compte devenu dormant.
 */
export const setSyncEnabled = mutation({
  args: {
    integrationId: v.id("integrations"),
    enabled: v.boolean(),
  },
  handler: async (ctx, { integrationId, enabled }) => {
    const clerkUserId = await requireUserId(ctx);

    const integration = await ctx.db.get(integrationId);
    if (!integration || integration.clerkUserId !== clerkUserId) {
      throw new Error("Intégration introuvable.");
    }

    await ctx.db.patch(integrationId, { syncEnabled: enabled, updatedAt: Date.now() });
    return { syncEnabled: enabled };
  },
});
