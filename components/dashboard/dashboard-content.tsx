"use client";

import { useState } from "react";
import { useDashboardMetrics } from "@/hooks/dashboard/useDashboardMetrics";
import { OverviewTab } from "@/app/dashboard/sections/overview/OverviewTab";

export function DashboardContent({ userName }: { userName: string | null }) {
  const [refreshToken, setRefreshToken] = useState(0);
  const {
    profitSummary,
    historySeries,
    performanceSeries,
    allocation,
    totalVolume,
    portfolioTokens,
    isLoading,
  } = useDashboardMetrics(refreshToken);

  const handleOpenIntegrations = () => {
    // TODO: Open integrations dialog
    console.log("Open integrations");
  };

  if (isLoading) {
    return (
      <div className="p-6 md:p-9">
        <h1 className="text-2xl font-bold mb-4">Bonjour, {userName || "Investisseur"}</h1>
        <div className="text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-9 space-y-6">
      <h1 className="text-2xl font-bold">Bonjour, {userName || "Investisseur"}</h1>
      <OverviewTab
        profitSummary={profitSummary}
        historySeries={historySeries}
        performanceSeries={performanceSeries}
        allocation={allocation}
        totalVolume={totalVolume}
        portfolioTokens={portfolioTokens}
        onOpenIntegrations={handleOpenIntegrations}
      />
    </div>
  );
}