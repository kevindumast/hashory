"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Reveal } from "@/components/motion";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";
import { useActiveQuery } from "@/hooks/usePageActivity";
import { usePortfolioAnalytics } from "@/hooks/dashboard/usePortfolioAnalytics";
import { usePortfolioSnapshots } from "@/hooks/usePortfolioSnapshots";
import { auditReadiness } from "@/lib/audit";
import { scorecard, type Grade } from "@/lib/scorecard";
import { cn } from "@/lib/utils";
import type { TaxReportResult } from "@/convex/taxReport";
import { Metric, MetricGrid, Notice, SectionLabel } from "../performance/ui";

const usd = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 });
const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const percent = (value: number, digits = 1) =>
  `${value >= 0 ? "+" : ""}${(value * 100).toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
const ratio = (value: number) => value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const GRADE_TONE: Record<Grade, string> = {
  A: "bg-jade text-white",
  B: "bg-jade/15 text-jade",
  C: "bg-chart-4/15 text-chart-4",
  D: "bg-negative/10 text-negative",
  E: "bg-negative text-white",
};

function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-xs font-bold text-violet hover:underline">
      {children}
      <ArrowUpRight className="size-3.5" />
    </Link>
  );
}

/**
 * Tout ce que le portefeuille a réalisé, sur une page : bilan, résultat
 * fiscal année par année, risque, et état du dossier de contrôle, avec un
 * bulletin qui situe chaque dimension.
 */
export function Overview360() {
  const analytics = usePortfolioAnalytics("all");
  const { snapshots } = usePortfolioSnapshots();
  const tax = useActiveQuery(api.taxReport.computeTaxReport) as TaxReportResult | undefined;
  const { integrations } = useDashboardData();

  const readiness = useMemo(
    () =>
      tax
        ? auditReadiness(tax, {
            total: integrations.length,
            closed: integrations.filter((integration) => integration.closedAt).length,
          })
        : null,
    [tax, integrations]
  );

  if (analytics.isLoading || tax === undefined || readiness === null) return <DashboardSkeleton />;

  const last = snapshots[snapshots.length - 1];
  const value = last?.valueUsd ?? analytics.totalValueUsd;
  const invested = last?.netInvestedUsd ?? 0;
  const pnl = value - invested;
  const years = [...tax.reports].sort((a, b) => b.year - a.year);
  const realizedTotal = years.reduce((sum, report) => sum + (report.netGainLossEur ?? 0), 0);
  const taxTotal = years.reduce((sum, report) => sum + (report.estimatedTaxEur ?? 0), 0);
  const feesTotal = years.reduce((sum, report) => sum + report.totalFeesEur, 0);
  const dexSwaps = (tax.audit?.dexSwaps ?? []).reduce((sum, row) => sum + row.count, 0);
  const lines = scorecard({
    excessReturn: analytics.excessReturn,
    sharpe: analytics.sharpe,
    maxDrawdown: analytics.drawdown.maxDrawdown,
    effectivePositions: analytics.assetConcentration.effectiveCount,
    topWeight: analytics.assetConcentration.topWeight,
    stablecoinWeight: analytics.stablecoinWeight,
    auditScore: readiness.score,
  });

  return (
    <div className="space-y-12 p-4 sm:p-6 md:p-8">
      <header>
        <p className="eyebrow">Vue 360</p>
        <h1 className="title mt-2 text-3xl text-foreground sm:text-4xl">
          Tout ce que vous avez <span className="text-jade">réalisé</span>.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Le bilan d&apos;un gérant, sur une page : ce que vaut le portefeuille, ce qu&apos;il a rapporté, le risque pris pour
          y arriver, et ce qu&apos;il faudrait prouver en cas de contrôle.
        </p>
      </header>

      {/* ─── Bulletin ─── */}
      <section className="space-y-4">
        <Reveal>
          <SectionLabel index="01">Le bulletin</SectionLabel>
        </Reveal>
        <Reveal delay={60}>
          <div className="float-card overflow-hidden">
            <ul className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
              {lines.map((line) => (
                <li key={line.id} className="flex items-start gap-4 bg-card px-5 py-4">
                  <span
                    className={cn("num grid size-10 shrink-0 place-items-center rounded-xl text-lg font-bold", GRADE_TONE[line.grade])}
                    aria-label={`Note ${line.grade}`}
                  >
                    {line.grade}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-foreground">{line.label}</span>
                    <span className="block text-xs leading-relaxed text-muted-foreground">{line.reading}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
        {!analytics.hasEnoughHistory && (
          <Notice>
            <span className="font-bold text-chart-4">Moins de 30 jours d&apos;historique</span> — les ratios de risque sont
            encore du bruit statistique : lisez-les comme des indications.
          </Notice>
        )}
      </section>

      {/* ─── Bilan ─── */}
      <section className="space-y-4">
        <Reveal>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionLabel index="02">Le bilan</SectionLabel>
            <MoreLink href="/dashboard/performance">Analyse détaillée</MoreLink>
          </div>
        </Reveal>
        <Reveal delay={60}>
          <MetricGrid>
            <Metric large label="Valeur actuelle" value={usd.format(value)} hint={`${integrations.length} comptes suivis`} />
            <Metric large label="Capital net apporté" value={usd.format(invested)} hint="Apports moins retraits, depuis l'origine" />
            <Metric
              large
              label="Résultat total"
              value={`${pnl >= 0 ? "+" : ""}${usd.format(pnl)}`}
              tone={pnl >= 0 ? "positive" : "negative"}
              hint={invested > 0 ? `${percent(pnl / invested)} du capital apporté` : undefined}
            />
            <Metric
              large
              label="Rendement annualisé"
              value={percent(analytics.annualizedReturn)}
              tone={analytics.annualizedReturn >= 0 ? "positive" : "negative"}
              hint={
                analytics.moneyWeightedReturn !== null
                  ? `Pondéré par les flux : ${percent(analytics.moneyWeightedReturn)} par an`
                  : `Cumulé : ${percent(analytics.timeWeightedReturn)}`
              }
            />
          </MetricGrid>
        </Reveal>
      </section>

      {/* ─── Réalisé ─── */}
      <section className="space-y-4">
        <Reveal>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionLabel index="03">Le réalisé, année par année</SectionLabel>
            <MoreLink href="/dashboard/tax-report">Déclaration</MoreLink>
          </div>
        </Reveal>
        <Reveal delay={60}>
          <div className="float-card overflow-hidden">
            <div className="grid gap-px bg-line sm:grid-cols-4">
              <Metric
                label="Plus-values réalisées"
                value={`${realizedTotal >= 0 ? "+" : ""}${eur.format(realizedTotal)}`}
                tone={realizedTotal >= 0 ? "positive" : "negative"}
                hint="Cumul des années, art. 150 VH bis"
              />
              <Metric label="Impôt estimé" value={eur.format(taxTotal)} hint="PFU de 30 %, toutes années" />
              <Metric label="Frais de cession" value={eur.format(feesTotal)} hint="Déduits du prix de cession" />
              <Metric
                label="Swaps on-chain"
                value={String(dexSwaps)}
                hint={
                  (tax.audit?.dexSwaps ?? [])
                    .slice(0, 3)
                    .map((row) => `${row.protocol === "Inconnu" ? "DEX non reconnu" : row.protocol} ${row.count}`)
                    .join(" · ") || "Aucun swap sur un DEX"
                }
              />
            </div>
            {years.length > 0 && (
              <div className="overflow-x-auto border-t border-line">
                <table className="w-full min-w-[560px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line">
                      {["Année", "Cessions", "Prix de cession", "Plus-value nette", "Impôt estimé"].map((label, index) => (
                        <th
                          key={label}
                          scope="col"
                          className={cn(
                            "px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground",
                            index > 0 && "text-right"
                          )}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {years.map((report) => {
                      const net = report.netGainLossEur ?? 0;
                      return (
                        <tr key={report.year} className="border-b border-line last:border-b-0 hover:bg-surface">
                          <td className="num px-5 py-3 text-sm font-bold">{report.year}</td>
                          <td className="num px-5 py-3 text-right text-sm text-muted-foreground">{report.events.length}</td>
                          <td className="num px-5 py-3 text-right text-sm">{eur.format(report.totalProceedsEur ?? 0)}</td>
                          <td className={cn("num px-5 py-3 text-right text-sm font-bold", net >= 0 ? "text-positive" : "text-negative")}>
                            {net >= 0 ? "+" : ""}
                            {eur.format(net)}
                          </td>
                          <td className="num px-5 py-3 text-right text-sm">
                            {report.isBelowThreshold ? "Exonéré" : eur.format(report.estimatedTaxEur ?? 0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Reveal>
      </section>

      {/* ─── Risque ─── */}
      <section className="space-y-4">
        <Reveal>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionLabel index="04">Le risque pris</SectionLabel>
            <MoreLink href="/dashboard/performance">Risque détaillé</MoreLink>
          </div>
        </Reveal>
        <Reveal delay={60}>
          <MetricGrid>
            <Metric label="Volatilité annualisée" value={percent(analytics.volatility).replace("+", "")} hint="Amplitude des variations, sur l'année" />
            <Metric
              label="Perte maximale"
              value={percent(analytics.drawdown.maxDrawdown)}
              tone={analytics.drawdown.maxDrawdown < -0.3 ? "negative" : "neutral"}
              hint={`Baisse en cours : ${percent(analytics.drawdown.currentDrawdown)}`}
            />
            <Metric
              label="VaR 95 % · 1 jour"
              value={`−${usd.format(analytics.tail.var95 * value)}`}
              tone="negative"
              hint={`CVaR : −${usd.format(analytics.tail.cvar95 * value)} en moyenne au-delà`}
            />
            <Metric
              label="Sharpe · Sortino"
              value={`${ratio(analytics.sharpe)} · ${ratio(analytics.sortino)}`}
              hint={analytics.beta !== null ? `Bêta à Bitcoin : ${ratio(analytics.beta)}` : "Référence Bitcoin indisponible"}
            />
            <Metric
              label="Première position"
              value={percent(analytics.assetConcentration.topWeight, 0).replace("+", "")}
              hint={analytics.assetConcentration.weights[0]?.key ?? "—"}
            />
            <Metric
              label="Positions effectives"
              value={analytics.assetConcentration.effectiveCount.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}
              hint="Inverse de l'indice de Herfindahl"
            />
            <Metric
              label="Réserve en stablecoins"
              value={percent(analytics.stablecoinWeight, 0).replace("+", "")}
              hint="Mobilisable sans rien vendre"
            />
            <Metric
              label="Choc de −30 %"
              value={analytics.topAssetShock ? `−${usd.format(analytics.topAssetShock.impact * value)}` : "—"}
              tone="negative"
              hint={analytics.topAssetShock ? `Sur ${analytics.topAssetShock.key}, la première position` : undefined}
            />
          </MetricGrid>
        </Reveal>
      </section>

      {/* ─── Conformité ─── */}
      <section className="space-y-4">
        <Reveal>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionLabel index="05">Prêt pour un contrôle ?</SectionLabel>
            <MoreLink href="/dashboard/audit">Dossier de contrôle</MoreLink>
          </div>
        </Reveal>
        <Reveal delay={60}>
          <div className="float-card overflow-hidden">
            <div className="flex items-center gap-4 border-b border-line px-5 py-4">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface" aria-hidden>
                <div
                  className={cn("h-full rounded-full", readiness.score >= 0.9 ? "bg-jade" : readiness.score >= 0.6 ? "bg-chart-4" : "bg-negative")}
                  style={{ width: `${Math.round(readiness.score * 100)}%` }}
                />
              </div>
              <span className="num text-sm font-bold">{Math.round(readiness.score * 100)} %</span>
            </div>
            <ul className="grid gap-px bg-line sm:grid-cols-2">
              {readiness.checks.map((check) => (
                <li key={check.id} className="bg-card px-5 py-3">
                  <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        check.status === "ok" ? "bg-jade" : check.status === "warn" ? "bg-chart-4" : "bg-faint"
                      )}
                      aria-hidden
                    />
                    {check.title}
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{check.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
