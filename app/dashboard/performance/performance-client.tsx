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
import { useCorrelationMatrix } from "@/hooks/dashboard/useCorrelationMatrix";
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
    <div className="flex h-full flex-col gap-1 bg-card px-5 py-4">
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">{label}</span>
      <span
        className={cn(
          "num font-semibold tracking-[-0.02em]",
          large ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
          tone === "neutral" && "text-foreground"
        )}
      >
        {value}
      </span>
      {hint && <span className="text-xs leading-snug text-muted-foreground">{hint}</span>}
    </div>
  );
}

function SectionLabel({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="chip chip-violet num px-2 py-0.5 text-[11px]">{index}</span>
      <h2 className="title text-xl text-foreground sm:text-2xl">{children}</h2>
    </div>
  );
}

/** Grille de cellules séparées par un filet, posée dans une carte. */
function MetricGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="float-card overflow-hidden">
      <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">{children}</div>
    </div>
  );
}

/** Avertissement doux : bloc gris, mention en ambre. */
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl bg-surface px-4 py-3 text-sm leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

/** Barre de poids : une jauge arrondie. */
function WeightBar({ weight }: { weight: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface" aria-hidden="true">
      <div
        className="h-full rounded-full bg-violet"
        style={{ width: `${Math.min(weight * 100, 100)}%` }}
      />
    </div>
  );
}

/** Liste de poids (actifs, plateformes) : libellé, part et jauge. */
function WeightList({ entries }: { entries: { key: string; weight: number }[] }) {
  return (
    <ul className="divide-y divide-line">
      {entries.map((entry) => (
        <li key={entry.key} className="px-5 py-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm font-bold text-foreground">{entry.key}</span>
            <span className="num text-sm text-muted-foreground">
              {(entry.weight * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
            </span>
          </div>
          <div className="mt-2">
            <WeightBar weight={entry.weight} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PerformanceClient() {
  const [windowId, setWindowId] = useState<AnalysisWindowId>("all");
  const analytics = usePortfolioAnalytics(windowId);
  const correlation = useCorrelationMatrix(
    analytics.assetConcentration.weights.map((entry) => entry.key)
  );

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
    attribution,
  } = analytics;

  const hasSeries = indexSeries.length >= 2;
  const topVenue = venueConcentration.weights[0];

  return (
    <div className="space-y-10 p-4 sm:p-6 md:p-8">
      <header>
        <p className="eyebrow">Performance et risque</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <h1 className="title text-3xl text-foreground sm:text-4xl">
            Êtes-vous vraiment <span className="text-jade">bon</span> ?
          </h1>

          <div
            className="flex max-w-full overflow-x-auto rounded-full bg-surface p-0.5"
            role="group"
            aria-label="Fenêtre d'analyse"
          >
            {ANALYSIS_WINDOWS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setWindowId(entry.id)}
                aria-pressed={windowId === entry.id}
                className={cn(
                  "num shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] transition-colors",
                  windowId === entry.id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {!hasEnoughHistory && (
        <Notice>
          <span className="font-bold text-chart-4">Historique court</span> — {observedDays} jour
          {observedDays > 1 ? "s" : ""} observé{observedDays > 1 ? "s" : ""}. En dessous d&apos;une
          trentaine de jours, les ratios annualisés relèvent davantage du bruit que de la mesure.
          Ils sont affichés pour information.
        </Notice>
      )}

      {/* ─── 01 · Rendement ─── */}
      <section className="space-y-4">
        <Reveal>
          <SectionLabel index="01">Rendement</SectionLabel>
        </Reveal>

        <Reveal delay={60}>
          <MetricGrid>
            <Metric
              large
              label="Pondéré par le temps"
              value={percent(timeWeightedReturn)}
              tone={timeWeightedReturn >= 0 ? "positive" : "negative"}
              hint="Vos décisions d'allocation, hors effet du calendrier des apports."
            />
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
            <Metric
              label="Annualisé"
              value={percent(annualizedReturn)}
              tone={annualizedReturn >= 0 ? "positive" : "negative"}
              hint={`Extrapolé sur ${observedDays} jours d'historique.`}
            />
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
          </MetricGrid>
        </Reveal>
      </section>

      {/* ─── 02 · Trajectoire ─── */}
      {hasSeries && (
        <section className="space-y-4">
          <Reveal>
            <SectionLabel index="02">Trajectoire</SectionLabel>
          </Reveal>

          <Reveal delay={60}>
            <div className="float-card p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">
                  Base 100 · contre achat-conservation Bitcoin
                </p>
                <div className="flex items-center gap-4 text-[11px] text-muted-foreground" aria-hidden>
                  <span className="flex items-center gap-1.5">
                    <span className="h-0.5 w-4 rounded-full bg-chart-1" /> Portefeuille
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-0 w-4 border-t-2 border-dashed border-chart-4" /> Bitcoin
                  </span>
                </div>
              </div>
              <ChartContainer
                config={{
                  portfolio: { label: "Portefeuille", color: "var(--chart-1)" },
                  benchmark: { label: "Bitcoin", color: "var(--chart-4)" },
                }}
                className="h-[240px] w-full sm:h-[300px]"
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
      <section className="space-y-4">
        <Reveal>
          <SectionLabel index="03">Risque</SectionLabel>
        </Reveal>

        <Reveal delay={60}>
          <MetricGrid>
            <Metric
              label="Volatilité annualisée"
              value={percent(annualVolatility, 1)}
              hint="Amplitude des variations quotidiennes, ramenée à l'année."
            />
            <Metric
              label="Perte maximale"
              value={percent(drawdown.maxDrawdown)}
              tone={drawdown.maxDrawdown < -0.3 ? "negative" : "neutral"}
              hint={`Du ${dateLabel(drawdown.peakDayUtc)} au ${dateLabel(drawdown.troughDayUtc)}.`}
            />
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
            <Metric
              label="Sensibilité à Bitcoin"
              value={portfolioBeta === null ? "—" : ratio(portfolioBeta)}
              hint={
                portfolioBeta === null
                  ? "Référence indisponible."
                  : `Une baisse de 10 % de BTC vous coûte environ ${(portfolioBeta * 10).toFixed(1)} %.`
              }
            />
          </MetricGrid>
        </Reveal>

        <Reveal delay={60}>
          <MetricGrid>
            <Metric
              label="Sharpe"
              value={ratio(sharpe)}
              hint="Rendement par unité de volatilité totale."
            />
            <Metric
              label="Sortino"
              value={ratio(sortino)}
              hint="Même mesure, mais seule la volatilité baissière est pénalisée."
            />
            <Metric
              label="Calmar"
              value={ratio(calmar)}
              hint="Rendement annualisé rapporté à la pire perte subie."
            />
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
          </MetricGrid>
        </Reveal>
      </section>

      {/* ─── 04 · Concentration ─── */}
      <section className="space-y-4">
        <Reveal>
          <SectionLabel index="04">Concentration</SectionLabel>
        </Reveal>

        <div className="grid gap-4 lg:grid-cols-12">
          <Reveal delay={60} className="lg:col-span-7">
            <div className="float-card h-full overflow-hidden">
              <p className="border-b border-line px-5 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-faint">
                Répartition par actif
              </p>
              {assetConcentration.weights.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground">
                  Aucune position valorisée pour le moment.
                </p>
              ) : (
                <WeightList entries={assetConcentration.weights.slice(0, 10)} />
              )}
            </div>
          </Reveal>

          <div className="lg:col-span-5">
            <Reveal delay={120}>
              <div className="float-card grid gap-px overflow-hidden bg-line">
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
                  value={`${(stablecoinWeight * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`}
                  hint="La part immédiatement mobilisable, sans vendre de position."
                />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── 05 · Attribution ─── */}
      <section className="space-y-4">
        <Reveal>
          <SectionLabel index="05">D&apos;où vient le résultat</SectionLabel>
        </Reveal>

        <Reveal delay={60}>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            L&apos;intérêt n&apos;est pas le classement des gains, c&apos;est l&apos;écart entre le
            poids d&apos;une ligne et sa contribution. Une position à 5 % du portefeuille qui
            produit 60 % du résultat ne dit pas la même chose que l&apos;inverse.
          </p>
        </Reveal>

        <Reveal delay={120}>
          {attribution.rows.length === 0 ? (
            <Notice>Aucune position valorisée pour le moment.</Notice>
          ) : (
            <div className="float-card overflow-x-auto">
              <table className="w-full border-collapse sm:min-w-[560px]">
                <thead>
                  <tr className="border-b border-line bg-surface/60">
                    <th className="py-3 pl-5 pr-4 text-left text-[10px] font-bold uppercase tracking-[0.16em] text-faint">
                      Actif
                    </th>
                    <th className="py-3 pr-4 text-right text-[10px] font-bold uppercase tracking-[0.16em] text-faint">
                      Poids
                    </th>
                    <th className="hidden py-3 pr-4 sm:table-cell text-right text-[10px] font-bold uppercase tracking-[0.16em] text-faint">
                      Rendement propre
                    </th>
                    <th className="py-3 pr-4 text-right text-[10px] font-bold uppercase tracking-[0.16em] text-faint">
                      Résultat
                    </th>
                    <th className="py-3 pr-5 text-right text-[10px] font-bold uppercase tracking-[0.16em] text-faint">
                      Part du résultat
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {attribution.rows.slice(0, 12).map((row) => {
                    // Une ligne dont la part de résultat dépasse nettement le
                    // poids porte le portefeuille — ou le plombe.
                    const isDriver = Math.abs(row.shareOfResult) > row.weight * 1.5;
                    return (
                      <tr
                        key={row.key}
                        className="border-b border-line transition-colors last:border-b-0 hover:bg-surface/60"
                      >
                        <td className="py-3 pl-5 pr-4 text-sm font-bold text-foreground">
                          {row.key}
                          {isDriver && (
                            <span className="chip chip-violet ml-2 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]">
                              moteur
                            </span>
                          )}
                        </td>
                        <td className="num py-3 pr-4 text-right text-sm text-muted-foreground">
                          {(row.weight * 100).toFixed(1)} %
                        </td>
                        <td
                          className={cn(
                            "num hidden py-3 pr-4 text-right text-sm sm:table-cell",
                            row.ownReturn >= 0 ? "text-positive" : "text-negative"
                          )}
                        >
                          {percent(row.ownReturn)}
                        </td>
                        <td
                          className={cn(
                            "num py-3 pr-4 text-right text-sm",
                            row.pnlUsd >= 0 ? "text-positive" : "text-negative"
                          )}
                        >
                          {row.pnlUsd.toLocaleString("fr-FR", {
                            style: "currency",
                            currency: "USD",
                            maximumFractionDigits: 0,
                          })}
                        </td>
                        <td className="num py-3 pr-5 text-right text-sm text-foreground">
                          {(row.shareOfResult * 100).toFixed(0)} %
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Reveal>
      </section>

      {/* ─── 06 · Corrélations ─── */}
      <section className="space-y-4">
        <Reveal>
          <SectionLabel index="06">Corrélations</SectionLabel>
        </Reveal>

        <Reveal delay={60}>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Détenir dix jetons qui montent et descendent ensemble n&apos;est pas de la
            diversification : c&apos;est une seule position en dix exemplaires. Une corrélation
            proche de 1 signifie qu&apos;une baisse les emportera tous.
          </p>
        </Reveal>

        <Reveal delay={120}>
          {correlation.isLoading ? (
            <Notice>Chargement de l&apos;historique de cours…</Notice>
          ) : correlation.matrix.keys.length < 2 ? (
            <Notice>
              Il faut au moins deux actifs disposant d&apos;un historique de cours commun pour
              calculer une corrélation.
            </Notice>
          ) : (
            <div className="float-card overflow-hidden">
              <div className="border-b border-line px-5 py-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">
                  Corrélation moyenne
                </p>
                <p
                  className={cn(
                    "num mt-1 text-3xl font-semibold tracking-[-0.02em]",
                    correlation.matrix.averagePairwise > 0.8
                      ? "text-negative"
                      : correlation.matrix.averagePairwise > 0.5
                        ? "text-chart-4"
                        : "text-positive"
                  )}
                >
                  {ratio(correlation.matrix.averagePairwise)}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {correlation.matrix.averagePairwise > 0.8
                    ? "Vos positions se comportent comme une seule ligne."
                    : correlation.matrix.averagePairwise > 0.5
                      ? "Diversification partielle : les baisses restent largement communes."
                      : "Vos positions réagissent différemment aux mêmes mouvements."}{" "}
                  Calculé sur {correlation.matrix.observations} jours communs.
                </p>
              </div>

              <div className="overflow-x-auto px-3 py-3 sm:px-4">
                <table className="border-separate border-spacing-1 text-sm">
                  <thead>
                    <tr>
                      <th className="num sticky left-0 bg-card py-2 pr-3 text-left text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        &nbsp;
                      </th>
                      {correlation.matrix.keys.map((key) => (
                        <th
                          key={key}
                          className="num px-3 py-2 text-center text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
                        >
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {correlation.matrix.keys.map((rowKey, rowIndex) => (
                      <tr key={rowKey}>
                        <th className="num sticky left-0 bg-card py-2 pr-3 text-left text-xs font-normal text-foreground">
                          {rowKey}
                        </th>
                        {correlation.matrix.values[rowIndex].map((value, columnIndex) => (
                          <td
                            key={`${rowKey}-${correlation.matrix.keys[columnIndex]}`}
                            className="num rounded-md px-3 py-2 text-center text-xs"
                            style={{
                              // L'intensité porte l'information ; la teinte
                              // distingue seulement le sens de la relation.
                              backgroundColor:
                                rowIndex === columnIndex
                                  ? "transparent"
                                  : `color-mix(in srgb, var(${value >= 0 ? "--negative" : "--positive"}) ${Math.round(Math.abs(value) * 22)}%, transparent)`,
                              color:
                                rowIndex === columnIndex
                                  ? "var(--muted-foreground)"
                                  : "var(--foreground)",
                            }}
                          >
                            {rowIndex === columnIndex ? "—" : value.toFixed(2)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {correlation.missingSymbols.length > 0 && (
                <p className="border-t border-line px-5 py-3 text-[11px] text-muted-foreground">
                  Sans historique : {correlation.missingSymbols.join(" · ")}
                </p>
              )}
            </div>
          )}
        </Reveal>
      </section>

      {/* ─── 07 · Contrepartie ─── */}
      <section className="space-y-4">
        <Reveal>
          <SectionLabel index="07">Risque de contrepartie</SectionLabel>
        </Reveal>

        <Reveal delay={60}>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Un actif conservé sur une plateforme ne vous appartient qu&apos;à hauteur de la solidité
            de celle-ci. Cette répartition dit où se trouve réellement votre portefeuille.
          </p>
        </Reveal>

        <Reveal delay={120}>
          {venueConcentration.weights.length === 0 ? (
            <Notice>Aucune source valorisée pour le moment.</Notice>
          ) : (
            <div className="space-y-4">
              {topVenue && topVenue.weight > 0.5 && (
                <Notice>
                  <span className="num font-bold text-chart-4">
                    {(topVenue.weight * 100).toFixed(0)} %
                  </span>{" "}
                  de votre portefeuille est conservé sur {topVenue.key}. Une défaillance de cette
                  seule contrepartie emporterait la majorité de vos actifs.
                </Notice>
              )}
              <div className="float-card overflow-hidden">
                <WeightList entries={venueConcentration.weights} />
              </div>
            </div>
          )}
        </Reveal>
      </section>

      <p className="text-center text-[11px] text-faint">
        Calculs effectués sur {observedDays} jours · rendements neutralisés des apports
      </p>
    </div>
  );
}
