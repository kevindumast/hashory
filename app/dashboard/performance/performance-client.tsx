"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Reveal } from "@/components/motion";
import {
  ANALYSIS_WINDOWS,
  usePortfolioAnalytics,
  type AnalysisWindowId,
} from "@/hooks/dashboard/usePortfolioAnalytics";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { cn } from "@/lib/utils";

const percent = (value: number, digits = 1) =>
  `${value >= 0 ? "+" : ""}${(value * 100).toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} %`;

const ratio = (value: number) =>
  value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dateLabel = (dayUtc: number | null) =>
  dayUtc === null
    ? "—"
    : new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(
        new Date(dayUtc)
      );

/** Une valeur chiffrée avec son libellé et sa lecture. */
function Metric({
  label,
  value,
  hint,
  tone = "neutral",
  large = false,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "positive" | "negative";
  large?: boolean;
}) {
  return (
    <div className="border-b border-border/60 px-6 py-6">
      <p className="num text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">{label}</p>
      <p
        className={cn(
          "num mt-3 font-normal tracking-tight",
          large ? "text-4xl" : "text-2xl",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
          tone === "neutral" && "text-foreground"
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SectionLabel({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 border-b border-border/60 pb-4">
      <span className="num text-xs text-primary">{index}</span>
      <span className="num text-xs uppercase tracking-[0.28em] text-muted-foreground">
        {children}
      </span>
    </div>
  );
}

/** Barre de poids : un filet plein sur un filet vide. */
function WeightBar({ weight }: { weight: number }) {
  return (
    <div className="h-px w-full bg-border" aria-hidden="true">
      <div className="h-px bg-primary" style={{ width: `${Math.min(weight * 100, 100)}%` }} />
    </div>
  );
}

export function PerformanceClient() {
  const [windowId, setWindowId] = useState<AnalysisWindowId>("all");
  const analytics = usePortfolioAnalytics(windowId);

  if (analytics.isLoading) return <DashboardSkeleton />;

  const {
    observedDays,
    hasEnoughHistory,
    timeWeightedReturn,
    annualizedReturn,
    moneyWeightedReturn: mwr,
    volatility: annualVolatility,
    sharpe,
    sortino,
    calmar,
    drawdown,
    indexSeries,
    benchmarkReturn,
    excessReturn,
    beta: portfolioBeta,
    correlationToBenchmark,
    alpha,
    assetConcentration,
    venueConcentration,
    stablecoinWeight,
    topAssetShock,
  } = analytics;

  const hasSeries = indexSeries.length >= 2;
  const topVenue = venueConcentration.weights[0];

  return (
    <div className="space-y-10 p-6 md:p-8">
      <header className="border-b border-border/60 pb-5">
        <p className="num flex items-center gap-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          <span className="h-px w-6 bg-primary" />
          Performance et risque
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-serif text-3xl font-normal leading-tight text-foreground">
            Êtes-vous vraiment bon ?
          </h1>

          <div className="flex border border-border/60" role="group" aria-label="Fenêtre d'analyse">
            {ANALYSIS_WINDOWS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setWindowId(entry.id)}
                aria-pressed={windowId === entry.id}
                className={cn(
                  "num cursor-pointer px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] transition-colors",
                  windowId === entry.id
                    ? "bg-muted/40 text-foreground"
                    : "text-muted-foreground hover:bg-muted/20 hover:text-foreground"
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {!hasEnoughHistory && (
        <p className="border-l-2 border-chart-4 py-3 pl-4 text-sm leading-relaxed text-muted-foreground">
          <span className="text-chart-4">Historique court</span> — {observedDays} jour
          {observedDays > 1 ? "s" : ""} observé{observedDays > 1 ? "s" : ""}. En dessous d&apos;une
          trentaine de jours, les ratios annualisés relèvent davantage du bruit que de la mesure.
          Ils sont affichés pour information.
        </p>
      )}

      {/* ─── 01 · Rendement ─── */}
      <section>
        <Reveal>
          <SectionLabel index="01">Rendement</SectionLabel>
        </Reveal>

        <div className="grid border-t border-border/60 sm:grid-cols-2 lg:grid-cols-4">
          <Reveal delay={0}>
            <Metric
              large
              label="Pondéré par le temps"
              value={percent(timeWeightedReturn)}
              tone={timeWeightedReturn >= 0 ? "positive" : "negative"}
              hint="Vos décisions d'allocation, hors effet du calendrier des apports."
            />
          </Reveal>
          <Reveal delay={60}>
            <Metric
              large
              label="Pondéré par les flux"
              value={mwr === null ? "—" : percent(mwr)}
              tone={mwr === null ? "neutral" : mwr >= 0 ? "positive" : "negative"}
              hint={
                mwr === null
                  ? "Nécessite au moins un apport puis une valeur de sortie."
                  : "Ce que votre argent a réellement rapporté, calendrier compris."
              }
            />
          </Reveal>
          <Reveal delay={120}>
            <Metric
              label="Annualisé"
              value={percent(annualizedReturn)}
              tone={annualizedReturn >= 0 ? "positive" : "negative"}
              hint={`Extrapolé sur ${observedDays} jours d'historique.`}
            />
          </Reveal>
          <Reveal delay={180}>
            <Metric
              label="Face à Bitcoin"
              value={excessReturn === null ? "—" : percent(excessReturn)}
              tone={excessReturn === null ? "neutral" : excessReturn >= 0 ? "positive" : "negative"}
              hint={
                benchmarkReturn === null
                  ? "Référence indisponible sur cette fenêtre."
                  : `Bitcoin a fait ${percent(benchmarkReturn)} sur la même période.`
              }
            />
          </Reveal>
        </div>
      </section>

      {/* ─── 02 · Trajectoire ─── */}
      {hasSeries && (
        <section>
          <Reveal>
            <SectionLabel index="02">Trajectoire</SectionLabel>
          </Reveal>

          <Reveal delay={60}>
            <div className="mt-6 border border-border/60 p-5">
              <p className="num mb-5 text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">
                Base 100 · portefeuille contre achat-conservation Bitcoin
              </p>
              <ChartContainer
                config={{
                  portfolio: { label: "Portefeuille", color: "var(--chart-1)" },
                  benchmark: { label: "Bitcoin", color: "var(--chart-4)" },
                }}
                className="h-[300px] w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={indexSeries} margin={{ left: 4, right: 4, top: 4, bottom: 4 }}>
                    <defs>
                      <linearGradient id="portfolio-area" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                    <XAxis
                      dataKey="dayUtc"
                      tickLine={false}
                      axisLine={false}
                      minTickGap={48}
                      tick={{ fontSize: 10, className: "num" }}
                      tickFormatter={(value: number) =>
                        new Intl.DateTimeFormat("fr-FR", { month: "short", day: "numeric" }).format(
                          new Date(value)
                        )
                      }
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={44}
                      tick={{ fontSize: 10, className: "num" }}
                      domain={["auto", "auto"]}
                    />
                    {/* labelFormatter appartient au Tooltip Recharts, qui
                        transmet ensuite le libellé formaté au contenu. */}
                    <ChartTooltip
                      labelFormatter={(value: React.ReactNode) => dateLabel(Number(value))}
                      content={
                        <ChartTooltipContent
                          className="num"
                          formatter={(value: number) => value.toFixed(1)}
                        />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="portfolio"
                      stroke="var(--chart-1)"
                      strokeWidth={2}
                      fill="url(#portfolio-area)"
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="benchmark"
                      stroke="var(--chart-4)"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          </Reveal>
        </section>
      )}

      {/* ─── 03 · Risque ─── */}
      <section>
        <Reveal>
          <SectionLabel index="03">Risque</SectionLabel>
        </Reveal>

        <div className="grid border-t border-border/60 sm:grid-cols-2 lg:grid-cols-4">
          <Reveal delay={0}>
            <Metric
              label="Volatilité annualisée"
              value={percent(annualVolatility, 1)}
              hint="Amplitude des variations quotidiennes, ramenée à l'année."
            />
          </Reveal>
          <Reveal delay={60}>
            <Metric
              label="Perte maximale"
              value={percent(drawdown.maxDrawdown)}
              tone={drawdown.maxDrawdown < -0.3 ? "negative" : "neutral"}
              hint={`Du ${dateLabel(drawdown.peakDayUtc)} au ${dateLabel(drawdown.troughDayUtc)}.`}
            />
          </Reveal>
          <Reveal delay={120}>
            <Metric
              label="Baisse en cours"
              value={percent(drawdown.currentDrawdown)}
              tone={drawdown.currentDrawdown < 0 ? "negative" : "positive"}
              hint={
                drawdown.recoveryDayUtc
                  ? `Sommet retrouvé le ${dateLabel(drawdown.recoveryDayUtc)}.`
                  : `${drawdown.longestUnderwaterDays} jours sous le dernier sommet.`
              }
            />
          </Reveal>
          <Reveal delay={180}>
            <Metric
              label="Sensibilité à Bitcoin"
              value={portfolioBeta === null ? "—" : ratio(portfolioBeta)}
              hint={
                portfolioBeta === null
                  ? "Référence indisponible."
                  : `Une baisse de 10 % de BTC vous coûte environ ${(portfolioBeta * 10).toFixed(1)} %.`
              }
            />
          </Reveal>
        </div>

        <div className="grid border-t border-border/60 sm:grid-cols-2 lg:grid-cols-4">
          <Reveal delay={0}>
            <Metric
              label="Sharpe"
              value={ratio(sharpe)}
              hint="Rendement par unité de volatilité totale."
            />
          </Reveal>
          <Reveal delay={60}>
            <Metric
              label="Sortino"
              value={ratio(sortino)}
              hint="Même mesure, mais seule la volatilité baissière est pénalisée."
            />
          </Reveal>
          <Reveal delay={120}>
            <Metric
              label="Calmar"
              value={ratio(calmar)}
              hint="Rendement annualisé rapporté à la pire perte subie."
            />
          </Reveal>
          <Reveal delay={180}>
            <Metric
              label="Alpha annualisé"
              value={alpha === null ? "—" : percent(alpha)}
              tone={alpha === null ? "neutral" : alpha >= 0 ? "positive" : "negative"}
              hint={
                correlationToBenchmark === null
                  ? "Référence indisponible."
                  : `Corrélation à Bitcoin : ${ratio(correlationToBenchmark)}.`
              }
            />
          </Reveal>
        </div>
      </section>

      {/* ─── 04 · Concentration ─── */}
      <section>
        <Reveal>
          <SectionLabel index="04">Concentration</SectionLabel>
        </Reveal>

        <div className="mt-6 grid gap-10 lg:grid-cols-12">
          <Reveal delay={60} className="lg:col-span-7">
            <p className="num border-b border-border/60 pb-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">
              Répartition par actif
            </p>
            {assetConcentration.weights.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">
                Aucune position valorisée pour le moment.
              </p>
            ) : (
              <ul>
                {assetConcentration.weights.slice(0, 10).map((entry) => (
                  <li key={entry.key} className="border-b border-border/60 py-3">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-sm text-foreground">{entry.key}</span>
                      <span className="num text-sm text-muted-foreground">
                        {(entry.weight * 100).toFixed(1)} %
                      </span>
                    </div>
                    <div className="mt-2">
                      <WeightBar weight={entry.weight} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Reveal>

          <div className="lg:col-span-5">
            <Reveal delay={120}>
              <div className="border-t border-border/60">
                <Metric
                  label="Positions effectives"
                  value={assetConcentration.effectiveCount.toFixed(1)}
                  hint={`Sur ${assetConcentration.weights.length} ligne${
                    assetConcentration.weights.length > 1 ? "s" : ""
                  } détenue${assetConcentration.weights.length > 1 ? "s" : ""}. Un écart marqué signale une diversification illusoire.`}
                />
                <Metric
                  label="Choc sur la première position"
                  value={topAssetShock ? `−${(topAssetShock.impact * 100).toFixed(1)} %` : "—"}
                  tone={topAssetShock && topAssetShock.impact > 0.15 ? "negative" : "neutral"}
                  hint={
                    topAssetShock
                      ? `Ce que coûterait une chute de 30 % de ${topAssetShock.key}.`
                      : undefined
                  }
                />
                <Metric
                  label="Réserve en stablecoins"
                  value={`${(stablecoinWeight * 100).toFixed(1)} %`}
                  hint="La part immédiatement mobilisable, sans vendre de position."
                />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── 05 · Contrepartie ─── */}
      <section>
        <Reveal>
          <SectionLabel index="05">Risque de contrepartie</SectionLabel>
        </Reveal>

        <Reveal delay={60}>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Un actif conservé sur une plateforme ne vous appartient qu&apos;à hauteur de la solidité
            de celle-ci. Cette répartition dit où se trouve réellement votre portefeuille.
          </p>
        </Reveal>

        <Reveal delay={120}>
          {venueConcentration.weights.length === 0 ? (
            <p className="mt-6 border-t border-border/60 py-6 text-sm text-muted-foreground">
              Aucune source valorisée pour le moment.
            </p>
          ) : (
            <>
              {topVenue && topVenue.weight > 0.5 && (
                <p className="mt-6 border-l-2 border-chart-4 py-3 pl-4 text-sm leading-relaxed text-muted-foreground">
                  <span className="num text-chart-4">
                    {(topVenue.weight * 100).toFixed(0)} %
                  </span>{" "}
                  de votre portefeuille est conservé sur {topVenue.key}. Une défaillance de cette
                  seule contrepartie emporterait la majorité de vos actifs.
                </p>
              )}
              <ul className="mt-6 border-t border-border/60">
                {venueConcentration.weights.map((entry) => (
                  <li key={entry.key} className="border-b border-border/60 py-3">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-sm text-foreground">{entry.key}</span>
                      <span className="num text-sm text-muted-foreground">
                        {(entry.weight * 100).toFixed(1)} %
                      </span>
                    </div>
                    <div className="mt-2">
                      <WeightBar weight={entry.weight} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Reveal>
      </section>

      <p className="num border-t border-border/60 pt-6 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">
        Calculs effectués sur {observedDays} jours · rendements neutralisés des apports
      </p>
    </div>
  );
}
