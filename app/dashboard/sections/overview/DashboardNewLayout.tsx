"use client";

import { useState, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { currencyFormatter, type HistoryPoint, type ProfitSummary, type PortfolioToken } from "@/hooks/dashboard/useDashboardMetrics";
import { useCurrentPrices } from "@/hooks/useCurrentPrices";
import { useCmcTokenMap } from "@/hooks/useCmcTokenMap";
import { TrendingUp, LoaderCircle, RefreshCw } from "lucide-react";

type DashboardNewLayoutProps = {
  profitSummary: ProfitSummary;
  historySeries: HistoryPoint[];
  portfolioTokens: PortfolioToken[];
  onOpenIntegrations: () => void;
};

const CHART_PERIODS = ["1D", "1W", "1M", "ALL"] as const;
type ChartPeriod = typeof CHART_PERIODS[number];

export function DashboardNewLayout({
  profitSummary,
  historySeries,
  portfolioTokens,
  onOpenIntegrations,
}: DashboardNewLayoutProps) {
  const [activePeriod, setActivePeriod] = useState<ChartPeriod>("1M");
  const [activeTab, setActiveTab] = useState<"jetons" | "plateformes">("jetons");
  const [sortColumn, setSortColumn] = useState<"symbol" | "qty" | "avgPrice" | "current" | "value" | "pnlTotal" | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [hideZeroBalance, setHideZeroBalance] = useState(true);
  const { currentPrices, loading: pricesLoading, error: pricesError, refresh: refreshPrices } = useCurrentPrices(portfolioTokens);
  const { getCmcIconUrl } = useCmcTokenMap(portfolioTokens.map(t => t.symbol));

  const filteredTokens = useMemo(() => {
    if (!hideZeroBalance) return portfolioTokens;
    return portfolioTokens.filter(t => t.currentQuantity > 0.00001);
  }, [portfolioTokens, hideZeroBalance]);

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
  const isPositive = totalProfit >= 0;
  const unrealizedPnl = hasCurrentPrices ? totalCurrentValue - totalCostBasis : null;

  const filteredHistory = useMemo(() => {
    if (!historySeries.length) return [];
    const now = historySeries[historySeries.length - 1]?.timestamp ?? Date.now();
    const durationMap: Record<ChartPeriod, number | null> = {
      "1D": 86400000,
      "1W": 604800000,
      "1M": 2592000000,
      "ALL": null,
    };
    const duration = durationMap[activePeriod];
    if (!duration) return historySeries;
    return historySeries.filter(p => p.timestamp >= now - duration);
  }, [historySeries, activePeriod]);

  // Portfolio value series with embedded buy/sell markers
  const portfolioValueSeries = useMemo(() => {
    // Build a set of day-keys that have BUY or SELL events
    const buyDays = new Set<number>();
    const sellDays = new Set<number>();
    for (const token of portfolioTokens) {
      for (const event of token.events) {
        if (event.type !== "BUY" && event.type !== "SELL") continue;
        // Round to nearest UTC midnight to match historySeries timestamps
        const d = new Date(event.timestamp);
        const dayTs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        if (event.type === "BUY") buyDays.add(dayTs);
        else sellDays.add(dayTs);
      }
    }

    return filteredHistory.map(p => ({
      ...p,
      portfolioValue: p.netInvestedUsd,
      // null = no marker, number = marker at this y position
      buyMarker: buyDays.has(p.timestamp) ? p.netInvestedUsd : null,
      sellMarker: sellDays.has(p.timestamp) ? p.netInvestedUsd : null,
    }));
  }, [filteredHistory, portfolioTokens]);

  return (
    <div className="space-y-5">

      {/* ── Hero Metrics ── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Performance totale */}
        <div className="bg-[var(--surface-low)] border border-border/60 rounded-lg p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-[0.05] group-hover:opacity-[0.09] transition-opacity">
            <TrendingUp className="w-14 h-14 text-primary" />
          </div>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
            Performance totale
          </h3>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-3xl font-black tracking-tight tabular-nums text-foreground">
              {currencyFormatter.format(totalProfit)}
            </span>
            <span className={`text-sm font-bold tabular-nums ${isPositive ? "text-positive" : "text-negative"}`}>
              {isPositive ? "+" : ""}{profitPercent.toFixed(2)}%
            </span>
          </div>
          <div className="mt-4 h-[3px] bg-border/40 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isPositive ? "bg-gradient-to-r from-primary to-positive" : "bg-negative"}`}
              style={{ width: `${Math.min(Math.abs(profitPercent), 100)}%` }}
            />
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground/60 italic">PnL réalisé + latent combiné</p>
        </div>

        {/* Valeur actuelle */}
        <div className="bg-[var(--surface-low)] border border-border/60 rounded-lg p-5">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
            Valeur du portefeuille
          </h3>
          <span className="text-3xl font-black tracking-tight tabular-nums text-foreground">
            {hasCurrentPrices ? currencyFormatter.format(totalCurrentValue) : "—"}
          </span>
          <div className="mt-5 flex items-center justify-between text-xs border-t border-border/40 pt-4">
            <span className="text-muted-foreground">Coût total investi</span>
            <span className="font-bold tabular-nums text-foreground">{currencyFormatter.format(totalCostBasis)}</span>
          </div>
        </div>

        {/* PnL latent */}
        <div className="bg-[var(--surface-low)] border border-border/60 rounded-lg p-5">
          <div className="flex justify-between items-start mb-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">PnL latent</h3>
            {hasCurrentPrices && unrealizedPnl !== null && (
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                unrealizedPnl >= 0
                  ? "bg-positive/10 text-positive"
                  : "bg-negative/10 text-negative"
              }`}>
                {unrealizedPnl >= 0 ? "PROFIT" : "PERTE"}
              </span>
            )}
          </div>
          <span className={`text-3xl font-black tracking-tight tabular-nums ${
            unrealizedPnl === null ? "text-muted-foreground" :
            unrealizedPnl >= 0 ? "text-positive" : "text-negative"
          }`}>
            {unrealizedPnl !== null
              ? `${unrealizedPnl >= 0 ? "+" : ""}${currencyFormatter.format(unrealizedPnl)}`
              : "—"}
          </span>
          <div className="mt-5 flex items-center justify-between text-xs border-t border-border/40 pt-4">
            <span className="text-muted-foreground">PnL réalisé</span>
            <span className={`font-bold tabular-nums ${totalRealizedPnl >= 0 ? "text-positive" : "text-negative"}`}>
              {totalRealizedPnl >= 0 ? "+" : ""}{currencyFormatter.format(totalRealizedPnl)}
            </span>
          </div>
        </div>
      </section>

      {/* ── Charts Row ── */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        {/* Performance chart */}
        <div className="bg-[var(--surface-low)] border border-border/60 rounded-lg p-5">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-5 pb-4 border-b border-border/40">
            <div>
              <h2 className="text-sm font-bold tracking-tight text-foreground">Performance du portefeuille</h2>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">Profit cumulé (USD)</p>
            </div>
            <div className="flex gap-1.5">
              {CHART_PERIODS.map((p) => (
                <button
                  key={p}
                  onClick={() => setActivePeriod(p)}
                  className={`px-3 py-1 text-[11px] font-bold rounded transition-colors duration-150 cursor-pointer ${
                    activePeriod === p
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[260px] w-full">
            {filteredHistory.length > 0 ? (
              <ChartContainer
                config={{ profitUsd: { label: "Profit USD", color: isPositive ? "var(--positive)" : "var(--negative)" } }}
                className="h-full w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={filteredHistory} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={isPositive ? "var(--positive)" : "var(--negative)"} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={isPositive ? "var(--positive)" : "var(--negative)"} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis
                      dataKey="label"
                      stroke="hsl(var(--muted-foreground))"
                      tickLine={false}
                      axisLine={false}
                      style={{ fontSize: "11px" }}
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      tickLine={false}
                      axisLine={false}
                      width={72}
                      tickFormatter={(v) => currencyFormatter.format(v)}
                      style={{ fontSize: "11px" }}
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                    />
                    <ChartTooltip
                      content={({ active, payload, label }) =>
                        <ChartTooltipContent active={active} payload={payload} label={label} />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="profitUsd"
                      stroke={isPositive ? "var(--positive)" : "var(--negative)"}
                      strokeWidth={2}
                      fill="url(#chartGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <p className="text-sm">Aucune donnée à afficher.</p>
                <button onClick={onOpenIntegrations} className="text-xs text-primary hover:underline cursor-pointer">
                  Connecter une plateforme →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Portfolio value chart with buy/sell markers */}
        <div className="bg-[var(--surface-low)] border border-border/60 rounded-lg p-5">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-5 pb-4 border-b border-border/40">
            <div>
              <h2 className="text-sm font-bold tracking-tight text-foreground">Valeur investie</h2>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">Montant du portefeuille (USD)</p>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-bold">
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
            {portfolioValueSeries.length > 0 ? (
              <ChartContainer
                config={{ portfolioValue: { label: "Montant USD", color: "var(--primary)" } }}
                className="h-full w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={portfolioValueSeries} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis
                      dataKey="label"
                      stroke="hsl(var(--muted-foreground))"
                      tickLine={false}
                      axisLine={false}
                      style={{ fontSize: "11px" }}
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      tickLine={false}
                      axisLine={false}
                      width={72}
                      tickFormatter={(v) => currencyFormatter.format(v)}
                      style={{ fontSize: "11px" }}
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                    />
                    <ChartTooltip
                      content={({ active, payload, label }) =>
                        <ChartTooltipContent active={active} payload={payload} label={label} />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="portfolioValue"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      fill="url(#portfolioGrad)"
                      dot={false}
                      activeDot={{ r: 4, fill: "var(--primary)" }}
                    />
                    {/* Buy markers — green dots */}
                    <Line
                      type="monotone"
                      dataKey="buyMarker"
                      stroke="none"
                      dot={(props: any) => {
                        if (props.payload?.buyMarker == null) return <g key={props.key} />;
                        return (
                          <circle
                            key={props.key}
                            cx={props.cx}
                            cy={props.cy}
                            r={6}
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
                    {/* Sell markers — red dots */}
                    <Line
                      type="monotone"
                      dataKey="sellMarker"
                      stroke="none"
                      dot={(props: any) => {
                        if (props.payload?.sellMarker == null) return <g key={props.key} />;
                        return (
                          <circle
                            key={props.key}
                            cx={props.cx}
                            cy={props.cy}
                            r={6}
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
                  </AreaChart>
                </ResponsiveContainer>
              </ChartContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <p className="text-sm">Aucune donnée à afficher.</p>
                <button onClick={onOpenIntegrations} className="text-xs text-primary hover:underline cursor-pointer">
                  Connecter une plateforme →
                </button>
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
                {tab === "jetons" ? `Jetons (${portfolioTokens.length})` : "Plateformes"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {pricesError && <span className="text-[10px] text-negative">{pricesError}</span>}
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
            <div className="px-5 py-2 border-b border-border/20 flex items-center gap-2">
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
                const currentPrice = currentPrices[token.symbol];
                const currentValue = currentPrice && token.currentQuantity > 0
                  ? currentPrice * token.currentQuantity : null;
                const costOfHoldings = token.avgCostBasis * token.currentQuantity;
                const unrealized = currentValue !== null ? currentValue - costOfHoldings : null;
                const totalPnl = unrealized !== null ? token.realizedPnlAvco + unrealized : null;
                return { token, currentPrice, currentValue, unrealized, totalPnl };
              });

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
                  className={`px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground cursor-pointer hover:text-primary transition-colors ${align === "left" ? "text-left" : "text-right"}`}
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
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          <span className="flex items-center justify-end gap-1">
                            Prix actuel
                            {pricesLoading && <LoaderCircle className="w-3 h-3 animate-spin text-primary" />}
                          </span>
                        </th>
                        <SortTh col="value" label="Valeur" />
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">PnL réalisé</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">PnL latent</th>
                        <SortTh col="pnlTotal" label="PnL total" />
                      </tr>
                    </thead>
                    <tbody className="text-xs font-medium">
                      {sorted.map(({ token, currentPrice, currentValue, unrealized, totalPnl }) => {
                        const realized = token.realizedPnlAvco;
                        return (
                          <tr key={token.symbol} className="border-t border-border/20 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 shrink-0 relative">
                                  {getCmcIconUrl(token.symbol) ? (
                                    <img
                                      src={getCmcIconUrl(token.symbol) || ""}
                                      alt={token.symbol}
                                      className="w-7 h-7 rounded-full object-cover bg-muted"
                                      onError={(e) => {
                                        // Fallback to initials if image fails
                                        const container = e.currentTarget.parentElement;
                                        if (container) {
                                          container.innerHTML = `<div class="w-7 h-7 bg-muted rounded-full flex items-center justify-center text-[10px] font-black text-primary">${token.symbol.slice(0, 2)}</div>`;
                                        }
                                      }}
                                    />
                                  ) : (
                                    <div className="w-7 h-7 bg-muted rounded-full flex items-center justify-center text-[10px] font-black text-primary">
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
                            <td className="px-4 py-3 text-right text-muted-foreground">
                              {token.currentQuantity > 0
                                ? token.currentQuantity.toLocaleString("fr-FR", { maximumFractionDigits: 6 })
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-right text-muted-foreground">
                              {token.avgCostBasis > 0 ? currencyFormatter.format(token.avgCostBasis) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-primary">
                              {currentPrice ? currencyFormatter.format(currentPrice) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-foreground">
                              {currentValue !== null ? currencyFormatter.format(currentValue) : "—"}
                            </td>
                            <td className={`px-4 py-3 text-right font-bold ${realized >= 0 ? "text-positive" : "text-negative"}`}>
                              {realized !== 0
                                ? `${realized >= 0 ? "+" : ""}${currencyFormatter.format(realized)}`
                                : <span className="text-muted-foreground/40">—</span>}
                            </td>
                            <td className={`px-4 py-3 text-right font-bold ${unrealized === null ? "text-muted-foreground/40" : unrealized >= 0 ? "text-positive" : "text-negative"}`}>
                              {unrealized !== null
                                ? `${unrealized >= 0 ? "+" : ""}${currencyFormatter.format(unrealized)}`
                                : "—"}
                            </td>
                            <td className={`px-4 py-3 text-right font-bold ${totalPnl === null ? "text-muted-foreground/40" : totalPnl >= 0 ? "text-positive" : "text-negative"}`}>
                              {totalPnl !== null
                                ? `${totalPnl >= 0 ? "+" : ""}${currencyFormatter.format(totalPnl)}`
                                : currencyFormatter.format(realized)}
                            </td>
                          </tr>
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

        {activeTab === "plateformes" && (
          <div className="text-center py-10 text-muted-foreground text-sm">
            Onglet Plateformes en développement.
          </div>
        )}
      </section>
    </div>
  );
}
