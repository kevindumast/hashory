"use client";

import { useState } from "react";
import { useDashboardMetrics } from "@/hooks/dashboard/useDashboardMetrics";
import { DashboardNewLayout } from "@/app/dashboard/sections/overview/DashboardNewLayout";

export function DashboardContent({ userName }: { userName: string | null }) {
  const [refreshToken] = useState(0);
  const {
    profitSummary,
    historySeries,
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
      <DashboardNewLayout
        profitSummary={profitSummary}
        historySeries={historySeries}
        allocation={allocation}
        totalVolume={totalVolume}
        portfolioTokens={portfolioTokens}
        onOpenIntegrations={handleOpenIntegrations}
      />
    </div>
  );
}