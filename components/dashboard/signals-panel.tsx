"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowUpRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { isConvexConfigured } from "@/convex/client";
import { FILE_IMPORT_PROVIDERS } from "@/lib/providers";
import { Reveal } from "@/components/motion";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";
import { usePortfolioAnalytics } from "@/hooks/dashboard/usePortfolioAnalytics";
import { useCorrelationMatrix } from "@/hooks/dashboard/useCorrelationMatrix";
import { computeSignals, type SignalSeverity } from "@/lib/signals";
import { cn } from "@/lib/utils";


const SEVERITY_LABEL: Record<SignalSeverity, string> = {
  critical: "Critique",
  warning: "Attention",
  info: "À noter",
};

const SEVERITY_COLOR: Record<SignalSeverity, string> = {
  critical: "text-destructive",
  warning: "text-chart-4",
  info: "text-muted-foreground",
};

/**
 * Ce qui demande une décision, rassemblé en haut du portefeuille.
 *
 * Le tableau de bord montre un état ; il ne dit pas ce qui cloche. Un compte
 * en erreur depuis une semaine, une contrepartie devenue dominante ou un
 * impôt à provisionner ne se voient qu'en allant les chercher. Les règles
 * vivent dans `lib/signals.ts`, où elles sont pures et testées.
 *
 * Le silence est le comportement normal : rien ne s'affiche quand rien
 * n'appelle d'action.
 */
export function SignalsPanel() {
  const { integrations, isLoadingIntegrations } = useDashboardData();
  const analytics = usePortfolioAnalytics("all");
  const correlation = useCorrelationMatrix(
    analytics.assetConcentration.weights.map((entry) => entry.key)
  );
  const report = useQuery(api.taxReport.computeTaxReport, isConvexConfigured ? {} : "skip");

  const signals = useMemo(() => {
    if (isLoadingIntegrations || analytics.isLoading) return [];

    const currentYear = new Date().getUTCFullYear();
    const yearReport = report?.reports.find((entry) => entry.year === currentYear) ?? null;
    const topAsset = analytics.assetConcentration.weights[0] ?? null;
    const topVenue = analytics.venueConcentration.weights[0] ?? null;

    return computeSignals({
      now: Date.now(),
      integrations: integrations.map((integration) => ({
        id: String(integration._id),
        label: integration.displayName ?? integration.provider,
        syncStatus: integration.syncStatus,
        lastSyncedAt: integration.lastSyncedAt ?? null,
        syncEnabled: integration.syncEnabled,
        isFileImport: FILE_IMPORT_PROVIDERS.has(integration.provider),
      })),
      topAsset: topAsset ? { key: topAsset.key, weight: topAsset.weight } : null,
      effectiveCount: analytics.assetConcentration.effectiveCount,
      topVenue: topVenue ? { key: topVenue.key, weight: topVenue.weight } : null,
      averageCorrelation:
        correlation.matrix.keys.length >= 2 ? correlation.matrix.averagePairwise : null,
      taxYear: yearReport
        ? {
            year: yearReport.year,
            proceedsEur: yearReport.totalProceedsEur,
            estimatedTaxEur: yearReport.estimatedTaxEur,
          }
        : null,
      stablecoinReserveUsd: analytics.stablecoinWeight * analytics.totalValueUsd,
      hasIncompleteValuation: report?.hasIncompleteValuation ?? false,
      hasMissingFxRates: report?.hasMissingFxRates ?? false,
    });
  }, [integrations, isLoadingIntegrations, analytics, correlation, report]);

  if (signals.length === 0) return null;

  return (
    <Reveal>
      <section className="border-y border-border/60" aria-label="Points d'attention">
        <p className="num border-b border-border/60 px-5 py-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">
          Points d&apos;attention · {signals.length}
        </p>

        <ul>
          {signals.map((signal) => {
            const body = (
              <>
                <span
                  className={cn(
                    "num w-20 shrink-0 text-[10px] uppercase tracking-[0.16em]",
                    SEVERITY_COLOR[signal.severity]
                  )}
                >
                  {SEVERITY_LABEL[signal.severity]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-foreground">{signal.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {signal.detail}
                  </span>
                </span>
                {signal.href && (
                  <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50" />
                )}
              </>
            );

            return (
              <li key={signal.id} className="border-b border-border/60 last:border-b-0">
                {signal.href ? (
                  <Link
                    href={signal.href}
                    className="flex items-start gap-4 px-5 py-3.5 transition-colors hover:bg-muted/20"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-start gap-4 px-5 py-3.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </Reveal>
  );
}
