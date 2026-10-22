"use client";

import { DashboardNewLayout } from "@/app/dashboard/sections/overview/DashboardNewLayout";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";
import { useProviderDialog } from "@/components/dashboard/provider-dialog-context";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { OnboardingChecklist, OnboardingHero } from "@/components/dashboard/onboarding";

export function DashboardContent() {
  const { openDialog } = useProviderDialog();
  const {
    profitSummary,
    historySeries,
    portfolioTokens,
    isLoading,
    isLoadingIntegrations,
    hasNoIntegration,
  } = useDashboardData();

  if (isLoading || isLoadingIntegrations) {
    return <DashboardSkeleton />;
  }

  // Premier lancement : une seule action possible, mise en avant.
  if (hasNoIntegration) {
    return <OnboardingHero />;
  }

  return (
    <div className="no-scrollbar space-y-6 p-6 md:p-8">
      {/* Titre pour les lecteurs d'écran : l'en-tête visible prenait une
          place précieuse sans rien apprendre. */}
      <h1 className="sr-only">Portefeuille global</h1>

      <OnboardingChecklist />

      <DashboardNewLayout
        profitSummary={profitSummary}
        historySeries={historySeries}
        portfolioTokens={portfolioTokens}
        onOpenIntegrations={openDialog}
      />
    </div>
  );
}
