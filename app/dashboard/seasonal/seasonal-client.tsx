"use client";

import { useState } from "react";
import { usePortfolioSnapshots } from "@/hooks/usePortfolioSnapshots";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";
import { SeasonalReturnsView } from "@/app/dashboard/sections/seasonal/SeasonalReturnsView";
import { CalendarDays } from "lucide-react";

export function SeasonalPageClient() {
  const [selectedIntegration, setSelectedIntegration] = useState<string>("all");

  // Une série par périmètre, calculée côté serveur depuis le grand livre.
  const { snapshots, isComputing } = usePortfolioSnapshots(
    selectedIntegration === "all" ? undefined : selectedIntegration
  );
  const { integrations } = useDashboardData();

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

      <SeasonalReturnsView
        snapshots={snapshots}
        integrations={integrations}
        selectedIntegration={selectedIntegration}
        onSelectIntegration={setSelectedIntegration}
        isLoading={isComputing && snapshots.length === 0}
      />
    </div>
  );
}
