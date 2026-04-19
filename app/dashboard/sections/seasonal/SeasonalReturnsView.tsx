"use client";

import React, { useMemo, useState } from "react";
import type { HistoryPoint } from "@/hooks/dashboard/useDashboardMetrics";
import type { IntegrationRecord } from "@/hooks/dashboard/useIntegrations";
import type { TradeRecord } from "@/hooks/dashboard/useDashboardMetrics";

const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const MONTHS_SHORT = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Jun",
  "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc",
];
const QUARTERS = ["T1", "T2", "T3", "T4"];
const QUARTER_MONTHS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]];

type Props = {
  historySeries: HistoryPoint[];
  integrations: IntegrationRecord[];
  allTrades: TradeRecord[];
};

function buildHistoryFromTrades(trades: TradeRecord[]): HistoryPoint[] {
  if (trades.length === 0) return [];
  const sorted = [...trades].sort((a, b) => a.executedAt - b.executedAt);
  const byDay = new Map<string, { timestamp: number; profitUsd: number; netInvestedUsd: number }>();
  let cumulativeProfit = 0;
  let netInvestedUsd = 0;

  for (const trade of sorted) {
    const valueUsd = trade.quoteQuantity ?? trade.price * trade.quantity;
    if (trade.side === "BUY") {
      cumulativeProfit -= valueUsd;
      netInvestedUsd += valueUsd;
    } else {
      cumulativeProfit += valueUsd;
      netInvestedUsd = Math.max(netInvestedUsd - valueUsd, 0);
    }
    const d = new Date(trade.executedAt);
    const key = d.toISOString().slice(0, 10);
    const timestamp = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    byDay.set(key, { timestamp, profitUsd: cumulativeProfit, netInvestedUsd });
  }

  const fmt = new Intl.DateTimeFormat("fr-FR", { month: "short", day: "numeric", timeZone: "UTC" });
  return Array.from(byDay.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((p) => ({ ...p, label: fmt.format(new Date(p.timestamp)) }));
}

function getLastPointOfMonth(history: HistoryPoint[], year: number, month: number): HistoryPoint | null {
  const points = history.filter((p) => {
    const d = new Date(p.timestamp);
    return d.getUTCFullYear() === year && d.getUTCMonth() === month;
  });
  return points.length > 0 ? points[points.length - 1] : null;
}

function getLastPointBefore(history: HistoryPoint[], year: number, month: number): HistoryPoint | null {
  const cutoff = Date.UTC(year, month, 1);
  const before = history.filter((p) => p.timestamp < cutoff);
  return before.length > 0 ? before[before.length - 1] : null;
}

function computeMonthlyReturns(history: HistoryPoint[]): Map<number, (number | null)[]> {
  if (history.length === 0) return new Map();
  const minYear = new Date(history[0].timestamp).getUTCFullYear();
  const maxYear = new Date(history[history.length - 1].timestamp).getUTCFullYear();
  const result = new Map<number, (number | null)[]>();

  for (let year = minYear; year <= maxYear; year++) {
    const months: (number | null)[] = [];
    for (let m = 0; m < 12; m++) {
      const endPoint = getLastPointOfMonth(history, year, m);
      if (!endPoint) { months.push(null); continue; }
      const startPoint = getLastPointBefore(history, year, m);
      const startProfit = startPoint?.profitUsd ?? 0;
      const startInvested = startPoint?.netInvestedUsd ?? endPoint.netInvestedUsd;
      const delta = endPoint.profitUsd - startProfit;
      const base = Math.max(Math.abs(startInvested), Math.abs(startProfit), 1);
      months.push((delta / base) * 100);
    }
    result.set(year, months);
  }
  return result;
}

function computeQuarterlyReturns(monthly: Map<number, (number | null)[]>): Map<number, (number | null)[]> {
  const result = new Map<number, (number | null)[]>();
  for (const [year, months] of monthly) {
    const quarters: (number | null)[] = QUARTER_MONTHS.map((qMonths) => {
      const values = qMonths.map((m) => months[m]).filter((v): v is number => v !== null);
      if (values.length === 0) return null;
      return values.reduce((acc, v) => acc + v, 0);
    });
    result.set(year, quarters);
  }
  return result;
}

function cellColor(value: number | null): string {
  if (value === null) return "bg-muted/20 text-muted-foreground/40";
  if (value === 0) return "bg-muted/30 text-muted-foreground";
  const intensity = Math.min(Math.abs(value) / 30, 1);
  if (value > 0) {
    const alpha = 0.15 + intensity * 0.65;
    return `text-emerald-700 dark:text-emerald-300`;
  }
  return `text-red-700 dark:text-red-300`;
}

function cellBg(value: number | null): React.CSSProperties {
  if (value === null || value === 0) return {};
  const intensity = Math.min(Math.abs(value) / 30, 1);
  const alpha = Math.round((0.12 + intensity * 0.55) * 255).toString(16).padStart(2, "0");
  return value > 0
    ? { backgroundColor: `#10b981${alpha}` }
    : { backgroundColor: `#ef4444${alpha}` };
}

function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function median(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function fmt(v: number | null): string {
  if (v === null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function ReturnCell({ value }: { value: number | null }) {
  return (
    <td
      className={`px-2 py-2 text-center text-[12px] font-bold tabular-nums rounded transition-all ${cellColor(value)}`}
      style={cellBg(value)}
    >
      {fmt(value)}
    </td>
  );
}

function SummaryCell({ value }: { value: number | null }) {
  return (
    <td className="px-2 py-2 text-center text-[12px] font-semibold tabular-nums bg-muted/30 text-muted-foreground">
      {fmt(value)}
    </td>
  );
}

function ReturnsTable({
  title,
  data,
  cols,
  colsFull,
}: {
  title: string;
  data: Map<number, (number | null)[]>;
  cols: string[];
  colsFull: string[];
}) {
  const years = Array.from(data.keys()).sort((a, b) => b - a);
  const colAvgs = cols.map((_, i) => avg(years.map((y) => data.get(y)?.[i] ?? null)));
  const colMeds = cols.map((_, i) => median(years.map((y) => data.get(y)?.[i] ?? null)));
  const yearTotals = years.map((y) => {
    const nums = (data.get(y) ?? []).filter((v): v is number => v !== null);
    return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) : null;
  });

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold tracking-tight text-foreground">{title}</h2>
      <div className="overflow-x-auto rounded-lg border border-border/60 bg-[var(--surface-low)]">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-muted-foreground w-16">
                Temps
              </th>
              {cols.map((col, i) => (
                <th
                  key={col}
                  title={colsFull[i]}
                  className="px-2 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground min-w-[80px]"
                >
                  {col}
                </th>
              ))}
              <th className="px-2 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground min-w-[80px]">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {years.map((year, yi) => (
              <tr key={year} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                <td className="px-4 py-1.5 text-[12px] font-bold text-foreground">{year}</td>
                {(data.get(year) ?? []).map((val, i) => (
                  <ReturnCell key={i} value={val} />
                ))}
                <ReturnCell value={yearTotals[yi]} />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border/60">
              <td className="px-4 py-2 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Moyenne</td>
              {colAvgs.map((v, i) => <SummaryCell key={i} value={v} />)}
              <SummaryCell value={avg(yearTotals)} />
            </tr>
            <tr>
              <td className="px-4 py-2 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Médiane</td>
              {colMeds.map((v, i) => <SummaryCell key={i} value={v} />)}
              <SummaryCell value={median(yearTotals)} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export function SeasonalReturnsView({ historySeries, integrations, allTrades }: Props) {
  const [selectedIntegration, setSelectedIntegration] = useState<string>("all");

  const integrationsWithTrades = useMemo(() => {
    const ids = new Set(allTrades.map((t) => String(t.integrationId)));
    return integrations.filter((intg) => ids.has(String(intg._id)));
  }, [integrations, allTrades]);

  const activeHistory = useMemo(() => {
    if (selectedIntegration === "all") return historySeries;
    const filtered = allTrades.filter((t) => String(t.integrationId) === selectedIntegration);
    return buildHistoryFromTrades(filtered);
  }, [selectedIntegration, historySeries, allTrades]);

  const monthlyReturns = useMemo(() => computeMonthlyReturns(activeHistory), [activeHistory]);
  const quarterlyReturns = useMemo(() => computeQuarterlyReturns(monthlyReturns), [monthlyReturns]);

  const quarterColsFull = QUARTERS.map((q) => `${q} (${QUARTER_MONTHS[QUARTERS.indexOf(q)].map(m => MONTHS_SHORT[m]).join("-")})`);

  if (activeHistory.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
        Aucune donnée disponible. Synchronisez vos intégrations.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Portfolio filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Portefeuille</span>
        <div className="flex gap-1">
          <button
            onClick={() => setSelectedIntegration("all")}
            className={`px-3 py-1 text-[11px] font-bold rounded transition-colors cursor-pointer ${
              selectedIntegration === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            Tous
          </button>
          {integrationsWithTrades.map((intg) => (
            <button
              key={intg._id}
              onClick={() => setSelectedIntegration(String(intg._id))}
              className={`px-3 py-1 text-[11px] font-bold rounded transition-colors cursor-pointer ${
                selectedIntegration === String(intg._id)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {intg.displayName ?? intg.provider}
            </button>
          ))}
        </div>
      </div>

      {/* Monthly table */}
      <ReturnsTable
        title="Retours mensuels (%)"
        data={monthlyReturns}
        cols={MONTHS_SHORT}
        colsFull={MONTHS}
      />

      {/* Quarterly table */}
      <ReturnsTable
        title="Rendements trimestriels (%)"
        data={quarterlyReturns}
        cols={QUARTERS}
        colsFull={quarterColsFull}
      />

      <p className="text-[10px] text-muted-foreground/70 italic">
        Les rendements représentent la variation mensuelle du P&L réalisé en % du capital investi net. Calculé à partir des transactions importées.
      </p>
    </div>
  );
}

