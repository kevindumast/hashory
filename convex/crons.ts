import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Change EUR/USD de la BCE, publié chaque jour ouvré vers 16 h, heure de
 * Paris. Sans cette tâche, la table cessait d'avancer : tout l'affichage en
 * euros, et la fiscalité des cessions récentes, retenaient un taux de
 * plusieurs semaines. La collecte reprend après le dernier jour connu.
 */
crons.daily("change EUR/USD de la BCE", { hourUTC: 15, minuteUTC: 30 }, internal.fxRates.backfillEurUsd, {});

export default crons;
