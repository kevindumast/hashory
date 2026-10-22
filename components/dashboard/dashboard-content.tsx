"use client";

import { useUser } from "@clerk/nextjs";
import { DashboardNewLayout } from "@/app/dashboard/sections/overview/DashboardNewLayout";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";
import { useProviderDialog } from "@/components/dashboard/provider-dialog-context";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { OnboardingChecklist, OnboardingHero } from "@/components/dashboard/onboarding";
import { SignalsPanel } from "@/components/dashboard/signals-panel";

export function DashboardContent() {
  const { user } = useUser();
  const userName = user?.firstName ?? user?.username ?? null;
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
      <header className="border-b border-border/60 pb-5">
        <p className="eyebrow">Portefeuille global
        </p>
        <h1 className="mt-3 title text-3xl leading-tight text-foreground">
          Bonjour, {userName || "Investisseur"}
        </h1>
      </header>

      <SignalsPanel />

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
