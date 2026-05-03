"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
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
import { api } from "@/convex/_generated/api";
import { isConvexConfigured } from "@/convex/client";
import { currencyFormatter, type TokenTimelineEvent } from "@/hooks/dashboard/useDashboardMetrics";

const dayLabelFormatter = new Intl.DateTimeFormat("fr-FR", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function startOfUtcDay(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function formatAxisValue(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}M $`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1).replace(/\.0$/, "")}k $`;
  if (abs >= 1) return `${sign}${abs.toFixed(0)} $`;
  return `${sign}${abs.toPrecision(2)} $`;
}

export function TokenHistoryChart({
  symbol,
  events,
}: {
  symbol: string;
  events: TokenTimelineEvent[];
}) {
  const [fromDay, toDay] = useMemo(() => {
    if (events.length === 0) return [0, 0];
    let earliest = Number.POSITIVE_INFINITY;
    for (const ev of events) earliest = Math.min(earliest, ev.timestamp);
    return [startOfUtcDay(earliest), startOfUtcDay(Date.now())];
  }, [events]);

  const priceHistory = useQuery(
    api.priceHistory.getRange,
    isConvexConfigured && fromDay > 0 ? { symbol, fromDay, toDay } : "skip"
  );

  const buySellDays = useMemo(() => {
    const buys = new Set<number>();
    const sells = new Set<number>();
    for (const event of events) {
      if (event.type !== "BUY" && event.type !== "SELL") continue;
      const d = new Date(event.timestamp);
      const dayTs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      if (event.type === "BUY") buys.add(dayTs);
      else sells.add(dayTs);
    }
    return { buys, sells };
  }, [events]);

  const data = useMemo(() => {
    if (!priceHistory) return [];
    return priceHistory
      .slice()
      .sort((a, b) => a.dayUtc - b.dayUtc)
      .map((p) => ({
        timestamp: p.dayUtc,
        label: dayLabelFormatter.format(new Date(p.dayUtc)),
        price: p.closeUsd,
        buyMarker: buySellDays.buys.has(p.dayUtc) ? p.closeUsd : null,
        sellMarker: buySellDays.sells.has(p.dayUtc) ? p.closeUsd : null,
      }));
  }, [priceHistory, buySellDays]);

  if (priceHistory === undefined) {
    return (
      <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
        Chargement de l&apos;historique de {symbol}…
      </div>
    );
  }

  if (data.length < 2) {
    return (
      <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
        Pas d&apos;historique de prix disponible pour {symbol}.
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface-low)] border border-border/40 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-border/40">
        <div>
          <h3 className="text-xs font-bold tracking-tight text-foreground">
            Historique {symbol} / USD
          </h3>
          <p className="text-[9px] text-muted-foreground uppercase tracking-widest mt-0.5">
            Cours quotidien · marqueurs Achat / Vente
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-bold">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[var(--positive)]" />
            <span className="text-muted-foreground">Achat</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[var(--negative)]" />
            <span className="text-muted-foreground">Vente</span>
          </span>
        </div>
      </div>

      <div className="h-[200px] w-full">
        <ChartContainer
          config={{ price: { label: `${symbol}/USD`, color: "var(--primary)" } }}
          className="h-full w-full"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id={`tokenHistGrad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                minTickGap={40}
              />
              <YAxis
                stroke="var(--muted-foreground)"
                tickLine={false}
                axisLine={false}
                width={62}
                tickFormatter={(v) => formatAxisValue(v)}
                style={{ fontSize: "10px" }}
                tick={{ fill: "var(--muted-foreground)" }}
              />
              <ChartTooltip
                content={({ active, payload, label }) =>
                  <ChartTooltipContent
                    active={active}
                    payload={payload}
                    label={label}
                    formatter={(value) => currencyFormatter.format(Number(value))}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="var(--primary)"
                strokeWidth={2}
                fill={`url(#tokenHistGrad-${symbol})`}
                dot={false}
                activeDot={{ r: 3 }}
              />
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
                      r={4}
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
                      r={4}
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
      </div>
    </div>
  );
}
