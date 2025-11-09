"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { currencyFormatter, numberFormatter, type HistoryPoint, type PerformancePoint, type ProfitSummary, type PortfolioToken } from "@/hooks/dashboard/useDashboardMetrics";
import { TokenPortfolioSection } from "./TokenPortfolioSection";

type AllocationEntry = {
  symbol: string;
  share: number;
  value: number;
};

type TimeframeValue = "24H" | "7D" | "30D" | "90D" | "ALL";

type TimeframeOption = {
  label: string;
  value: TimeframeValue;
  durationMs: number | null;
};

const TIMEFRAME_OPTIONS: TimeframeOption[] = [
  { label: "24h", value: "24H", durationMs: 24 * 60 * 60 * 1000 },
  { label: "7j", value: "7D", durationMs: 7 * 24 * 60 * 60 * 1000 },
  { label: "30 j", value: "30D", durationMs: 30 * 24 * 60 * 60 * 1000 },
  { label: "90 j", value: "90D", durationMs: 90 * 24 * 60 * 60 * 1000 },
  { label: "Tout", value: "ALL", durationMs: null },
];

const ALLOCATION_COLORS = ["#4F46E5", "#22C55E", "#F97316", "#0EA5E9", "#E11D48", "#FACC15", "#6366F1", "#14B8A6"];

type OverviewTabProps = {
  profitSummary: ProfitSummary;
  historySeries: HistoryPoint[];
  performanceSeries: PerformancePoint[];
  allocation: AllocationEntry[];
  totalVolume: number;
  portfolioTokens: PortfolioToken[];
  onOpenIntegrations: () => void;
};

function formatCurrencyWithSign(value: number) {
  const formatted = currencyFormatter.format(Math.abs(value));
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
}

function formatPercent(value: number) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function OverviewTab({
  profitSummary,
  historySeries,
  performanceSeries,
  allocation,
  totalVolume,
  portfolioTokens,
  onOpenIntegrations,
}: OverviewTabProps) {
  const [timeframe, setTimeframe] = useState<TimeframeValue>("30D");

  const latestTimestamp = historySeries.length > 0 ? historySeries[historySeries.length - 1].timestamp : Date.now();

  const filteredHistory = useMemo(() => {
    if (historySeries.length === 0) {
      return [];
    }
    const option = TIMEFRAME_OPTIONS.find((item) => item.value === timeframe);
    if (!option || option.durationMs === null) {
      return historySeries;
    }
    const cutoff = latestTimestamp - option.durationMs;
    return historySeries.filter((point) => point.timestamp >= cutoff);
  }, [historySeries, timeframe, latestTimestamp]);

  const historyYAxisDomain = useMemo(() => {
    if (filteredHistory.length === 0) {
      return [0, 0];
    }
    const profits = filteredHistory.map((point) => point.profitUsd);
    const min = Math.min(...profits);
    const max = Math.max(...profits);
    const spread = max - min;
    const padding = spread === 0 ? Math.max(Math.abs(min) * 0.1, 1) : spread * 0.1;
    return [min - padding, max + padding];
  }, [filteredHistory]);

  const allocationData = useMemo(
    () =>
      allocation.map((item, index) => ({
        ...item,
        color: ALLOCATION_COLORS[index % ALLOCATION_COLORS.length],
      })),
    [allocation]
  );

  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Profit total"
          value={currencyFormatter.format(profitSummary.totalProfitUsd)}
          accent={profitSummary.totalProfitUsd >= 0 ? "positive" : "negative"}
          subtitle={formatPercent(profitSummary.profitPercentage)}
        />
        <StatCard
          title="Cost basis"
          value={currencyFormatter.format(profitSummary.costBasisUsd)}
          subtitle={`Volume total ${currencyFormatter.format(totalVolume)}`}
        />
        <PerformerCard
          title="Best performer"
          performer={profitSummary.bestPerformer}
        />
        <PerformerCard
          title="Worst performer"
          performer={profitSummary.worstPerformer}
          fallbackLabel="No data"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <Card className="border-border/60 bg-card/80 backdrop-blur xl:col-span-2 flex flex-col">
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardDescription>Historique</CardDescription>
              <CardTitle className="text-xl text-foreground">Profit cumulé</CardTitle>
            </div>
            <div className="flex items-center gap-1 rounded-full bg-muted/50 p-1">
              {TIMEFRAME_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant={timeframe === option.value ? "default" : "ghost"}
                  size="sm"
                  className="h-8 rounded-full px-3 text-xs"
                  onClick={() => setTimeframe(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="flex-1 h-72">
            {filteredHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={filteredHistory}>
                  <defs>
                    <linearGradient id="overviewHistoryGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#C9A646" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#C9A646" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis
                    dataKey="label"
                    stroke="hsl(var(--muted-foreground))"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    domain={historyYAxisDomain as [number, number]}
                    tickFormatter={(value) => currencyFormatter.format(value)}
                  />
                  <RechartsTooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    contentStyle={{
                      background: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "12px",
                      color: "hsl(var(--foreground))",
                    }}
                    formatter={(value: number) => currencyFormatter.format(value)}
                  />
                  <Area
                    type="monotone"
                    dataKey="profitUsd"
                    stroke="#C9A646"
                    strokeWidth={3}
                    fill="url(#overviewHistoryGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Import transactions to display the cumulative chart.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-5 auto-rows-fr">
          <Card className="border-border/60 bg-card/80 backdrop-blur flex flex-col">
            <CardHeader>
              <CardDescription>Répartition</CardDescription>
              <CardTitle className="text-lg text-foreground">Allocation par symbole</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-6 lg:flex-row lg:items-center">
              {allocationData.length > 0 ? (
                <>
                  <div className="mx-auto h-48 w-full max-w-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={allocationData}
                          dataKey="share"
                          nameKey="symbol"
                          innerRadius="60%"
                          outerRadius="90%"
                          paddingAngle={2}
                        >
                          {allocationData.map((item) => (
                            <Cell key={item.symbol} fill={item.color} stroke="transparent" />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-3">
                    {allocationData.slice(0, 6).map((item) => (
                      <div key={item.symbol} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block size-2 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="font-medium text-foreground">{item.symbol}</span>
                        </div>
                        <span className="text-muted-foreground">{item.share.toFixed(2)}%</span>
                      </div>
                    ))}
                    {allocationData.length === 0 ? null : (
                      <p className="text-xs text-muted-foreground">
                        {allocationData.length} symboles suivis · {currencyFormatter.format(totalVolume)} de volume.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No transactions yet. Run a sync to populate the allocation chart.
                </p>
              )}
            </CardContent>
            <CardFooter>
              <Button variant="ghost" className="text-xs" onClick={onOpenIntegrations}>
                Ajouter une intégration
              </Button>
            </CardFooter>
          </Card>

          <Card className="border-border/60 bg-card/80 backdrop-blur flex flex-col">
            <CardHeader>
              <CardDescription>Performance (cumulative)</CardDescription>
              <CardTitle className="text-lg text-foreground">Profit vs. benchmark</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 h-72">
              {performanceSeries.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={performanceSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis
                      dataKey="label"
                      stroke="hsl(var(--muted-foreground))"
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      tickLine={false}
                      axisLine={false}
                      width={56}
                      tickFormatter={(value) => `${value.toFixed(1)}%`}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        background: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "12px",
                        color: "hsl(var(--foreground))",
                      }}
                      formatter={(value: number) => `${value.toFixed(2)}%`}
                    />
                    <Line
                      type="monotone"
                      dataKey="profitPercent"
                      stroke="#2563EB"
                      strokeWidth={2}
                      dot={false}
                      name="All-time profit"
                    />
                    <Line
                      type="monotone"
                      dataKey="benchmarkPercent"
                      stroke="#F97316"
                      strokeWidth={2}
                      dot={false}
                      name="Net invested"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Import transactions to display performance.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <TokenPortfolioSection tokens={portfolioTokens} />
    </>
  );
}

type StatCardProps = {
  title: string;
  value: string;
  subtitle?: string;
  accent?: "positive" | "negative";
};

function StatCard({ title, value, subtitle, accent }: StatCardProps) {
  return (
    <Card className="border-border/60 bg-card/80 backdrop-blur">
      <CardHeader className="space-y-1 pb-2">
        <CardDescription className="text-[13px] uppercase tracking-[0.35em] text-muted-foreground/80">
          {title}
        </CardDescription>
        <CardTitle
          className={`text-2xl ${
            accent === "positive"
              ? "text-emerald-500"
              : accent === "negative"
                ? "text-red-500"
                : "text-foreground"
          }`}
        >
          {value}
        </CardTitle>
      </CardHeader>
      {subtitle ? (
        <CardContent className="text-xs text-muted-foreground">{subtitle}</CardContent>
      ) : null}
    </Card>
  );
}

type PerformerCardProps = {
  title: string;
  performer?: ProfitSummary["bestPerformer"] | null;
  fallbackLabel?: string;
};

function PerformerCard({ title, performer, fallbackLabel = "N/A" }: PerformerCardProps) {
  return (
    <Card className="border-border/60 bg-card/80 backdrop-blur">
      <CardHeader className="space-y-1 pb-2">
        <CardDescription className="text-[13px] uppercase tracking-[0.35em] text-muted-foreground/80">
          {title}
        </CardDescription>
        <CardTitle className="text-2xl text-foreground">
          {performer ? performer.symbol : fallbackLabel}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        {performer ? (
          <>
            <span className={performer.profitUsd >= 0 ? "text-emerald-500" : "text-red-500"}>
              {formatCurrencyWithSign(performer.profitUsd)}
            </span>
            {performer.profitPercentage !== undefined ? (
              <span className="ml-1">
                {formatPercent(performer.profitPercentage)}
              </span>
            ) : null}
          </>
        ) : (
          "Aucune performance enregistrée."
        )}
      </CardContent>
    </Card>
  );
}
