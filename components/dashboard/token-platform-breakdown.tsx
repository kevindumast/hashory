"use client";

import { useMemo } from "react";
import { providerIcon } from "@/lib/provider-icons";
import type { SourceQuantity } from "@/hooks/dashboard/useDashboardMetrics";

/**
 * Où se trouve réellement un jeton.
 *
 * La ligne du tableau donne une quantité totale, qui ne dit pas sur quelle
 * plateforme elle dort. C'est pourtant ce qu'on cherche avant de vendre, de
 * transférer, ou simplement de vérifier un solde contre l'application de la
 * plateforme.
 *
 * Seules les plateformes qui détiennent encore quelque chose figurent ici :
 * celles dont le stock est parti n'apprennent plus rien, et l'historique
 * complet reste lisible sur le graphique au-dessus.
 */
export function TokenPlatformBreakdown({
  sources,
  currentPrice,
  money,
}: {
  sources: SourceQuantity[];
  /** Cours du jour en dollars, ou null si aucun n'a pu être obtenu. */
  currentPrice: number | null;
  /** Mise en forme dans la devise choisie par l'utilisateur. */
  money: (value: number) => string;
}) {
  const held = useMemo(() => {
    // Une quantité négative traduit un historique incomplet — un retrait
    // enregistré sans l'entrée correspondante — plutôt qu'une position
    // vendue à découvert. La compter fausserait les parts affichées.
    const positive = sources.filter((source) => source.quantity > 0);
    const total = positive.reduce((sum, source) => sum + source.quantity, 0);

    return {
      rows: [...positive].sort((a, b) => b.quantity - a.quantity),
      total,
    };
  }, [sources]);

  if (held.rows.length === 0) return null;

  return (
    <div className="mt-4 border-t border-border/40 pt-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2">
        Répartition par plateforme
      </p>

      <ul className="flex flex-col">
        {held.rows.map((source) => {
          const share = held.total > 0 ? source.quantity / held.total : 0;
          const value = currentPrice !== null ? currentPrice * source.quantity : null;
          const icon = providerIcon(source.provider);

          return (
            <li
              key={source.integrationId}
              className="flex items-center gap-3 border-b border-border/25 py-2 last:border-b-0"
            >
              {icon ? (
                // Logo décoratif : le nom juste à côté porte déjà l'information.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={icon} alt="" aria-hidden className="w-5 h-5 rounded-full shrink-0" />
              ) : (
                <span className="w-5 h-5 rounded-full bg-muted shrink-0" aria-hidden />
              )}

              <span className="text-sm text-foreground min-w-0 flex-1 truncate">
                {source.providerDisplayName}
              </span>

              <span className="num text-sm text-foreground text-right tabular-nums">
                {source.quantity.toLocaleString("fr-FR", { maximumFractionDigits: 6 })}
              </span>

              <span className="num text-sm text-muted-foreground text-right tabular-nums w-24 hidden sm:inline">
                {value !== null ? money(value) : "—"}
              </span>

              <span className="hidden md:flex items-center gap-2 w-24 shrink-0">
                <span className="h-1 flex-1 bg-muted/40 rounded-full overflow-hidden">
                  <span
                    className="block h-full bg-primary/70 rounded-full"
                    style={{ width: `${Math.round(share * 100)}%` }}
                  />
                </span>
                <span className="num text-[11px] text-muted-foreground tabular-nums w-9 text-right">
                  {(share * 100).toFixed(0)}%
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {held.rows.length > 1 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {held.rows.length} plateformes détiennent ce jeton — total{" "}
          <span className="num">
            {held.total.toLocaleString("fr-FR", { maximumFractionDigits: 6 })}
          </span>
          .
        </p>
      )}
    </div>
  );
}
