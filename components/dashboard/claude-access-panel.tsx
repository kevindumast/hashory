"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Switch } from "@/components/ui/switch";
import { AUDIT_RETENTION_DAYS, RATE_LIMIT_PER_MINUTE } from "@/lib/mcp";
import { withToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Contrôle de l'accès de Claude : interrupteur et journal des derniers
 * appels. Couper l'accès refuse la requête suivante de Claude, sans
 * attendre l'expiration de son jeton OAuth.
 */

const TOOL_LABELS: Record<string, string> = {
  list_accounts: "Comptes",
  get_portfolio: "Portefeuille",
  get_performance: "Performance",
  list_transactions: "Transactions",
  get_tax_report: "Fiscalité",
};

const dateTime = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});

export function ClaudeAccessPanel() {
  const access = useQuery(api.mcp.myAccess);
  const setEnabled = useMutation(api.mcp.setEnabled);

  const toggle = (enabled: boolean) =>
    withToast(() => setEnabled({ enabled }), {
      loading: enabled ? "Réactivation de l'accès…" : "Coupure de l'accès…",
      success: enabled ? "Claude peut de nouveau lire votre portefeuille" : "Accès de Claude coupé",
    });

  const enabled = access?.enabled ?? true;

  return (
    <section className={cn("rounded-2xl border bg-card p-6", enabled ? "border-line" : "border-violet/40")}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Accès de Claude</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {access === undefined
              ? "Chargement…"
              : !enabled
                ? "Coupé : toute requête de Claude est refusée, même avec un connecteur déjà relié."
                : access?.lastUsedAt
                  ? `Ouvert. Dernière requête le ${dateTime.format(access.lastUsedAt)}.`
                  : "Ouvert. Claude ne s'est encore jamais connecté."}
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={access === undefined || access === null}
          onCheckedChange={(checked) => void toggle(checked)}
          aria-label="Autoriser Claude à lire mon portefeuille"
          className="mt-1 cursor-pointer"
        />
      </div>

      {access && access.activity.length > 0 && (
        <details className="group mt-5">
          <summary className="cursor-pointer text-sm font-bold text-foreground">
            Derniers appels ({access.activity.length})
          </summary>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line text-xs">
            {access.activity.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-muted-foreground">
                <span className="num text-foreground">{dateTime.format(entry.createdAt)}</span>
                <span className="font-bold text-foreground">{TOOL_LABELS[entry.tool] ?? entry.tool}</span>
                <span className="num">
                  {entry.rowCount} élément{entry.rowCount > 1 ? "s" : ""}
                </span>
                {entry.ip && <span className="num">{entry.ip}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="mt-5 text-xs text-muted-foreground">
        Le journal garde l&apos;outil appelé, le nombre d&apos;éléments renvoyés et l&apos;adresse IP,
        jamais le contenu, pendant {AUDIT_RETENTION_DAYS} jours. {RATE_LIMIT_PER_MINUTE} requêtes par
        minute au plus.
      </p>
    </section>
  );
}
