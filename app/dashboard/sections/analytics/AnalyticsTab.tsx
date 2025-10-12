"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalyticsStat, currencyFormatter, dateFormatter } from "@/hooks/dashboard/useDashboardMetrics";
import type { IntegrationRecord } from "@/hooks/dashboard/useIntegrations";

type AnalyticsTabProps = {
  stats: AnalyticsStat[];
  providersCount: number;
  totalVolume: number;
  totalFees: number;
  lastTradeAt: number | null;
  integrations: IntegrationRecord[];
};

export function AnalyticsTab({
  stats,
  providersCount,
  totalVolume,
  totalFees,
  lastTradeAt,
  integrations,
}: AnalyticsTabProps) {
  return (
    <>
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-border/60 bg-card/80 backdrop-blur">
            <CardHeader className="space-y-2">
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-3xl text-foreground">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-xs text-muted-foreground">{stat.trend}</span>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card className="border-border/60 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardDescription>Import summary</CardDescription>
            <CardTitle className="text-lg">Aggregated activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Providers connected: {providersCount}</p>
            <p>Total volume: {currencyFormatter.format(totalVolume || 0)}</p>
            <p>Total fees: {currencyFormatter.format(totalFees || 0)}</p>
            <p>
              Last transaction: {lastTradeAt ? dateFormatter.format(new Date(lastTradeAt)) : "no sync yet"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardDescription>Providers</CardDescription>
            <CardTitle className="text-lg">Connection status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            {providersCount === 0 ? (
              <p>Connect Binance in the Integrations tab to start importing trades.</p>
            ) : (
              <ul className="list-disc space-y-2 pl-5">
                {integrations.map((integration) => (
                  <li key={integration._id}>
                    <span className="font-medium text-foreground">
                      {integration.displayName ?? integration.provider}
                    </span>
                    {" – "}
                    {integration.lastSyncedAt
                      ? `last sync ${dateFormatter.format(new Date(integration.lastSyncedAt))}`
                      : "never synchronised"}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
