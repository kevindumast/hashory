"use client";

import { useDashboardMetrics } from "@/hooks/dashboard/useDashboardMetrics";
import { useIntegrations } from "@/hooks/dashboard/useIntegrations";
import { SeasonalReturnsView } from "@/app/dashboard/sections/seasonal/SeasonalReturnsView";
import { CalendarDays } from "lucide-react";

export function SeasonalPageClient() {
  const { integrations } = useIntegrations();
  const { historySeries, trades, isLoading } = useDashboardMetrics(0);

  return (
    <div className="p-6 md:p-9 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center size-9 rounded-lg bg-primary/10 text-primary">
          <CalendarDays className="size-4" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">Saisonnalité</h1>
          <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">
            Analyse des rendements périodiques
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
          Chargement des données...
        </div>
      ) : (
        <SeasonalReturnsView
          historySeries={historySeries}
          integrations={integrations}
          allTrades={trades}
        />
      )}
    </div>
  );
}
