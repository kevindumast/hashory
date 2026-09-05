import { cn } from "@/lib/utils";

function Bar({ className }: { className?: string }) {
  return <span className={cn("block animate-pulse rounded bg-muted", className)} />;
}

/**
 * Squelette calqué sur la grille réelle du dashboard.
 * Il occupe exactement la même place que le contenu final : plus de saut
 * de mise en page au moment où les données arrivent.
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-5 p-6 md:p-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement de votre portefeuille…</span>

      <div className="space-y-2">
        <Bar className="h-2.5 w-32" />
        <Bar className="h-6 w-56" />
      </div>

      {/* Trois cartes d'indicateurs */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="space-y-3 rounded-lg border border-border/60 bg-[var(--surface-low)] p-5"
          >
            <Bar className="h-2.5 w-24" />
            <Bar className="h-7 w-36" />
            <Bar className="h-2.5 w-20" />
          </div>
        ))}
      </div>

      {/* Graphique principal */}
      <div className="rounded-lg border border-border/60 bg-[var(--surface-low)] p-5">
        <div className="mb-5 flex items-center justify-between">
          <Bar className="h-3 w-40" />
          <Bar className="h-7 w-32" />
        </div>
        <div className="flex h-56 items-end gap-1.5">
          {Array.from({ length: 28 }).map((_, index) => (
            <Bar
              key={index}
              className="flex-1"
              // Hauteurs déterministes : pas d'écart d'hydratation entre serveur et client.
              {...{ style: { height: `${30 + ((index * 37) % 60)}%` } }}
            />
          ))}
        </div>
      </div>

      {/* Listes jetons / plateformes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1].map((column) => (
          <div key={column} className="rounded-lg border border-border/60 bg-[var(--surface-low)] p-5">
            <Bar className="mb-4 h-3 w-32" />
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Bar className="size-7 shrink-0 rounded-full" />
                  <Bar className="h-3 flex-1" />
                  <Bar className="h-3 w-16" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
