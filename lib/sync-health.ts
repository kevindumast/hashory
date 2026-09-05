/**
 * État réel d'une synchronisation en cours.
 *
 * Le badge « Synchronisation… » ne dit qu'une chose : le dernier statut
 * écrit en base vaut `syncing`. Il ne dit pas si quelque chose tourne
 * encore. Une synchronisation qui échoue entre deux étapes laisse ce statut
 * en place indéfiniment, et rien ne distingue alors un travail en cours
 * d'un travail mort depuis des heures.
 *
 * Ce module tranche la question à partir de deux éléments vérifiables :
 * l'heure de départ, et l'état des tâches planifiées que la
 * synchronisation a laissées derrière elle. Ce second point est décisif :
 * quand plus aucune tâche n'est en attente, il n'y a plus rien à attendre,
 * quelle que soit l'heure qu'il est.
 */

/** États d'une tâche planifiée, tels que Convex les expose. */
export type ScheduledJobState = "pending" | "inProgress" | "success" | "failed" | "canceled";

export type SyncJob = {
  state: ScheduledJobState;
  /** Message d'erreur, pour une tâche en échec. */
  error?: string | null;
};

export type SyncHealthInput = {
  syncStatus: "idle" | "syncing" | "synced" | "error";
  /** Début de la synchronisation en cours, si connu. */
  startedAt?: number | null;
  /** Tâches planifiées par cette synchronisation. Vide si aucune n'est suivie. */
  jobs?: SyncJob[];
  now: number;
};

export type SyncHealthKind =
  /** Aucune synchronisation en cours. */
  | "idle"
  /** En cours, dans des délais normaux. */
  | "running"
  /** En cours, mais depuis anormalement longtemps. */
  | "stalled"
  /** Plus aucune tâche à venir : le statut est resté en l'état. */
  | "orphaned"
  /** Une tâche a échoué. */
  | "failed";

export type SyncHealth = {
  kind: SyncHealthKind;
  /** Durée écoulée depuis le départ, ou null si le départ est inconnu. */
  elapsedMs: number | null;
  /** Explication destinée à l'utilisateur, ou null si tout est normal. */
  message: string | null;
  /** Vrai quand il reste quelque chose à interrompre. */
  canCancel: boolean;
};

/**
 * Durée au-delà de laquelle une synchronisation devient suspecte.
 *
 * Une action Convex ne peut pas dépasser dix minutes ; au-delà, elle est
 * interrompue. Une chaîne d'étapes enchaînées peut donc légitimement courir
 * un peu plus longtemps, mais pas beaucoup. Vingt minutes laissent une
 * marge confortable tout en signalant un blocage le jour même.
 */
export const STALLED_AFTER_MS = 20 * 60 * 1000;

/** Tâche encore susceptible de faire avancer la synchronisation. */
function isLive(job: SyncJob): boolean {
  return job.state === "pending" || job.state === "inProgress";
}

export function assessSyncHealth(input: SyncHealthInput): SyncHealth {
  const { syncStatus, startedAt, jobs, now } = input;

  if (syncStatus !== "syncing") {
    return { kind: "idle", elapsedMs: null, message: null, canCancel: false };
  }

  const elapsedMs =
    typeof startedAt === "number" && Number.isFinite(startedAt)
      ? Math.max(0, now - startedAt)
      : null;

  const tracked = jobs ?? [];
  const live = tracked.filter(isLive);
  const failed = tracked.find((job) => job.state === "failed");

  // Une étape en échec explique tout le reste : inutile d'aller plus loin.
  if (failed) {
    return {
      kind: "failed",
      elapsedMs,
      message: failed.error
        ? `Une étape a échoué : ${failed.error}`
        : "Une étape de la synchronisation a échoué.",
      canCancel: true,
    };
  }

  // Des tâches ont été suivies, et aucune n'est plus active : la
  // synchronisation est terminée, seul le statut ne l'a pas enregistré.
  if (tracked.length > 0 && live.length === 0) {
    return {
      kind: "orphaned",
      elapsedMs,
      message: "Plus aucune étape n'est en cours : il n'y a plus rien à attendre.",
      canCancel: true,
    };
  }

  if (elapsedMs !== null && elapsedMs >= STALLED_AFTER_MS) {
    return {
      kind: "stalled",
      elapsedMs,
      message: "La synchronisation dure anormalement longtemps.",
      canCancel: true,
    };
  }

  return { kind: "running", elapsedMs, message: null, canCancel: true };
}

/** Durée écoulée, dite comme on la dirait à voix haute. */
export function formatElapsed(elapsedMs: number): string {
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return "moins d'une minute";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;

  const days = Math.floor(hours / 24);
  return days === 1 ? "1 jour" : `${days} jours`;
}
