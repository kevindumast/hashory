"use client";

import { Fragment, useState, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { currencyFormatter, USD_STABLECOINS, type HistoryPoint, type ProfitSummary, type PortfolioToken } from "@/hooks/dashboard/useDashboardMetrics";
import { usePortfolioSnapshots } from "@/hooks/usePortfolioSnapshots";
import { TokenHistoryChart } from "@/components/dashboard/token-history-chart";
import { PortfolioStatement } from "@/components/dashboard/portfolio-statement";
import { PROVIDER_ICONS } from "@/lib/provider-icons";
import { usePlatformValueHistory } from "@/hooks/dashboard/usePlatformValueHistory";
import { useFxRates } from "@/hooks/useFxRates";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";

type ChartFilter =
  | { type: "all" }
  | { type: "token"; symbol: string }
  | { type: "platform"; provider: string };


function ProviderAvatar({ provider, name }: { provider: string; name: string }) {
  const src = PROVIDER_ICONS[provider.toLowerCase()];
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name} className="w-7 h-7 shrink-0 rounded-full object-cover border border-border bg-muted" />
  ) : (
    <div className="w-7 h-7 shrink-0 bg-muted rounded-full flex items-center justify-center text-[10px] font-semibold text-primary uppercase border border-border">
      {name.slice(0, 2)}
    </div>
  );
}

/** Couleurs de pile, empruntées aux jetons de graphique du thème. */
const PLATFORM_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const eurFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatAxisValue(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}M $`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1).replace(/\.0$/, "")}k $`;
  return `${sign}${Math.round(abs)} $`;
}
import { useCmcTokenMap } from "@/hooks/useCmcTokenMap";
import { LoaderCircle, RefreshCw, ChevronRight, X } from "lucide-react";

type DashboardNewLayoutProps = {
  profitSummary: ProfitSummary;
  historySeries: HistoryPoint[];
  portfolioTokens: PortfolioToken[];
  onOpenIntegrations: () => void;
};

const CHART_PERIODS = ["1D", "1W", "1M", "ALL"] as const;
type ChartPeriod = typeof CHART_PERIODS[number];

const monthLabelFormatter = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });

type HoldingsPoint = {
  timestamp: number;
  label: string;
  valueUsd: number;
  profitPercent: number;
  btcPercent: number;
  netInvestedUsd: number;
};

function aggregateHoldingsByPeriod(series: HoldingsPoint[], period: ChartPeriod): HoldingsPoint[] {
  if (!series.length) return [];
  if (period === "ALL" || period === "1D") return series;

  const bucketKey = (ts: number): string => {
    const d = new Date(ts);
    if (period === "1M") {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    }
    const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  };

  // Keep the last point of each bucket (closest to bucket end = freshest value)
  const buckets = new Map<string, HoldingsPoint>();
  for (const point of series) {
    buckets.set(bucketKey(point.timestamp), point);
  }
  const sorted = Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);

  if (period === "1M") {
    return sorted.map((point) => ({
      ...point,
      label: monthLabelFormatter.format(new Date(point.timestamp)),
    }));
  }
  return sorted;
}

export function DashboardNewLayout({
  profitSummary,
  historySeries,
  portfolioTokens,
  onOpenIntegrations,
}: DashboardNewLayoutProps) {
  const [activePeriod, setActivePeriod] = useState<ChartPeriod>("ALL");
  const [activeTab, setActiveTab] = useState<"jetons" | "plateformes">("jetons");
  const [sortColumn, setSortColumn] = useState<"symbol" | "qty" | "avgPrice" | "current" | "value" | "pnlTotal" | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [hideZeroBalance, setHideZeroBalance] = useState(true);
  const [showMarkers, setShowMarkers] = useState(false);
  const [chartFilter, setChartFilter] = useState<ChartFilter>({ type: "all" });
  const [expandedTokens, setExpandedTokens] = useState<Set<string>>(new Set());
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set());
  const { currentPrices, pricesLoading, pricesError, refreshPrices, refreshSymbol, refreshingSymbols } = useDashboardData();
  const { getCmcIconUrl } = useCmcTokenMap(portfolioTokens.map(t => t.symbol));
  const { snapshots: portfolioSnapshots, isComputing: snapshotsComputing } = usePortfolioSnapshots();

  const filteredTokens = useMemo(() => {
    if (!hideZeroBalance) return portfolioTokens;
    return portfolioTokens.filter(t => t.currentQuantity > 0.00001);
  }, [portfolioTokens, hideZeroBalance]);

  const platformCount = useMemo(() => {
    const set = new Set<string>();
    for (const token of portfolioTokens) {
      for (const ev of token.events) set.add(ev.provider);
    }
    return set.size;
  }, [portfolioTokens]);

  const totalCurrentValue = useMemo(() =>
    portfolioTokens.reduce((sum, token) => {
      const price = currentPrices[token.symbol];
      return price && token.currentQuantity > 0 ? sum + price * token.currentQuantity : sum;
    }, 0),
    [portfolioTokens, currentPrices]
  );

  const totalCostBasis = useMemo(() =>
    portfolioTokens.reduce((sum, token) => sum + token.avgCostBasis * token.currentQuantity, 0),
    [portfolioTokens]
  );

  const totalRealizedPnl = useMemo(() =>
    portfolioTokens.reduce((sum, token) => sum + token.realizedPnlAvco, 0),
    [portfolioTokens]
  );

  const hasCurrentPrices = Object.keys(currentPrices).length > 0;
  const totalProfit = hasCurrentPrices
    ? totalCurrentValue - totalCostBasis + totalRealizedPnl
    : profitSummary.totalProfitUsd;
  const profitPercent = totalCostBasis > 0
    ? (totalProfit / totalCostBasis) * 100
    : profitSummary.profitPercentage || 0;
  const unrealizedPnl = hasCurrentPrices ? totalCurrentValue - totalCostBasis : null;

  /** Clé d'axe unique : une journée ne peut pas apparaître deux fois. */
  function axisKeyOf(timestamp: number): string {
    return new Date(timestamp).toISOString().slice(0, 10);
  }

  /** Reconvertit la clé d'axe en date lisible pour l'infobulle. */
  function axisKeyToLabel(value: string | number): string {
    const parsed = Date.parse(String(value));
    if (Number.isNaN(parsed)) return String(value);
    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(parsed);
  }

  /** Libellé court affiché sous une graduation. */
  const tickLabelFormatter = new Intl.DateTimeFormat("fr-FR", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  /**
   * Graduation de l'axe : le mois sur la première ligne, l'année et un
   * séparateur sur la seconde au changement d'année.
   *
   * Tout est dérivé de la valeur portée par la graduation elle-même. L'indice
   * fourni par Recharts est celui de la graduation affichée, pas celui de la
   * donnée : avec `interval="preserveStartEnd"`, s'en servir pour indexer la
   * série revient à lire les premiers points au lieu des bons.
   */
  function makeXTick(series: { timestamp: number; axisKey: string }[]) {
    // Premier point de chaque année : c'est là que se place le séparateur.
    const firstOfYear = new Set<string>();
    let previousYear: number | null = null;
    for (const point of series) {
      const year = new Date(point.timestamp).getUTCFullYear();
      if (year !== previousYear) {
        firstOfYear.add(point.axisKey);
        previousYear = year;
      }
    }

    return function XTick(props: {
      x?: string | number;
      y?: string | number;
      payload?: { value: string | number };
    }) {
      const { x = 0, y = 0, payload } = props;
      const axisKey = String(payload?.value ?? "");
      const timestamp = Date.parse(axisKey);
      if (Number.isNaN(timestamp)) return <g />;

      const year = new Date(timestamp).getUTCFullYear();
      const isYearStart = firstOfYear.has(axisKey);

      return (
        <g transform={`translate(${x},${y})`}>
          {/* Month label */}
          <text
            className="num"
            dy={14}
            textAnchor="middle"
            fill="var(--muted-foreground)"
            fontSize={11}
          >
            {tickLabelFormatter.format(timestamp)}
          </text>

          {/* Year boundary */}
          {isYearStart && (
            <>
              {/* vertical separator line going up into the chart */}
              <line
                x1={0} x2={0} y1={-4} y2={-280}
                stroke="var(--border)"
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.35}
              />
              {/* year label */}
              <text
                className="num"
                dy={30}
                textAnchor="middle"
                fill="var(--muted-foreground)"
                fontSize={10}
                fontWeight="700"
                opacity={0.65}
              >
                {year}
              </text>
            </>
          )}
        </g>
      );
    };
  }

  // Snapshots = source of truth when available; falls back to client-computed history.
  const dayLabelFormatter = useMemo(
    () => new Intl.DateTimeFormat("fr-FR", { month: "short", day: "numeric", timeZone: "UTC" }),
    []
  );

  const holdingsSeries = useMemo<HoldingsPoint[]>(() => {
    if (portfolioSnapshots.length > 0) {
      return portfolioSnapshots.map((s) => ({
        timestamp: s.dayUtc,
        label: dayLabelFormatter.format(new Date(s.dayUtc)),
        valueUsd: s.valueUsd,
        profitPercent: s.netInvestedUsd > 0 ? ((s.valueUsd - s.netInvestedUsd) / s.netInvestedUsd) * 100 : 0,
        btcPercent: s.btcPercent,
        netInvestedUsd: s.netInvestedUsd,
      }));
    }
    return historySeries.map((p) => ({
      timestamp: p.timestamp,
      label: p.label,
      valueUsd: p.netInvestedUsd,
      profitPercent: 0,
      btcPercent: 0,
      netInvestedUsd: p.netInvestedUsd,
    }));
  }, [portfolioSnapshots, historySeries, dayLabelFormatter]);

  const periodPointCounts = useMemo(() => {
    const result = {} as Record<ChartPeriod, number>;
    for (const p of CHART_PERIODS) {
      result[p] = aggregateHoldingsByPeriod(holdingsSeries, p).length;
    }
    return result;
  }, [holdingsSeries]);

  const filteredHoldings = useMemo(
    () =>
      aggregateHoldingsByPeriod(holdingsSeries, activePeriod).map((point) => ({
        ...point,
        axisKey: axisKeyOf(point.timestamp),
      })),
    [holdingsSeries, activePeriod]
  );

  const chartIsPositive = useMemo(() => {
    if (filteredHoldings.length === 0) return true;
    return filteredHoldings[filteredHoldings.length - 1].valueUsd >= filteredHoldings[0].valueUsd;
  }, [filteredHoldings]);

  const profitGradientOffset = useMemo(() => {
    if (filteredHoldings.length === 0) return 0;
    const max = Math.max(...filteredHoldings.map((p) => p.profitPercent));
    const min = Math.min(...filteredHoldings.map((p) => p.profitPercent));
    if (max <= 0) return 0;
    if (min >= 0) return 1;
    return max / (max - min);
  }, [filteredHoldings]);

  const buySellDays = useMemo(() => {
    const buys = new Set<number>();
    const sells = new Set<number>();
    for (const token of portfolioTokens) {
      if (USD_STABLECOINS.has(token.symbol)) continue;
      if (chartFilter.type === "token" && token.symbol !== chartFilter.symbol) continue;
      for (const event of token.events) {
        if (event.type !== "BUY" && event.type !== "SELL") continue;
        if (!event.vsStablecoin) continue;
        if (chartFilter.type === "platform" && event.provider !== chartFilter.provider) continue;
        const d = new Date(event.timestamp);
        const dayTs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        if (event.type === "BUY") buys.add(dayTs);
        else sells.add(dayTs);
      }
    }
    return { buys, sells };
  }, [portfolioTokens, chartFilter]);

  const [chartMode, setChartMode] = useState<"total" | "platform">("total");
  const [displayCurrency, setDisplayCurrency] = useState<"USD" | "EUR">("USD");
  const { rateAt: fxRateAt } = useFxRates();

  /**
   * Montant dans la devise choisie.
   *
   * La conversion applique le taux du jour, y compris aux montants investis
   * par le passé : c'est une lecture en euros de valeurs tenues en dollars,
   * pas un recalcul du coût historique dans cette devise.
   */
  const money = (value: number): string => {
    const rate = displayCurrency === "EUR" ? fxRateAt(Date.now())?.eurPerUsd : null;
    if (!rate) return currencyFormatter.format(value);
    return eurFormatter.format(value * rate);
  };

  const chartDays = useMemo(
    () => filteredHoldings.map((point) => point.timestamp),
    [filteredHoldings]
  );
  const platformHistory = usePlatformValueHistory(portfolioTokens, chartDays);

  /** Série empilée : une clé par plateforme, alignée sur l'axe commun. */
  const stackedSeries = useMemo(() => {
    if (platformHistory.points.length !== filteredHoldings.length) return [];
    return filteredHoldings.map((point, index) => ({
      axisKey: point.axisKey,
      timestamp: point.timestamp,
      ...platformHistory.points[index].byPlatform,
    }));
  }, [filteredHoldings, platformHistory.points]);

  const holdingsWithMarkers = useMemo(
    () =>
      filteredHoldings.map((p) => ({
        ...p,
        buyMarker: buySellDays.buys.has(p.timestamp) ? p.valueUsd : null,
        sellMarker: buySellDays.sells.has(p.timestamp) ? p.valueUsd : null,
      })),
    [filteredHoldings, buySellDays]
  );


  return (
    <div className="space-y-5">

      {/* ── Relevé de position ── */}
      <PortfolioStatement
        tokens={portfolioTokens}
        currentPrices={currentPrices}
        hasPrices={hasCurrentPrices}
        totalValueUsd={totalCurrentValue}
        costBasisUsd={totalCostBasis}
        unrealizedPnlUsd={unrealizedPnl}
        realizedPnlUsd={totalRealizedPnl}
        totalProfitUsd={totalProfit}
        profitPercent={profitPercent}
      />


      {/* ── Period selector + filter pill ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <p className="num text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Période</p>
          {chartFilter.type !== "all" && (
            <button
              onClick={() => setChartFilter({ type: "all" })}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
              title="Cliquez pour afficher tous les marqueurs"
            >
              <span className="uppercase tracking-wide opacity-70">Marqueurs</span>
              <span>
                {chartFilter.type === "token"
                  ? chartFilter.symbol
                  : (() => {
                      const ev = portfolioTokens
                        .flatMap((t) => t.events)
                        .find((e) => e.provider === chartFilter.provider);
                      return ev?.providerDisplayName ?? chartFilter.provider;
                    })()}
              </span>
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          {CHART_PERIODS.map((p) => {
            const count = periodPointCounts[p] ?? 0;
            const disabled = count < 2;
            return (
              <button
                key={p}
                onClick={() => !disabled && setActivePeriod(p)}
                disabled={disabled}
                title={
                  disabled
                    ? "Pas assez de données pour cette agrégation"
                    : p === "1D" ? "Un point par jour"
                    : p === "1W" ? "Un point par semaine"
                    : p === "1M" ? "Un point par mois"
                    : "Tous les points journaliers"
                }
                className={`px-3 py-1 text-[11px] font-bold rounded transition-colors duration-150 ${
                  disabled
                    ? "opacity-30 cursor-not-allowed bg-muted/20 text-muted-foreground"
                    : activePeriod === p
                    ? "bg-primary text-primary-foreground cursor-pointer"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Charts Row ── */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        {/* Avoirs — portfolio market value over time */}
        <div className="bg-[var(--surface-low)] border border-border/60 rounded-lg p-5">
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-border/40">
            <div>
              <h2 className="text-sm font-bold tracking-tight text-foreground">Avoirs</h2>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
                Valeur de marché (USD)
                {snapshotsComputing && " · calcul en cours…"}
              </p>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-bold">
              <div className="flex border border-border/60" role="group" aria-label="Mode d'affichage">
                {([
                  { id: "total" as const, label: "Total" },
                  { id: "platform" as const, label: "Par plateforme" },
                ]).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setChartMode(option.id)}
                    aria-pressed={chartMode === option.id}
                    className={`num cursor-pointer px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] transition-colors ${
                      chartMode === option.id
                        ? "bg-muted/40 text-foreground"
                        : "text-muted-foreground hover:bg-muted/20 hover:text-foreground"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="w-px h-4 bg-border/40" />
              <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">
                <input
                  type="checkbox"
                  checked={showMarkers}
                  onChange={(e) => setShowMarkers(e.target.checked)}
                  className="w-3.5 h-3.5 rounded"
                />
                Marqueurs
              </label>
              <div className="w-px h-4 bg-border/40" />
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--positive)]" />
                <span className="text-muted-foreground">Achat</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--negative)]" />
                <span className="text-muted-foreground">Vente</span>
              </span>
            </div>
          </div>

          <div className="h-[260px] w-full">
            {chartMode === "platform" ? (
              platformHistory.isLoading ? (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Reconstitution de la valeur par plateforme…
                </div>
              ) : stackedSeries.length >= 2 && platformHistory.platforms.length > 0 ? (
                <ChartContainer config={{}} className="h-full w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stackedSeries} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                      <XAxis
                        dataKey="axisKey"
                        tickLine={false}
                        axisLine={false}
                        height={46}
                        tick={makeXTick(filteredHoldings)}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        stroke="var(--muted-foreground)"
                        tickLine={false}
                        axisLine={false}
                        width={62}
                        tickFormatter={(v) => formatAxisValue(v)}
                        style={{ fontSize: "11px" }}
                        tick={{ fill: "var(--muted-foreground)", className: "num" }}
                      />
                      <ChartTooltip
                        content={({ active, payload, label }) => (
                          <ChartTooltipContent
                            className="num"
                            active={active}
                            payload={payload}
                            label={axisKeyToLabel(label as string | number)}
                            formatter={(value) => currencyFormatter.format(Number(value))}
                          />
                        )}
                      />
                      {platformHistory.platforms.map((platform, index) => (
                        <Area
                          key={platform}
                          type="monotone"
                          dataKey={platform}
                          // Une seule pile : les aires s'additionnent pour
                          // reconstituer la valeur totale du portefeuille.
                          stackId="platforms"
                          stroke={PLATFORM_COLORS[index % PLATFORM_COLORS.length]}
                          fill={PLATFORM_COLORS[index % PLATFORM_COLORS.length]}
                          fillOpacity={0.35}
                          strokeWidth={1.5}
                          isAnimationActive={false}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Pas assez d&apos;historique de cours pour ventiler par plateforme.
                </div>
              )
            ) : holdingsWithMarkers.length >= 2 ? (
              <ChartContainer
                config={{ valueUsd: { label: "Valeur USD", color: chartIsPositive ? "var(--positive)" : "var(--negative)" } }}
                className="h-full w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={holdingsWithMarkers} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                    <defs>
                      <linearGradient id="holdingsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={chartIsPositive ? "var(--positive)" : "var(--negative)"} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={chartIsPositive ? "var(--positive)" : "var(--negative)"} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                    <XAxis
                      dataKey="axisKey"
                      tickLine={false}
                      axisLine={false}
                      height={46}
                      tick={makeXTick(holdingsWithMarkers)}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      stroke="var(--muted-foreground)"
                      tickLine={false}
                      axisLine={false}
                      width={62}
                      tickFormatter={(v) => formatAxisValue(v)}
                      style={{ fontSize: "11px" }}
                      tick={{ fill: "var(--muted-foreground)", className: "num" }}
                    />
                    <ChartTooltip
                      content={({ active, payload, label }) =>
                        <ChartTooltipContent
                          className="num"
                          active={active}
                          payload={payload}
                          label={axisKeyToLabel(label as string | number)}
                          formatter={(value) => currencyFormatter.format(Number(value))}
                        />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="valueUsd"
                      stroke={chartIsPositive ? "var(--positive)" : "var(--negative)"}
                      strokeWidth={2}
                      fill="url(#holdingsGrad)"
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    {showMarkers && (
                      <Line
                        type="monotone"
                        dataKey="buyMarker"
                        stroke="none"
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        dot={(props: any) => {
                          if (props.payload?.buyMarker == null) return <g key={props.key} />;
                          return (
                            <circle
                              key={props.key}
                              cx={props.cx}
                              cy={props.cy}
                              r={5}
                              fill="var(--positive)"
                              stroke="white"
                              strokeWidth={1.5}
                            />
                          );
                        }}
                        activeDot={false}
                        legendType="none"
                        isAnimationActive={false}
                        connectNulls={false}
                      />
                    )}
                    {showMarkers && (
                      <Line
                        type="monotone"
                        dataKey="sellMarker"
                        stroke="none"
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        dot={(props: any) => {
                          if (props.payload?.sellMarker == null) return <g key={props.key} />;
                          return (
                            <circle
                              key={props.key}
                              cx={props.cx}
                              cy={props.cy}
                              r={5}
                              fill="var(--negative)"
                              stroke="white"
                              strokeWidth={1.5}
                            />
                          );
                        }}
                        activeDot={false}
                        legendType="none"
                        isAnimationActive={false}
                        connectNulls={false}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </ChartContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <p className="text-sm">
                  {holdingsSeries.length === 0
                    ? snapshotsComputing
                      ? "Calcul de l'historique en cours…"
                      : "Aucune donnée à afficher."
                    : "Pas assez de points pour cette agrégation."}
                </p>
                {holdingsSeries.length === 0 && !snapshotsComputing ? (
                  <button onClick={onOpenIntegrations} className="text-xs text-primary hover:underline cursor-pointer">
                    Connecter une plateforme →
                  </button>
                ) : holdingsSeries.length > 0 ? (
                  <button onClick={() => setActivePeriod("ALL")} className="text-xs text-primary hover:underline cursor-pointer">
                    Voir toutes les données →
                  </button>
                ) : null}
              </div>
            )}
          </div>

          {/* Écarter des actifs sans le dire fausserait la lecture des
              proportions : on nomme ce qui manque. */}
          {chartMode === "platform" && platformHistory.omittedSymbols.length > 0 && (
            <p className="num mt-3 border-t border-border/40 pt-3 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60">
              {platformHistory.omittedSymbols.length} actif
              {platformHistory.omittedSymbols.length > 1 ? "s" : ""} de faible poids écarté
              {platformHistory.omittedSymbols.length > 1 ? "s" : ""} de la ventilation ·{" "}
              {platformHistory.omittedSymbols.slice(0, 6).join(" ")}
              {platformHistory.omittedSymbols.length > 6 ? " …" : ""}
            </p>
          )}
        </div>

        {/* Performance — portfolio profit% vs BTC trend% */}
        <div className="bg-[var(--surface-low)] border border-border/60 rounded-lg p-5">
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-border/40">
            <div>
              <h2 className="text-sm font-bold tracking-tight text-foreground">Performance</h2>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">% depuis le début</p>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-bold">
              <span className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: "linear-gradient(180deg, var(--positive) 0%, var(--positive) 50%, var(--negative) 50%, var(--negative) 100%)" }}
                />
                <span className="text-muted-foreground">Profit total</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#F59E0B" }} />
                <span className="text-muted-foreground">BTC</span>
              </span>
            </div>
          </div>

          <div className="h-[260px] w-full">
            {filteredHoldings.length >= 2 ? (
              <ChartContainer
                config={{
                  profitPercent: { label: "Profit %", color: "#3B82F6" },
                  btcPercent: { label: "BTC %", color: "#F59E0B" },
                }}
                className="h-full w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={filteredHoldings} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                    <defs>
                      <linearGradient id="profitColorGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset={profitGradientOffset} stopColor="var(--positive)" stopOpacity={1} />
                        <stop offset={profitGradientOffset} stopColor="var(--negative)" stopOpacity={1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                    <XAxis
                      dataKey="axisKey"
                      tickLine={false}
                      axisLine={false}
                      height={46}
                      tick={makeXTick(filteredHoldings)}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      stroke="var(--muted-foreground)"
                      tickLine={false}
                      axisLine={false}
                      width={62}
                      tickFormatter={(v) => `${v.toFixed(0)}%`}
                      style={{ fontSize: "11px" }}
                      tick={{ fill: "var(--muted-foreground)", className: "num" }}
                    />
                    <ChartTooltip
                      content={({ active, payload, label }) =>
                        <ChartTooltipContent
                          className="num"
                          active={active}
                          payload={payload}
                          label={axisKeyToLabel(label as string | number)}
                          formatter={(value) => {
                            const n = Number(value);
                            return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
                          }}
                        />
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="profitPercent"
                      stroke="url(#profitColorGradient)"
                      strokeWidth={2}
                      dot={false}
                      name="Profit total"
                    />
                    <Line
                      type="monotone"
                      dataKey="btcPercent"
                      stroke="#F59E0B"
                      strokeWidth={2}
                      dot={false}
                      name="BTC"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <p className="text-sm">
                  {holdingsSeries.length === 0
                    ? snapshotsComputing
                      ? "Calcul de l'historique en cours…"
                      : "Aucune donnée à afficher."
                    : "Pas assez de points pour cette agrégation."}
                </p>
                {holdingsSeries.length === 0 && !snapshotsComputing ? (
                  <button onClick={onOpenIntegrations} className="text-xs text-primary hover:underline cursor-pointer">
                    Connecter une plateforme →
                  </button>
                ) : holdingsSeries.length > 0 ? (
                  <button onClick={() => setActivePeriod("ALL")} className="text-xs text-primary hover:underline cursor-pointer">
                    Voir toutes les données →
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>

      </section>

      {/* ── Balance Tracking Table ── */}
      <section className="bg-[var(--surface-low)] border border-border/60 rounded-lg overflow-hidden">
        {/* Table header */}
        <div className="px-5 py-3.5 border-b border-border/40 flex flex-wrap justify-between items-center gap-3">
          <div className="flex gap-1">
            {(["jetons", "plateformes"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-colors duration-150 cursor-pointer ${
                  activeTab === tab
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                {tab === "jetons" ? `Jetons (${portfolioTokens.length})` : `Plateformes (${platformCount})`}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {pricesError && <span className="text-[10px] text-negative">{pricesError}</span>}
            <div className="flex border border-border/60" role="group" aria-label="Devise d'affichage">
              {(["USD", "EUR"] as const).map((currency) => (
                <button
                  key={currency}
                  type="button"
                  onClick={() => setDisplayCurrency(currency)}
                  aria-pressed={displayCurrency === currency}
                  title={
                    currency === "EUR"
                      ? "Converti au taux du jour publié par la BCE"
                      : "Devise de référence des calculs"
                  }
                  className={`num cursor-pointer px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] transition-colors ${
                    displayCurrency === currency
                      ? "bg-muted/40 text-foreground"
                      : "text-muted-foreground hover:bg-muted/20 hover:text-foreground"
                  }`}
                >
                  {currency}
                </button>
              ))}
            </div>
            <button
              onClick={refreshPrices}
              disabled={pricesLoading}
              className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-primary transition-colors disabled:opacity-40 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${pricesLoading ? "animate-spin" : ""}`} />
              {pricesLoading ? "Chargement…" : "Rafraîchir"}
            </button>
            <button
              onClick={onOpenIntegrations}
              className="text-[10px] font-bold text-primary hover:underline cursor-pointer"
            >
              + Ajouter
            </button>
          </div>
        </div>

        {activeTab === "jetons" && (
          <>
            <div className="px-5 py-2 border-b border-border/50 flex items-center gap-2">
              <label className="flex items-center gap-2 text-[10px] text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideZeroBalance}
                  onChange={(e) => setHideZeroBalance(e.target.checked)}
                  className="w-3.5 h-3.5 rounded"
                />
                Masquer les soldes nuls
              </label>
            </div>

            {(() => {
              const tokensWithValues = filteredTokens.map(token => {
                const currentPrice = USD_STABLECOINS.has(token.symbol) ? 1 : currentPrices[token.symbol];
                const currentValue = currentPrice && token.currentQuantity > 0
                  ? currentPrice * token.currentQuantity : null;
                const costOfHoldings = token.avgCostBasis * token.currentQuantity;
                const unrealized = currentValue !== null ? currentValue - costOfHoldings : null;
                const totalPnl = unrealized !== null ? token.realizedPnlAvco + unrealized : null;
                return { token, currentPrice, currentValue, unrealized, totalPnl };
              });

              const totalTokensValue = tokensWithValues.reduce((sum, t) => sum + (t.currentValue ?? 0), 0);

              const sorted = [...tokensWithValues].sort((a, b) => {
                if (sortColumn === "symbol") {
                  const cmp = a.token.symbol.localeCompare(b.token.symbol);
                  return sortAsc ? cmp : -cmp;
                }
                const vals: Record<string, [number, number]> = {
                  qty: [a.token.currentQuantity, b.token.currentQuantity],
                  avgPrice: [a.token.avgCostBasis, b.token.avgCostBasis],
                  current: [a.currentPrice ?? 0, b.currentPrice ?? 0],
                  value: [a.currentValue ?? 0, b.currentValue ?? 0],
                  pnlTotal: [a.totalPnl ?? 0, b.totalPnl ?? 0],
                };
                if (sortColumn && vals[sortColumn]) {
                  const [av, bv] = vals[sortColumn];
                  return sortAsc ? av - bv : bv - av;
                }
                return (b.currentValue ?? 0) - (a.currentValue ?? 0);
              });

              type SortCol = "symbol" | "qty" | "avgPrice" | "current" | "value" | "pnlTotal";

              const SortTh = ({ col, label, align = "right" }: { col: SortCol; label: string; align?: string }) => (
                <th
                  className={`px-4 py-3 num text-[10px] uppercase tracking-[0.24em] text-muted-foreground cursor-pointer hover:text-primary transition-colors ${align === "left" ? "text-left" : "text-right"}`}
                  onClick={() => {
                    if (sortColumn === col) setSortAsc(!sortAsc);
                    else { setSortColumn(col); setSortAsc(true); }
                  }}
                >
                  {label}
                  {sortColumn === col && <span className="ml-1 opacity-60">{sortAsc ? "↑" : "↓"}</span>}
                </th>
              );

              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse tabular-nums">
                    <thead>
                      <tr className="bg-muted/20">
                        <SortTh col="symbol" label="Actif" align="left" />
                        <SortTh col="qty" label="Quantité" />
                        <SortTh col="avgPrice" label="Prix achat" />
                        <th className="px-4 py-3 text-right num text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                          <span className="flex items-center justify-end gap-1">
                            Prix actuel
                            {pricesLoading && <LoaderCircle className="w-3 h-3 animate-spin text-primary" />}
                          </span>
                        </th>
                        <th className="px-4 py-3 text-right num text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                          Écart au PRU
                        </th>
                        <SortTh col="value" label="Valeur" />
                        <th className="px-4 py-3 text-right num text-[10px] uppercase tracking-[0.24em] text-muted-foreground">% portefeuille</th>
                        <th className="px-4 py-3 text-right num text-[10px] uppercase tracking-[0.24em] text-muted-foreground">PnL réalisé</th>
                        <th className="px-4 py-3 text-right num text-[10px] uppercase tracking-[0.24em] text-muted-foreground">PnL latent</th>
                        <SortTh col="pnlTotal" label="PnL total" />
                      </tr>
                    </thead>
                    <tbody className="text-xs font-medium">
                      {sorted.map(({ token, currentPrice, currentValue, unrealized, totalPnl }) => {
                        const realized = token.realizedPnlAvco;
                        const isFiltered = chartFilter.type === "token" && chartFilter.symbol === token.symbol;
                        const isExpanded = expandedTokens.has(token.symbol);
                        const toggleExpand = (e: React.MouseEvent) => {
                          e.stopPropagation();
                          setExpandedTokens((prev) => {
                            const next = new Set(prev);
                            if (next.has(token.symbol)) next.delete(token.symbol);
                            else next.add(token.symbol);
                            return next;
                          });
                        };
                        return (
                          <Fragment key={token.symbol}>
                          <tr
                            onClick={() =>
                              setChartFilter(
                                isFiltered
                                  ? { type: "all" }
                                  : { type: "token", symbol: token.symbol }
                              )
                            }
                            className={`border-t border-border/50 transition-colors cursor-pointer ${
                              isFiltered
                                ? "bg-primary/10 hover:bg-primary/15"
                                : "hover:bg-muted/20"
                            }`}
                            title={isFiltered ? "Cliquez pour afficher tous les marqueurs" : `N'afficher que les marqueurs de ${token.symbol}`}
                          >
                            <td className={`px-4 py-3 ${isFiltered ? "border-l-2 border-primary" : ""}`}>
                              <div className="flex items-center gap-2.5">
                                <button
                                  type="button"
                                  onClick={toggleExpand}
                                  className="flex items-center justify-center w-5 h-5 rounded hover:bg-muted/40 transition-colors cursor-pointer"
                                  title={isExpanded ? "Masquer l'historique" : `Voir l'historique de ${token.symbol}`}
                                >
                                  <ChevronRight
                                    className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                                  />
                                </button>
                                <div className="w-7 h-7 shrink-0 relative">
                                  {getCmcIconUrl(token.symbol) ? (
                                    // URL calculée au rendu + repli DOM sur erreur : next/image ne s'y prête pas.
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={getCmcIconUrl(token.symbol) || ""}
                                      alt={token.symbol}
                                      className="w-7 h-7 rounded-full object-cover bg-muted"
                                      onError={(e) => {
                                        // Fallback to initials if image fails
                                        const container = e.currentTarget.parentElement;
                                        if (container) {
                                          container.innerHTML = `<div class="w-7 h-7 bg-muted rounded-full flex items-center justify-center text-[10px] font-semibold text-primary">${token.symbol.slice(0, 2)}</div>`;
                                        }
                                      }}
                                    />
                                  ) : (
                                    <div className="w-7 h-7 bg-muted rounded-full flex items-center justify-center text-[10px] font-semibold text-primary">
                                      {token.symbol.slice(0, 2)}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <div className="font-bold text-foreground text-xs">{token.symbol}</div>
                                  <div className="text-[10px] text-muted-foreground uppercase">Crypto</div>
                                </div>
                              </div>
                            </td>
                            <td className="num px-4 py-3 text-right text-muted-foreground">
                              {token.currentQuantity > 0
                                ? token.currentQuantity.toLocaleString("fr-FR", { maximumFractionDigits: 6 })
                                : "—"}
                            </td>
                            <td className="num px-4 py-3 text-right text-muted-foreground">
                              {token.avgCostBasis > 0 ? money(token.avgCostBasis) : "—"}
                            </td>
                            <td className="num px-4 py-3 text-right font-bold text-primary">
                              {/* Recharger une seule ligne : une requête isolée
                                  aboutit là où un lot de plusieurs dizaines de
                                  paires peut être écourté par la place de marché. */}
                              <span className="inline-flex items-center justify-end gap-1.5">
                                {currentPrice ? money(currentPrice) : "—"}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void refreshSymbol(token.symbol);
                                  }}
                                  disabled={refreshingSymbols.has(token.symbol)}
                                  aria-label={`Recharger le cours de ${token.symbol}`}
                                  title={`Recharger le cours de ${token.symbol}`}
                                  className="cursor-pointer text-muted-foreground/40 transition-colors hover:text-foreground disabled:cursor-wait"
                                >
                                  <RefreshCw
                                    className={`size-3 ${refreshingSymbols.has(token.symbol) ? "animate-spin" : ""}`}
                                  />
                                </button>
                              </span>
                            </td>
                            <td className="num px-4 py-3 text-right">
                              {currentPrice && token.avgCostBasis > 0 ? (
                                (() => {
                                  const gap = currentPrice / token.avgCostBasis - 1;
                                  return (
                                    <span className={gap >= 0 ? "text-positive" : "text-negative"}>
                                      {gap >= 0 ? "+" : ""}
                                      {(gap * 100).toFixed(1)} %
                                    </span>
                                  );
                                })()
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="num px-4 py-3 text-right font-bold text-foreground">
                              {currentValue !== null ? money(currentValue) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {currentValue !== null && totalTokensValue > 0 ? (
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-16 h-1 bg-muted/40 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-gradient-to-r from-primary to-positive rounded-full"
                                      style={{ width: `${Math.min(100, (currentValue / totalTokensValue) * 100)}%` }}
                                    />
                                  </div>
                                  <span className="num font-bold text-foreground min-w-[44px]">
                                    {((currentValue / totalTokensValue) * 100).toFixed(1)}%
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground/70">—</span>
                              )}
                            </td>
                            <td className={`num px-4 py-3 text-right font-bold ${realized >= 0 ? "text-positive" : "text-negative"}`}>
                              {realized !== 0
                                ? `${realized >= 0 ? "+" : ""}${money(realized)}`
                                : <span className="text-muted-foreground/70">—</span>}
                            </td>
                            <td className={`num px-4 py-3 text-right font-bold ${unrealized === null ? "text-muted-foreground/70" : unrealized >= 0 ? "text-positive" : "text-negative"}`}>
                              {unrealized !== null
                                ? `${unrealized >= 0 ? "+" : ""}${money(unrealized)}`
                                : "—"}
                            </td>
                            <td className={`num px-4 py-3 text-right font-bold ${totalPnl === null ? "text-muted-foreground/70" : totalPnl >= 0 ? "text-positive" : "text-negative"}`}>
                              {totalPnl !== null
                                ? `${totalPnl >= 0 ? "+" : ""}${money(totalPnl)}`
                                : money(realized)}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-muted/10 border-t border-border/30">
                              <td colSpan={10} className="px-4 py-4">
                                <TokenHistoryChart symbol={token.symbol} events={token.events} />
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>

                  {filteredTokens.length === 0 && (
                    <div className="text-center py-10 text-muted-foreground text-sm">
                      {hideZeroBalance && portfolioTokens.length > 0 ? (
                        "Aucun jeton avec solde non nul."
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <p>Aucun jeton pour le moment.</p>
                          <button onClick={onOpenIntegrations} className="text-xs text-primary hover:underline cursor-pointer">
                            Connecter une plateforme →
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}

        {activeTab === "plateformes" && (() => {
          // Aggrégation par plateforme à partir des events de chaque token
          type PlatformTokenBreakdown = {
            symbol: string;
            qty: number;
            costBasis: number;
            currentValue: number | null;
            realized: number;
            unrealized: number | null;
          };
          type PlatformStat = {
            provider: string;
            providerDisplayName: string;
            tokenCount: number;
            currentValueUsd: number;
            costBasisUsd: number;
            realizedPnl: number;
            unrealizedPnl: number | null;
            totalPnl: number | null;
            lastActivityAt: number;
            hasAllPrices: boolean;
            tokens: PlatformTokenBreakdown[];
          };

          const byProvider = new Map<string, {
            provider: string;
            providerDisplayName: string;
            perSymbol: Map<string, { qty: number; costUsd: number; realized: number }>;
            lastActivityAt: number;
          }>();

          for (const token of portfolioTokens) {
            // AVCO par plateforme : on recalcule la quantité et le coût moyen
            // uniquement avec les events de cette plateforme
            const eventsByProvider = new Map<string, typeof token.events>();
            for (const ev of token.events) {
              const key = ev.provider;
              const arr = eventsByProvider.get(key) ?? [];
              arr.push(ev);
              eventsByProvider.set(key, arr);
            }

            type PerPlatform = { qty: number; avgCost: number; realized: number; lastAt: number; displayName: string };
            const perPlatform = new Map<string, PerPlatform>();
            const upper = token.symbol.toUpperCase();

            for (const [provider, events] of eventsByProvider) {
              const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
              let qty = 0;
              let avgCost = 0;
              let realized = 0;
              for (const ev of sorted) {
                const feeInBase = ev.fee && ev.feeAsset?.toUpperCase() === upper ? ev.fee : 0;
                if (ev.type === "BUY" && ev.valueUsd) {
                  const eff = ev.quantity - feeInBase;
                  const newQty = qty + eff;
                  avgCost = newQty > 0 ? (qty * avgCost + ev.valueUsd) / newQty : 0;
                  qty = newQty;
                } else if (ev.type === "SELL") {
                  const proceeds = ev.valueUsd ?? ev.quantity * (ev.price ?? avgCost);
                  realized += proceeds - ev.quantity * avgCost;
                  qty = Math.max(0, qty - ev.quantity - feeInBase);
                } else if (ev.type === "DEPOSIT") {
                  qty += ev.quantity;
                } else if (ev.type === "WITHDRAWAL") {
                  qty = Math.max(0, qty - ev.quantity);
                }
              }
              perPlatform.set(provider, {
                qty,
                avgCost,
                realized,
                lastAt: sorted[sorted.length - 1]?.timestamp ?? 0,
                displayName: sorted[0]?.providerDisplayName ?? provider,
              });
            }

            // Rescale : la quantité totale par plateforme (depuis events) peut
            // diverger de token.currentQuantity (qui est la vérité API, ajustée
            // pour dust conversions, staking, etc.). On rescale pour garder
            // la cohérence avec la valeur globale du portefeuille.
            const sumQty = Array.from(perPlatform.values()).reduce((s, p) => s + Math.max(0, p.qty), 0);
            const scale = sumQty > 0 ? token.currentQuantity / sumQty : 0;

            for (const [provider, pp] of perPlatform) {
              const scaledQty = Math.max(0, pp.qty) * scale;
              if (scaledQty <= 0.00001 && pp.realized === 0) continue;

              const entry = byProvider.get(provider) ?? {
                provider,
                providerDisplayName: pp.displayName,
                perSymbol: new Map(),
                lastActivityAt: 0,
              };
              entry.perSymbol.set(token.symbol, {
                qty: scaledQty,
                costUsd: scaledQty * pp.avgCost,
                realized: pp.realized,
              });
              entry.lastActivityAt = Math.max(entry.lastActivityAt, pp.lastAt);
              byProvider.set(provider, entry);
            }
          }

          const stats: PlatformStat[] = Array.from(byProvider.values()).map((p) => {
            let currentValueUsd = 0;
            let costBasisUsd = 0;
            let realizedPnl = 0;
            let tokenCount = 0;
            let hasAllPrices = true;
            const tokens: PlatformTokenBreakdown[] = [];
            for (const [symbol, info] of p.perSymbol) {
              if (info.qty > 0.00001) tokenCount += 1;
              costBasisUsd += info.costUsd;
              realizedPnl += info.realized;
              const price = USD_STABLECOINS.has(symbol) ? 1 : currentPrices[symbol];
              let tokenCurrentValue: number | null = null;
              if (price && info.qty > 0) {
                tokenCurrentValue = price * info.qty;
                currentValueUsd += tokenCurrentValue;
              } else if (info.qty > 0.00001) {
                hasAllPrices = false;
              }
              tokens.push({
                symbol,
                qty: info.qty,
                costBasis: info.costUsd,
                currentValue: tokenCurrentValue,
                realized: info.realized,
                unrealized: tokenCurrentValue !== null ? tokenCurrentValue - info.costUsd : null,
              });
            }
            tokens.sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0));
            const unrealizedPnl = hasAllPrices && hasCurrentPrices
              ? currentValueUsd - costBasisUsd
              : null;
            const totalPnl = unrealizedPnl !== null ? unrealizedPnl + realizedPnl : null;
            return {
              provider: p.provider,
              providerDisplayName: p.providerDisplayName,
              tokenCount,
              currentValueUsd,
              costBasisUsd,
              realizedPnl,
              unrealizedPnl,
              totalPnl,
              lastActivityAt: p.lastActivityAt,
              hasAllPrices,
              tokens,
            };
          }).sort((a, b) => b.currentValueUsd - a.currentValueUsd);

          const totalPlatformValue = stats.reduce((sum, s) => sum + s.currentValueUsd, 0);

          if (stats.length === 0) {
            return (
              <div className="text-center py-10 text-muted-foreground text-sm">
                <div className="flex flex-col items-center gap-2">
                  <p>Aucune plateforme connectée.</p>
                  <button onClick={onOpenIntegrations} className="text-xs text-primary hover:underline cursor-pointer">
                    Connecter une plateforme →
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse tabular-nums">
                <thead>
                  <tr className="bg-muted/20">
                    <th className="px-4 py-3 text-left num text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Plateforme</th>
                    <th className="px-4 py-3 text-right num text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Jetons</th>
                    <th className="px-4 py-3 text-right num text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Coût investi</th>
                    <th className="px-4 py-3 text-right num text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Valeur</th>
                    <th className="px-4 py-3 text-right num text-[10px] uppercase tracking-[0.24em] text-muted-foreground">% portefeuille</th>
                    <th className="px-4 py-3 text-right num text-[10px] uppercase tracking-[0.24em] text-muted-foreground">PnL réalisé</th>
                    <th className="px-4 py-3 text-right num text-[10px] uppercase tracking-[0.24em] text-muted-foreground">PnL latent</th>
                    <th className="px-4 py-3 text-right num text-[10px] uppercase tracking-[0.24em] text-muted-foreground">PnL total</th>
                    <th className="px-4 py-3 text-right num text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Dernière activité</th>
                  </tr>
                </thead>
                <tbody className="text-xs font-medium">
                  {stats.map((s) => {
                    const isExpanded = expandedPlatforms.has(s.provider);
                    const isFiltered = chartFilter.type === "platform" && chartFilter.provider === s.provider;
                    const toggle = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      setExpandedPlatforms((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.provider)) next.delete(s.provider);
                        else next.add(s.provider);
                        return next;
                      });
                    };
                    const onRowClick = () => {
                      setChartFilter(
                        isFiltered
                          ? { type: "all" }
                          : { type: "platform", provider: s.provider }
                      );
                    };
                    return (
                    <Fragment key={s.provider}>
                    <tr
                      onClick={onRowClick}
                      className={`border-t border-border/50 transition-colors cursor-pointer ${
                        isFiltered ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-muted/20"
                      }`}
                      title={isFiltered ? "Cliquez pour afficher tous les marqueurs" : `N'afficher que les marqueurs de ${s.providerDisplayName}`}
                    >
                      <td className={`px-4 py-3 ${isFiltered ? "border-l-2 border-primary" : ""}`}>
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={toggle}
                            className="flex items-center justify-center w-5 h-5 rounded hover:bg-muted/40 transition-colors cursor-pointer"
                            title={isExpanded ? "Réduire le détail" : "Voir le détail des jetons"}
                          >
                            <ChevronRight
                              className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                            />
                          </button>
                          <ProviderAvatar provider={s.provider} name={s.providerDisplayName} />
                          <div>
                            <div className="font-bold text-foreground text-xs">{s.providerDisplayName}</div>
                            <div className="text-[10px] text-muted-foreground uppercase">{s.provider}</div>
                          </div>
                        </div>
                      </td>
                      <td className="num px-4 py-3 text-right text-muted-foreground">{s.tokenCount}</td>
                      <td className="num px-4 py-3 text-right text-muted-foreground">
                        {s.costBasisUsd > 0 ? money(s.costBasisUsd) : "—"}
                      </td>
                      <td className="num px-4 py-3 text-right font-bold text-foreground">
                        {hasCurrentPrices && s.currentValueUsd > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            {money(s.currentValueUsd)}
                            {!s.hasAllPrices && (
                              <span title="Certains tokens n'ont pas de prix courant disponible" className="text-muted-foreground/60">*</span>
                            )}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {hasCurrentPrices && s.currentValueUsd > 0 && totalPlatformValue > 0 ? (
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1 bg-muted/40 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-primary to-positive rounded-full"
                                style={{ width: `${Math.min(100, (s.currentValueUsd / totalPlatformValue) * 100)}%` }}
                              />
                            </div>
                            <span className="num font-bold text-foreground min-w-[44px]">
                              {((s.currentValueUsd / totalPlatformValue) * 100).toFixed(1)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/70">—</span>
                        )}
                      </td>
                      <td className={`num px-4 py-3 text-right font-bold ${s.realizedPnl > 0 ? "text-positive" : s.realizedPnl < 0 ? "text-negative" : "text-muted-foreground/70"}`}>
                        {s.realizedPnl !== 0
                          ? `${s.realizedPnl >= 0 ? "+" : ""}${money(s.realizedPnl)}`
                          : "—"}
                      </td>
                      <td className={`num px-4 py-3 text-right font-bold ${s.unrealizedPnl === null ? "text-muted-foreground/70" : s.unrealizedPnl >= 0 ? "text-positive" : "text-negative"}`}>
                        {s.unrealizedPnl !== null
                          ? `${s.unrealizedPnl >= 0 ? "+" : ""}${money(s.unrealizedPnl)}`
                          : "—"}
                      </td>
                      <td className={`num px-4 py-3 text-right font-bold ${s.totalPnl === null ? "text-muted-foreground/70" : s.totalPnl >= 0 ? "text-positive" : "text-negative"}`}>
                        {s.totalPnl !== null
                          ? `${s.totalPnl >= 0 ? "+" : ""}${money(s.totalPnl)}`
                          : "—"}
                      </td>
                      <td className="num px-4 py-3 text-right text-muted-foreground text-[11px]">
                        {s.lastActivityAt > 0
                          ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" }).format(new Date(s.lastActivityAt))
                          : "—"}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-muted/10 border-t border-border/30">
                        <td colSpan={9} className="px-4 py-3">
                          {s.tokens.length === 0 ? (
                            <div className="text-[11px] text-muted-foreground text-center py-2">Aucun jeton sur cette plateforme.</div>
                          ) : (
                            <div className="pl-9">
                              <table className="w-full text-left border-collapse tabular-nums">
                                <thead>
                                  <tr>
                                    <th className="px-3 py-1.5 text-left text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">Jeton</th>
                                    <th className="px-3 py-1.5 text-right text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">Quantité</th>
                                    <th className="px-3 py-1.5 text-right text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">Coût investi</th>
                                    <th className="px-3 py-1.5 text-right text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">PRU</th>
                                    <th className="px-3 py-1.5 text-right text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">Valeur</th>
                                    <th className="px-3 py-1.5 text-right text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">PnL réalisé</th>
                                    <th className="px-3 py-1.5 text-right text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">PnL latent</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {s.tokens.map((t) => (
                                    <tr key={t.symbol} className="border-t border-border/30">
                                      <td className="px-3 py-2">
                                        <div className="flex items-center gap-2">
                                          {getCmcIconUrl(t.symbol) ? (
                                            // Icône de jeton à URL calculée — voir la note plus haut.
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                              src={getCmcIconUrl(t.symbol) || ""}
                                              alt={t.symbol}
                                              className="w-5 h-5 rounded-full object-cover bg-muted"
                                            />
                                          ) : (
                                            <div className="w-5 h-5 bg-muted rounded-full flex items-center justify-center text-[8px] font-semibold text-primary">
                                              {t.symbol.slice(0, 2)}
                                            </div>
                                          )}
                                          <span className="font-bold text-foreground text-[11px]">{t.symbol}</span>
                                        </div>
                                      </td>
                                      <td className="num px-3 py-2 text-right text-muted-foreground text-[11px]">
                                        {t.qty > 0 ? t.qty.toLocaleString("fr-FR", { maximumFractionDigits: 6 }) : "—"}
                                      </td>
                                      <td className="num px-3 py-2 text-right text-muted-foreground text-[11px]">
                                        {t.costBasis > 0 ? money(t.costBasis) : "—"}
                                      </td>
                                      <td className="num px-3 py-2 text-right text-muted-foreground text-[11px]">
                                        {t.qty > 0 && t.costBasis > 0
                                          ? money(t.costBasis / t.qty)
                                          : "—"}
                                      </td>
                                      <td className="num px-3 py-2 text-right font-bold text-foreground text-[11px]">
                                        {t.currentValue !== null ? money(t.currentValue) : "—"}
                                      </td>
                                      <td className={`num px-3 py-2 text-right font-bold text-[11px] ${t.realized > 0 ? "text-positive" : t.realized < 0 ? "text-negative" : "text-muted-foreground/70"}`}>
                                        {t.realized !== 0
                                          ? `${t.realized >= 0 ? "+" : ""}${money(t.realized)}`
                                          : "—"}
                                      </td>
                                      <td className={`num px-3 py-2 text-right font-bold text-[11px] ${t.unrealized === null ? "text-muted-foreground/70" : t.unrealized >= 0 ? "text-positive" : "text-negative"}`}>
                                        {t.unrealized !== null
                                          ? `${t.unrealized >= 0 ? "+" : ""}${money(t.unrealized)}`
                                          : "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
      </section>
    </div>
  );
}
