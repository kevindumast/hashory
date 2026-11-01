"use client";

import { useRef, useSyncExternalStore } from "react";
import { useQuery, type OptionalRestArgsOrSkip } from "convex/react";
import type { FunctionReference } from "convex/server";

/**
 * Délai au-delà duquel un onglet caché lâche ses abonnements Convex.
 *
 * Un onglet oublié ouvert gardait toutes ses requêtes vivantes : chaque
 * renouvellement de session les relançait, et le passage au jour suivant
 * recalculait tout le portefeuille en pleine nuit, pour personne. Quelques
 * minutes de grâce évitent de tout recharger après un simple changement
 * d'onglet.
 */
export const IDLE_AFTER_HIDDEN_MS = 10 * 60_000;

/**
 * Délai sans souris, clavier, défilement ni toucher au-delà duquel un onglet
 * pourtant affiché est tenu pour abandonné : un écran resté allumé la nuit
 * coûte autant qu'un onglet caché.
 */
export const IDLE_AFTER_INACTIVE_MS = 15 * 60_000;

const INTERACTION_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"] as const;

type Activity = { visible: boolean; active: boolean };

// Rendu serveur et navigateur sans `document` : la page est réputée visible.
const SERVER_ACTIVITY: Activity = { visible: true, active: true };

let activity: Activity = SERVER_ACTIVITY;
/** Instant où l'onglet sera tenu pour inactif, sauf nouvelle interaction. */
let idleAt = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let listening = false;
const listeners = new Set<() => void>();

function setActivity(next: Activity) {
  if (next.visible === activity.visible && next.active === activity.active) return;
  activity = next;
  for (const listener of listeners) listener();
}

// Le minuteur n'est pas réarmé à chaque mouvement de souris : à l'échéance,
// il se replanifie si une interaction a repoussé `idleAt` entre-temps.
function scheduleIdleCheck() {
  if (idleTimer !== null) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (Date.now() < idleAt) {
      scheduleIdleCheck();
      return;
    }
    setActivity({ visible: activity.visible, active: false });
  }, Math.max(0, idleAt - Date.now()));
}

function onVisibilityChange() {
  const visible = document.visibilityState !== "hidden";
  idleAt = Date.now() + (visible ? IDLE_AFTER_INACTIVE_MS : IDLE_AFTER_HIDDEN_MS);
  setActivity({ visible, active: true });
  scheduleIdleCheck();
}

function onInteraction() {
  if (document.visibilityState === "hidden") return;
  idleAt = Date.now() + IDLE_AFTER_INACTIVE_MS;
  if (!activity.active) {
    setActivity({ visible: true, active: true });
    scheduleIdleCheck();
  }
}

function subscribe(listener: () => void) {
  if (!listening && typeof document !== "undefined") {
    listening = true;
    document.addEventListener("visibilitychange", onVisibilityChange);
    for (const event of INTERACTION_EVENTS) {
      window.addEventListener(event, onInteraction, { passive: true, capture: true });
    }
    onVisibilityChange();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    // Plus personne à l'écoute : rien ne doit rester armé derrière.
    if (listeners.size > 0 || !listening) return;
    listening = false;
    document.removeEventListener("visibilitychange", onVisibilityChange);
    for (const event of INTERACTION_EVENTS) {
      window.removeEventListener(event, onInteraction, { capture: true });
    }
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };
}

/**
 * État de l'onglet : `visible` suit l'affichage ; `active` passe à faux après
 * {@link IDLE_AFTER_HIDDEN_MS} d'onglet caché ou
 * {@link IDLE_AFTER_INACTIVE_MS} sans interaction, et revient au premier
 * geste ou au retour sur l'onglet.
 */
export function usePageActivity(): Activity {
  return useSyncExternalStore(subscribe, () => activity, () => SERVER_ACTIVITY);
}

/**
 * `useQuery`, suspendu quand l'onglet est inactif. Pendant la pause, la page
 * garde le dernier résultat reçu, figé, plutôt que de retomber en
 * chargement ; l'abonnement reprend dès le retour de l'utilisateur.
 */
export function useActiveQuery<Query extends FunctionReference<"query">>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
): Query["_returnType"] | undefined {
  const { active } = usePageActivity();
  const effectiveArgs = (active ? args : ["skip"]) as OptionalRestArgsOrSkip<Query>;
  const result = useQuery(query, ...effectiveArgs);
  const lastResultRef = useRef(result);
  if (active) lastResultRef.current = result;
  return active ? result : lastResultRef.current;
}
