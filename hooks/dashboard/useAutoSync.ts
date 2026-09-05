"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { isConvexConfigured } from "@/convex/client";
import { FILE_IMPORT_PROVIDERS } from "@/lib/providers";
import type { Id } from "@/convex/_generated/dataModel";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";
import { errorMessage, toast } from "@/lib/toast";

/** Au-delà de ce délai sans synchronisation, une source est considérée périmée. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Délai minimal entre deux tentatives automatiques.
 *
 * Sans ce garde-fou, une source qui échoue verrait sa synchronisation
 * relancée à chaque rechargement de page, puisque `lastSyncedAt` ne
 * progresserait jamais.
 */
const RETRY_COOLDOWN_MS = 60 * 60 * 1000;

const ATTEMPT_STORAGE_KEY = "hashory:auto-sync:last-attempt";


function readLastAttempt(): number {
  try {
    return Number(window.localStorage.getItem(ATTEMPT_STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeLastAttempt(timestamp: number) {
  try {
    window.localStorage.setItem(ATTEMPT_STORAGE_KEY, String(timestamp));
  } catch {
    /* stockage indisponible : on retentera au prochain chargement */
  }
}

/**
 * Resynchronise en arrière-plan les sources dont les données datent de plus
 * de 24 heures.
 *
 * Trois principes gouvernent ce comportement.
 *
 * 1. **Incrémental.** On appelle directement l'action de synchronisation, qui
 *    reprend à son curseur. On ne réinitialise surtout pas les curseurs :
 *    cela relirait tout l'historique à chaque fois, ce que fait le bouton de
 *    resynchronisation manuelle, et seulement lui.
 * 2. **Une fois par jour, pas à chaque visite.** Le déclencheur est l'âge de
 *    la donnée, pas l'ouverture de l'application.
 * 3. **Séquentiel et discret.** Les sources sont traitées l'une après
 *    l'autre pour ne pas saturer les API, et l'utilisateur n'est prévenu que
 *    si quelque chose se passe réellement.
 */
export function useAutoSync() {
  const { integrations, isLoadingIntegrations, refresh } = useDashboardData();

  const syncBinance = useAction(api.binance.syncAccount);
  const syncKucoin = useAction(api.kucoin.syncAccount);
  const syncKraken = useAction(api.kraken.syncAccount);
  const syncKaspa = useAction(api.kaspa.syncKaspaWallet);
  const syncEthereum = useAction(api.ethereum.syncEthereumWallet);
  const syncSolana = useAction(api.solana.syncSolanaWallet);
  const syncBitcoin = useAction(api.bitcoin.syncBitcoinWallet);
  const syncTao = useAction(api.tao.syncTaoWallet);

  // Une seule campagne par session, quels que soient les re-rendus.
  const hasRunRef = useRef(false);

  const runSync = useCallback(
    async (integrationId: Id<"integrations">, provider: string) => {
      const argument = { integrationId };
      switch (provider) {
        case "binance":
          return syncBinance(argument);
        case "kucoin":
          return syncKucoin(argument);
        case "kraken":
          return syncKraken(argument);
        case "kaspa":
          return syncKaspa(argument);
        case "ethereum":
          return syncEthereum(argument);
        case "solana":
          return syncSolana(argument);
        case "bitcoin":
          return syncBitcoin(argument);
        case "tao":
          return syncTao(argument);
        default:
          return null;
      }
    },
    [syncBinance, syncKucoin, syncKraken, syncKaspa, syncEthereum, syncSolana, syncBitcoin, syncTao]
  );

  useEffect(() => {
    if (!isConvexConfigured || isLoadingIntegrations || hasRunRef.current) return;

    const now = Date.now();
    if (now - readLastAttempt() < RETRY_COOLDOWN_MS) {
      hasRunRef.current = true;
      return;
    }

    const stale = integrations.filter((integration) => {
      // Compte volontairement mis en pause : son historique reste exploité,
      // mais on cesse d'interroger son API.
      if (integration.syncEnabled === false) return false;
      if (FILE_IMPORT_PROVIDERS.has(integration.provider)) return false;
      // Une synchronisation déjà en cours ne doit pas être doublée.
      if (integration.syncStatus === "syncing") return false;
      const lastSyncedAt = integration.lastSyncedAt ?? 0;
      return now - lastSyncedAt > STALE_AFTER_MS;
    });

    if (stale.length === 0) return;

    hasRunRef.current = true;
    writeLastAttempt(now);

    void (async () => {
      const toastId = toast.loading(
        stale.length === 1
          ? `Mise à jour de ${stale[0].displayName ?? stale[0].provider}…`
          : `Mise à jour de ${stale.length} sources…`
      );

      let succeeded = 0;
      const failures: string[] = [];

      // Séquentiel : les API d'exchange limitent le débit, et rien ne presse.
      for (const integration of stale) {
        const label = integration.displayName ?? integration.provider;
        try {
          const outcome = await runSync(integration._id, integration.provider);
          if (outcome === null) continue;
          succeeded += 1;
        } catch (error) {
          console.error(`[auto-sync] ${label} a échoué`, error);
          failures.push(`${label} : ${errorMessage(error)}`);
        }
      }

      if (failures.length === 0 && succeeded > 0) {
        toast.success(
          succeeded === 1 ? "Source mise à jour" : `${succeeded} sources mises à jour`,
          { id: toastId }
        );
      } else if (succeeded > 0) {
        toast.warning(`${succeeded} sur ${stale.length} mises à jour`, {
          id: toastId,
          description: failures.join(" · "),
        });
      } else {
        toast.error("Mise à jour automatique impossible", {
          id: toastId,
          description: failures.join(" · "),
        });
      }

      if (succeeded > 0) refresh();
    })();
  }, [integrations, isLoadingIntegrations, runSync, refresh]);
}
