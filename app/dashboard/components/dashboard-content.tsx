"use client";

import { useCallback, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, LoaderCircle } from "lucide-react";
import { useAction } from "convex/react";
import { useDashboardMetrics } from "@/hooks/dashboard/useDashboardMetrics";
import { useIntegrations } from "@/hooks/dashboard/useIntegrations";
import { useProviderDialog } from "@/components/dashboard/provider-dialog-context";
import { OverviewTab } from "@/app/dashboard/sections/overview/OverviewTab";
import { AnalyticsTab } from "@/app/dashboard/sections/analytics/AnalyticsTab";
import { IntegrationsTab } from "@/app/dashboard/sections/integrations/IntegrationsTab";
import { TransactionsTab } from "@/app/dashboard/sections/transactions/TransactionsTab";
import { api } from "@/convex/_generated/api";

type DashboardContentProps = {
  userName?: string | null;
};

export function DashboardContent({ userName }: DashboardContentProps) {
  const formattedUser = userName ?? "Gestionnaire";
  const { openDialog } = useProviderDialog();

  const {
    integrations,
    providersCount,
    refreshToken,
    refreshIntegrations,
  } = useIntegrations();
  const metrics = useDashboardMetrics(refreshToken);

  const syncAccount = useAction(api.binance.syncAccount);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const revalidateDashboard = useCallback(() => {
    refreshIntegrations();
  }, [refreshIntegrations]);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) {
      return;
    }
    if (integrations.length === 0) {
      setRefreshMessage(null);
      setRefreshError("Connectez d'abord une intégration Binance.");
      return;
    }

    setIsRefreshing(true);
    setRefreshMessage(null);
    setRefreshError(null);

    try {
      let totalTradeInserted = 0;
      let totalTradeFetched = 0;
      let totalDepositInserted = 0;
      let totalDepositFetched = 0;
      let totalWithdrawalInserted = 0;
      let totalWithdrawalFetched = 0;
      let processedSymbols = 0;

      for (const integration of integrations) {
        if (integration.provider !== "binance") {
          continue;
        }
        const result = await syncAccount({
          integrationId: integration._id,
        });
        totalTradeInserted += result.trades?.inserted ?? 0;
        totalTradeFetched += result.trades?.fetched ?? 0;
        totalDepositInserted += result.deposits?.inserted ?? 0;
        totalDepositFetched += result.deposits?.fetched ?? 0;
        totalWithdrawalInserted += result.withdrawals?.inserted ?? 0;
        totalWithdrawalFetched += result.withdrawals?.fetched ?? 0;
        processedSymbols += result.symbols?.length ?? 0;
      }

      const totalFetched =
        totalTradeFetched + totalDepositFetched + totalWithdrawalFetched;

      setRefreshMessage(
        [
          "Synchronisation terminée",
          `${totalTradeInserted} trade${totalTradeInserted === 1 ? "" : "s"}`,
          `${totalDepositInserted} dépôt${totalDepositInserted === 1 ? "" : "s"}`,
          `${totalWithdrawalInserted} retrait${totalWithdrawalInserted === 1 ? "" : "s"}`,
          `(${totalFetched} enregistrements)`,
          `sur ${processedSymbols} paire${processedSymbols === 1 ? "" : "s"}`,
        ].join(" · ")
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Échec de la synchronisation.";
      setRefreshError(message);
    } finally {
      refreshIntegrations();
      setIsRefreshing(false);
    }
  }, [integrations, isRefreshing, refreshIntegrations, syncAccount]);

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Welcome back</p>
            <h1 className="mt-2 text-3xl font-semibold text-foreground lg:text-4xl">
              Pilotage du portefeuille
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              {isRefreshing ? (
                <span className="flex items-center gap-2 text-xs">
                  <LoaderCircle className="size-3 animate-spin" />
                  Refreshing...
                </span>
              ) : (
                "Refresh data"
              )}
            </Button>
            <Badge variant="outline" className="gap-2 rounded-full border-primary/40 bg-primary/10 px-3 py-1 text-xs">
              <CalendarDays className="size-3" />
              Updated {new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })}
            </Badge>
          </div>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {formattedUser}, connect your providers and import your transactions to track live traded volume.
        </p>
        {refreshError ? (
          <p className="text-xs text-red-500">{refreshError}</p>
        ) : refreshMessage ? (
          <p className="text-xs text-emerald-500">{refreshMessage}</p>
        ) : null}
      </header>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="justify-start rounded-full bg-muted/60 p-1">
          <TabsTrigger value="overview" className="rounded-full px-4 py-2 text-sm">
            Overview
          </TabsTrigger>
          <TabsTrigger value="analytics" className="rounded-full px-4 py-2 text-sm">
            Analytics
          </TabsTrigger>
          <TabsTrigger value="integrations" className="rounded-full px-4 py-2 text-sm">
            Integrations
          </TabsTrigger>
          <TabsTrigger value="transactions" className="rounded-full px-4 py-2 text-sm">
            Transactions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <OverviewTab
            profitSummary={metrics.profitSummary}
            historySeries={metrics.historySeries}
            performanceSeries={metrics.performanceSeries}
            allocation={metrics.allocation}
            totalVolume={metrics.totalVolume}
            portfolioTokens={metrics.portfolioTokens}
            onOpenIntegrations={openDialog}
          />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <AnalyticsTab
            stats={metrics.analyticsStats}
            providersCount={providersCount}
            totalVolume={metrics.totalVolume}
            totalFees={metrics.totalFees}
            lastTradeAt={metrics.lastTradeAt}
            integrations={integrations}
          />
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6">
          <IntegrationsTab
            integrations={integrations}
            onOpenDialog={openDialog}
            onRefresh={revalidateDashboard}
          />
        </TabsContent>

        <TabsContent value="transactions" className="space-y-6">
          <TransactionsTab
            transactions={metrics.transactions}
            isLoading={metrics.isLoading}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
