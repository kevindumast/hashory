"use client";

import { useState } from "react";
import { useDashboardMetrics } from "@/hooks/dashboard/useDashboardMetrics";
import { DashboardNewLayout } from "@/app/dashboard/sections/overview/DashboardNewLayout";

export function DashboardContent({ userName }: { userName: string | null }) {
  const [refreshToken] = useState(0);
  const {
    profitSummary,
    historySeries,
    portfolioTokens,
    isLoading,
  } = useDashboardMetrics(refreshToken);

  const handleOpenIntegrations = () => {
    // TODO: Open integrations dialog
    console.log("Open integrations");
  };

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Terminal</p>
          <h1 className="text-xl font-black tracking-tighter text-foreground">
            Bonjour, {userName || "Investisseur"}
          </h1>
        </div>
        <div className="bg-[var(--surface-low)] border border-border/60 rounded-lg p-8 flex items-center gap-3 text-muted-foreground text-sm">
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          Chargement des données…
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-5 no-scrollbar">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Terminal Intelligence</p>
        <h1 className="text-xl font-black tracking-tighter text-foreground">
          Bonjour, {userName || "Investisseur"}
        </h1>
      </div>
      <DashboardNewLayout
        profitSummary={profitSummary}
        historySeries={historySeries}
        portfolioTokens={portfolioTokens}
        onOpenIntegrations={handleOpenIntegrations}
      />
    </div>
  );
}