"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowUpRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { isConvexConfigured } from "@/convex/client";
import { FILE_IMPORT_PROVIDERS } from "@/lib/providers";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";
import { usePortfolioAnalytics } from "@/hooks/dashboard/usePortfolioAnalytics";
import { useCorrelationMatrix } from "@/hooks/dashboard/useCorrelationMatrix";
import { computeSignals, type Signal, type SignalSeverity } from "@/lib/signals";
import { cn } from "@/lib/utils";

const SEVERITY_LABEL: Record<SignalSeverity, string> = {
  critical: "Critique",
  warning: "Attention",
  info: "À noter",
};

const SEVERITY_CHIP: Record<SignalSeverity, string> = {
  critical: "bg-negative/10 text-negative",
  warning: "bg-chart-4/12 text-chart-4",
  info: "",
};

/**
 * Ce qui demande une décision : un compte en erreur, une contrepartie
 * devenue dominante, un impôt à provisionner. Les règles vivent dans
 * `lib/signals.ts`, où elles sont pures et testées ; ce hook ne fait que
 * leur fournir l'état courant du portefeuille.
 *
 * Le silence est le comportement normal : la liste est vide quand rien
 * n'appelle d'action.
 */
export function useSignals(): Signal[] {
  const { integrations, isLoadingIntegrations } = useDashboardData();
  const analytics = usePortfolioAnalytics("all");
  const correlation = useCorrelationMatrix(
    analytics.assetConcentration.weights.map((entry) => entry.key)
  );
  const report = useQuery(api.taxReport.computeTaxReport, isConvexConfigured ? {} : "skip");

  return useMemo(() => {
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
}

/** Une ligne de signal, compacte : elle vit dans le menu des notifications. */
export function SignalItem({ signal, onNavigate }: { signal: Signal; onNavigate?: () => void }) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "chip py-0.5 text-[10px] uppercase tracking-[0.14em]",
            SEVERITY_CHIP[signal.severity]
          )}
        >
          {SEVERITY_LABEL[signal.severity]}
        </span>
        <span className="mt-1.5 block text-sm font-bold leading-snug text-foreground">
          {signal.title}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
          {signal.detail}
        </span>
      </span>
      {signal.href && <ArrowUpRight className="mt-1 size-3.5 shrink-0 text-faint" />}
    </>
  );

  const className = "flex items-start gap-3 rounded-xl px-3 py-2.5";

  return signal.href ? (
    <Link
      href={signal.href}
      onClick={onNavigate}
      className={cn(className, "transition-colors hover:bg-muted")}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
