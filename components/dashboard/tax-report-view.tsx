"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { FileText, Download, TrendingUp, TrendingDown, Info, AlertTriangle, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TaxYearReport, TaxableEvent, TaxReportResult } from "@/convex/taxReport";

const usd = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const qty = new Intl.NumberFormat("fr-FR", { maximumSignificantDigits: 6 });
const pct = new Intl.NumberFormat("fr-FR", { style: "percent", minimumFractionDigits: 1 });

function exportCsv(report: TaxYearReport) {
  const header = ["Date", "Actif", "Quantité vendue", "Prix de cession (USD)", "Prix de revient (USD)", "Plus/Moins-value (USD)", "Source"];
  const rows = report.events.map((e) => [
    new Date(e.date).toLocaleDateString("fr-FR"),
    e.asset,
    e.quantity.toString(),
    e.proceedsUsd.toFixed(2),
    e.costBasisUsd.toFixed(2),
    e.gainLossUsd.toFixed(2),
    e.source,
  ]);
  const csv = [header, ...rows].map((r) => r.join(";")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `declaration-fiscale-${report.year}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function SummaryCard({
  label,
  value,
  sub,
  variant = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  variant?: "positive" | "negative" | "neutral" | "warning";
}) {
  const color =
    variant === "positive"
      ? "text-emerald-500"
      : variant === "negative"
        ? "text-red-500"
        : variant === "warning"
          ? "text-amber-500"
          : "text-foreground";
  return (
    <Card className="border-border/60 bg-card/80">
      <CardHeader className="pb-2">
        <CardDescription className="text-xs">{label}</CardDescription>
        <CardTitle className={cn("num text-2xl", color)}>{value}</CardTitle>
      </CardHeader>
      {sub && (
        <CardContent className="pt-0">
          <span className="text-xs text-muted-foreground">{sub}</span>
        </CardContent>
      )}
    </Card>
  );
}

function EventsTable({ events }: { events: TaxableEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground">
        Aucune cession taxable cette année.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-xs text-muted-foreground">
            <th className="text-left py-2 px-3 font-medium">Date</th>
            <th className="text-left py-2 px-3 font-medium">Actif</th>
            <th className="text-right py-2 px-3 font-medium">Quantité</th>
            <th className="text-right py-2 px-3 font-medium">Prix de cession</th>
            <th className="text-right py-2 px-3 font-medium">Prix de revient</th>
            <th className="text-right py-2 px-3 font-medium">Plus/moins-value</th>
            <th className="text-left py-2 px-3 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e, i) => {
            const isGain = e.gainLossUsd >= 0;
            return (
              <tr
                key={i}
                className="border-b border-border/40 hover:bg-muted/30 transition-colors"
              >
                <td className="num py-2 px-3 text-muted-foreground">
                  {new Date(e.date).toLocaleDateString("fr-FR")}
                </td>
                <td className="py-2 px-3 font-medium">{e.asset}</td>
                <td className="num py-2 px-3 text-right text-muted-foreground">
                  {qty.format(e.quantity)}
                </td>
                <td className="num py-2 px-3 text-right">
                  {usd.format(e.proceedsUsd)}
                </td>
                <td className="num py-2 px-3 text-right text-muted-foreground">
                  {usd.format(e.costBasisUsd)}
                </td>
                <td
                  className={cn(
                    "num py-2 px-3 text-right font-medium",
                    isGain ? "text-emerald-500" : "text-red-500"
                  )}
                >
                  {isGain ? "+" : ""}
                  {usd.format(e.gainLossUsd)}
                </td>
                <td className="py-2 px-3">
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {e.source}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TaxReportView() {
  const result = useQuery(api.taxReport.computeTaxReport) as TaxReportResult | undefined;
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const availableYears = useMemo(() => {
    if (!result) return [currentYear];
    const years = [...result.availableYears];
    if (!years.includes(currentYear)) years.push(currentYear);
    return years.sort((a, b) => b - a);
  }, [result, currentYear]);

  // Default to the most recent year with any activity
  const effectiveYear = useMemo(() => {
    if (selectedYear !== null) return selectedYear;
    if (result && result.availableYears.length > 0) return result.availableYears[0];
    return currentYear;
  }, [selectedYear, result, currentYear]);

  const report = useMemo(
    () => result?.reports.find((r) => r.year === effectiveYear) ?? null,
    [result, effectiveYear]
  );

  const isLoading = result === undefined;
  const tradeCount = result?.tradeCountByYear[effectiveYear] ?? 0;

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-serif text-3xl font-normal leading-tight text-foreground">Déclaration fiscale</h1>
            <p className="text-sm text-muted-foreground">
              Calcul selon l&apos;article 150 VH bis du CGI — méthode proportionnelle (PFU 30%)
            </p>
          </div>
          {report && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportCsv(report)}
              className="shrink-0"
            >
              <Download className="w-3.5 h-3.5 mr-2" />
              Export CSV
            </Button>
          )}
        </div>

        {/* Year selector */}
        <div className="flex gap-1.5 flex-wrap">
          {availableYears.map((y) => (
            <button
              key={y}
              onClick={() => setSelectedYear(y)}
              className={cn(
                "num px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                effectiveYear === y
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
              )}
            >
              {y}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="text-sm text-muted-foreground animate-pulse">
            Calcul en cours…
          </div>
        )}

        {!isLoading && !report && (
          <Card className="border-border/60 bg-card/80">
            <CardContent className="flex flex-col items-center py-12 text-center gap-3">
              <FileText className="w-10 h-10 text-muted-foreground/40" />
              <p className="font-medium">Aucune cession taxable en {effectiveYear}</p>
              {tradeCount > 0 ? (
                <div className="space-y-2 max-w-md text-sm text-muted-foreground">
                  <p>
                    <span className="text-foreground font-medium">{tradeCount} opérations</span> trouvées
                    cette année, mais aucune n&apos;est une vente contre monnaie légale (EUR, USD…).
                  </p>
                  {result?.hasOnlyStablecoinTrades && (
                    <p>
                      Tes trades sont des échanges <strong className="text-foreground">crypto ↔ stablecoin</strong>{" "}
                      (ex : BTCUSDT) — non taxables en France depuis la loi de finances 2019.
                    </p>
                  )}
                  <p className="text-xs mt-2">
                    Une cession taxable nécessite une vente via la passerelle fiat Binance (EUR) ou
                    un trade sur une paire EUR directe (ex : BTCEUR, ETHEUR).
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground max-w-sm">
                  Aucune transaction importée pour {effectiveYear}.
                  Connectez vos exchanges pour générer votre déclaration.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {report && (
          <>
            {/* Threshold alert */}
            {report.isBelowThreshold && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 px-4 py-3">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    Seuil non atteint :
                  </span>{" "}
                  <span className="text-muted-foreground">
                    vos cessions totales ({usd.format(report.totalProceedsUsd)}) sont inférieures au
                    seuil d&apos;exonération de 305 € — aucun impôt dû, mais vous devez quand même déclarer.
                  </span>
                </div>
              </div>
            )}

            {/* Summary cards */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                label="Total des cessions"
                value={usd.format(report.totalProceedsUsd)}
                sub={`${report.events.length} cession${report.events.length > 1 ? "s" : ""} taxable${report.events.length > 1 ? "s" : ""}`}
              />
              <SummaryCard
                label="Prix de revient total"
                value={usd.format(report.totalCostBasisUsd)}
                sub="Méthode proportionnelle CGI"
              />
              <SummaryCard
                label="Plus-value nette"
                value={
                  (report.netGainLossUsd >= 0 ? "+" : "") +
                  usd.format(report.netGainLossUsd)
                }
                sub={
                  report.totalProceedsUsd > 0
                    ? pct.format(report.netGainLossUsd / report.totalProceedsUsd)
                    : undefined
                }
                variant={
                  report.netGainLossUsd > 0
                    ? "positive"
                    : report.netGainLossUsd < 0
                      ? "negative"
                      : "neutral"
                }
              />
              <SummaryCard
                label="Impôt estimé (PFU 30%)"
                value={report.isBelowThreshold ? "0 $ (exonéré)" : usd.format(report.estimatedTaxUsd)}
                sub={report.isBelowThreshold ? "Seuil 305 € non atteint" : "12,8% IR + 17,2% PS"}
                variant={report.estimatedTaxUsd > 0 ? "warning" : "neutral"}
              />
            </div>

            {/* Events table */}
            <Card className="border-border/60 bg-card/80">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold">Cessions taxables {effectiveYear}</CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Ventes de cryptomonnaies contre monnaie légale (EUR, USD, GBP…)
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {report.netGainLossUsd >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                    )}
                    {report.events.length} opération{report.events.length > 1 ? "s" : ""}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <EventsTable events={report.events} />
              </CardContent>
            </Card>

            {/* Cerfa 2086 breakdown */}
            <Card className="border-border/60 bg-card/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Receipt className="w-4 h-4" />
                  Récapitulatif Cerfa 2086
                </CardTitle>
                <CardDescription className="text-xs">
                  Données à reporter dans votre formulaire de déclaration
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid gap-2 text-sm">
                  {[
                    { label: "Prix de cession total (case 3AN / 3BN)", value: usd.format(report.totalProceedsUsd) },
                    { label: "Prix de revient total (case 3AO / 3BO)", value: usd.format(report.totalCostBasisUsd) },
                    {
                      label: "Plus-value ou moins-value nette",
                      value: (report.netGainLossUsd >= 0 ? "+" : "") + usd.format(report.netGainLossUsd),
                      highlight: true,
                    },
                    { label: "Impôt PFU estimé (30%)", value: usd.format(report.estimatedTaxUsd) },
                  ].map(({ label, value, highlight }) => (
                    <div
                      key={label}
                      className={cn(
                        "flex justify-between items-center py-1.5 px-2 rounded",
                        highlight ? "bg-muted/60 font-medium" : ""
                      )}
                    >
                      <span className={highlight ? "text-foreground" : "text-muted-foreground"}>{label}</span>
                      <span className={cn("num", highlight && report.netGainLossUsd >= 0 ? "text-emerald-500" : highlight ? "text-red-500" : "")}>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Legal disclaimer */}
        <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
          <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              <strong className="text-foreground">Méthode de calcul :</strong> Prix de revient
              proportionnel selon l&apos;art. 150 VH bis du CGI — le coût total d&apos;acquisition
              est réparti au prorata de chaque cession sur la valeur résiduelle du portefeuille.
            </p>
            <p>
              <strong className="text-foreground">Approximation :</strong> La valeur résiduelle
              est estimée à partir du coût d&apos;acquisition moyen (pas du cours de marché au
              moment de la cession). Pour une déclaration officielle, vérifiez les montants avec
              un comptable ou convertissez en EUR au taux de change du jour de chaque opération.
            </p>
            <p>
              Les échanges crypto-vers-crypto (y compris vers stablecoins) ne sont{" "}
              <strong className="text-foreground">pas des cessions taxables</strong> en France
              depuis la loi de finances 2019. Seules les conversions en monnaie légale sont
              comptabilisées ici.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
