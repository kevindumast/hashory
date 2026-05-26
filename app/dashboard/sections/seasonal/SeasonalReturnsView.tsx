"use client";

import React, { useMemo } from "react";
import type { PortfolioSnapshot } from "@/hooks/usePortfolioSnapshots";
import type { IntegrationRecord } from "@/hooks/dashboard/useIntegrations";
import type { TradeRecord } from "@/hooks/dashboard/useDashboardMetrics";

const MONTHS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const MONTHS_SHORT = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
const QUARTERS = ["T1","T2","T3","T4"];
const QUARTER_MONTHS = [[0,1,2],[3,4,5],[6,7,8],[9,10,11]];
const DAY_MS = 86_400_000;

const QUOTE_ASSETS = ["USDT","USDC","BUSD","USD","FDUSD","TUSD","DAI","BTC","ETH","BNB","EUR","GBP","TRY","AUD","CAD","BRL","ARS"];
const STABLECOINS = new Set(["USDT","USDC","BUSD","USD","FDUSD","TUSD","DAI"]);

type PriceHistory = Record<string, { dayUtc: number; closeUsd: number }[]>;

type Props = {
  snapshots: PortfolioSnapshot[];
  integrations: IntegrationRecord[];
  allTrades: TradeRecord[];
  selectedIntegration: string;
  onSelectIntegration: (id: string) => void;
  isDcaOnly: boolean;
  dcaPriceHistory: PriceHistory | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractBaseAsset(symbol: string): string {
  const upper = symbol.toUpperCase();
  for (const q of QUOTE_ASSETS) {
    if (upper.endsWith(q)) { const b = upper.slice(0, upper.length - q.length); if (b) return b; }
  }
  return upper;
}

function startOfUtcDay(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// ─── Snapshot-based (all portfolio) — Modified Dietz ─────────────────────────

type SimpleSnap = { dayUtc: number; valueUsd: number; netInvestedUsd: number };

function getLastBefore<T extends { dayUtc: number }>(arr: T[], dayUtc: number): T | null {
  for (let i = arr.length - 1; i >= 0; i--) { if (arr[i].dayUtc < dayUtc) return arr[i]; }
  return null;
}

function getLastInMonth<T extends { dayUtc: number }>(arr: T[], year: number, month: number): T | null {
  const lo = Date.UTC(year, month, 1);
  const hi = Date.UTC(year, month + 1, 1);
  for (let i = arr.length - 1; i >= 0; i--) {
    const d = arr[i].dayUtc;
    if (d >= lo && d < hi) return arr[i];
  }
  return null;
}

function computeMonthlyFromSnapshots(snaps: SimpleSnap[]): Map<number, (number | null)[]> {
  if (snaps.length === 0) return new Map();
  const sorted = [...snaps].sort((a, b) => a.dayUtc - b.dayUtc);
  const minYear = new Date(sorted[0].dayUtc).getUTCFullYear();
  const maxYear = new Date(sorted[sorted.length - 1].dayUtc).getUTCFullYear();
  const result = new Map<number, (number | null)[]>();
  for (let year = minYear; year <= maxYear; year++) {
    const months: (number | null)[] = [];
    for (let m = 0; m < 12; m++) {
      const startSnap = getLastBefore(sorted, Date.UTC(year, m, 1));
      const endSnap = getLastInMonth(sorted, year, m);
      if (!endSnap) { months.push(null); continue; }
      const EV = endSnap.valueUsd;
      const BV = startSnap?.valueUsd ?? 0;
      const CF = endSnap.netInvestedUsd - (startSnap?.netInvestedUsd ?? 0);
      const denom = BV + CF / 2;
      if (Math.abs(denom) < 1) { months.push(null); continue; }
      months.push(((EV - BV - CF) / denom) * 100);
    }
    result.set(year, months);
  }
  return result;
}

// ─── DCA integration: holdings × market price ────────────────────────────────

function buildDcaSnapshots(trades: TradeRecord[], prices: PriceHistory): SimpleSnap[] {
  if (trades.length === 0) return [];
  const sorted = [...trades].sort((a, b) => a.executedAt - b.executedAt);
  const todayUtc = startOfUtcDay(Date.now());
  const firstDay = startOfUtcDay(sorted[0].executedAt);

  const holdings = new Map<string, { qty: number; avgCost: number }>();
  let netInvestedUsd = 0;
  let eventIdx = 0;

  // Price forward-fill cursor per symbol
  const cursors = new Map<string, number>();
  function priceAt(symbol: string, dayUtc: number): number {
    if (STABLECOINS.has(symbol)) return 1;
    const series = prices[symbol.toUpperCase()];
    if (!series || series.length === 0) return 0;
    let idx = cursors.get(symbol) ?? -1;
    while (idx + 1 < series.length && series[idx + 1].dayUtc <= dayUtc) idx++;
    cursors.set(symbol, idx);
    return idx >= 0 ? series[idx].closeUsd : 0;
  }

  const result: SimpleSnap[] = [];

  for (let day = firstDay; day <= todayUtc; day += DAY_MS) {
    const dayEnd = day + DAY_MS;
    while (eventIdx < sorted.length && sorted[eventIdx].executedAt < dayEnd) {
      const t = sorted[eventIdx];
      const valueUsd = t.quoteQuantity ?? t.price * t.quantity;
      const base = t.tradeType === "CONVERT" && t.toAsset
        ? t.toAsset.toUpperCase()
        : extractBaseAsset(t.symbol);
      const h = holdings.get(base) ?? { qty: 0, avgCost: 0 };
      if (t.side === "BUY") {
        const newQty = h.qty + t.quantity;
        holdings.set(base, { qty: newQty, avgCost: newQty > 0 ? (h.qty * h.avgCost + valueUsd) / newQty : 0 });
        netInvestedUsd += valueUsd;
      } else {
        const sold = Math.min(t.quantity, h.qty);
        netInvestedUsd = Math.max(0, netInvestedUsd - sold * h.avgCost);
        holdings.set(base, { qty: Math.max(0, h.qty - t.quantity), avgCost: h.avgCost });
      }
      eventIdx++;
    }

    let valueUsd = 0;
    for (const [sym, h] of holdings) {
      if (h.qty > 0) valueUsd += h.qty * priceAt(sym, day);
    }
    result.push({ dayUtc: day, valueUsd, netInvestedUsd });
  }
  return result;
}

// ─── Trade-based (active trading) — realized P&L / cost basis ────────────────

type TradePoint = { timestamp: number; realizedPnl: number; costBasis: number };

function buildTradeHistory(trades: TradeRecord[]): TradePoint[] {
  if (trades.length === 0) return [];
  const sorted = [...trades].sort((a, b) => a.executedAt - b.executedAt);
  const holdings = new Map<string, { qty: number; avgCost: number }>();
  let realizedPnl = 0;
  let totalCostBasis = 0;
  const byDay = new Map<string, TradePoint>();

  for (const t of sorted) {
    const valueUsd = t.quoteQuantity ?? t.price * t.quantity;
    const base = t.tradeType === "CONVERT" && t.toAsset ? t.toAsset.toUpperCase() : extractBaseAsset(t.symbol);
    const h = holdings.get(base) ?? { qty: 0, avgCost: 0 };
    if (t.side === "BUY") {
      const newQty = h.qty + t.quantity;
      holdings.set(base, { qty: newQty, avgCost: newQty > 0 ? (h.qty * h.avgCost + valueUsd) / newQty : 0 });
      totalCostBasis += valueUsd;
    } else {
      const sold = Math.min(t.quantity, h.qty);
      const costSold = sold * h.avgCost;
      realizedPnl += valueUsd - costSold;
      totalCostBasis = Math.max(0, totalCostBasis - costSold);
      holdings.set(base, { qty: Math.max(0, h.qty - t.quantity), avgCost: h.avgCost });
    }
    const d = new Date(t.executedAt);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, { timestamp: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), realizedPnl, costBasis: totalCostBasis });
  }
  return Array.from(byDay.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function computeMonthlyFromTrades(history: TradePoint[]): Map<number, (number | null)[]> {
  if (history.length === 0) return new Map();
  const minYear = new Date(history[0].timestamp).getUTCFullYear();
  const maxYear = new Date(history[history.length - 1].timestamp).getUTCFullYear();
  const result = new Map<number, (number | null)[]>();
  for (let year = minYear; year <= maxYear; year++) {
    const months: (number | null)[] = [];
    for (let m = 0; m < 12; m++) {
      const cutoff = Date.UTC(year, m, 1);
      const monthEnd = Date.UTC(year, m + 1, 1);
      const endPt = [...history].reverse().find((p) => p.timestamp >= cutoff && p.timestamp < monthEnd) ?? null;
      if (!endPt) { months.push(null); continue; }
      const startPt = [...history].reverse().find((p) => p.timestamp < cutoff) ?? null;
      const monthlyGain = endPt.realizedPnl - (startPt?.realizedPnl ?? 0);
      const base = Math.max(startPt?.costBasis ?? endPt.costBasis, 1);
      months.push((monthlyGain / base) * 100);
    }
    result.set(year, months);
  }
  return result;
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function computeQuarterlyReturns(monthly: Map<number, (number | null)[]>): Map<number, (number | null)[]> {
  const result = new Map<number, (number | null)[]>();
  for (const [year, months] of monthly) {
    result.set(year, QUARTER_MONTHS.map((qm) => {
      const vals = qm.map((m) => months[m]).filter((v): v is number => v !== null);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : null;
    }));
  }
  return result;
}

// ─── Presentation ─────────────────────────────────────────────────────────────

function cellColor(v: number | null) {
  if (v === null) return "bg-muted/20 text-muted-foreground/40";
  if (v === 0) return "bg-muted/30 text-muted-foreground";
  return v > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300";
}

function cellBg(v: number | null): React.CSSProperties {
  if (v === null || v === 0) return {};
  const intensity = Math.min(Math.abs(v) / 30, 1);
  const alpha = Math.round((0.12 + intensity * 0.55) * 255).toString(16).padStart(2, "0");
  return v > 0 ? { backgroundColor: `#10b981${alpha}` } : { backgroundColor: `#ef4444${alpha}` };
}

function avg(vals: (number | null)[]) {
  const ns = vals.filter((v): v is number => v !== null);
  return ns.length > 0 ? ns.reduce((a, b) => a + b, 0) / ns.length : null;
}

function median(vals: (number | null)[]) {
  const ns = vals.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (!ns.length) return null;
  const mid = Math.floor(ns.length / 2);
  return ns.length % 2 ? ns[mid] : (ns[mid - 1] + ns[mid]) / 2;
}

function fmt(v: number | null) {
  return v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function ReturnCell({ value }: { value: number | null }) {
  return (
    <td className={`px-2 py-2 text-center text-[12px] font-bold tabular-nums rounded transition-all ${cellColor(value)}`} style={cellBg(value)}>
      {fmt(value)}
    </td>
  );
}

function SummaryCell({ value }: { value: number | null }) {
  return <td className="px-2 py-2 text-center text-[12px] font-semibold tabular-nums bg-muted/30 text-muted-foreground">{fmt(value)}</td>;
}

function ReturnsTable({ title, data, cols, colsFull }: { title: string; data: Map<number, (number | null)[]>; cols: string[]; colsFull: string[] }) {
  const years = Array.from(data.keys()).sort((a, b) => b - a);
  const colAvgs = cols.map((_, i) => avg(years.map((y) => data.get(y)?.[i] ?? null)));
  const colMeds = cols.map((_, i) => median(years.map((y) => data.get(y)?.[i] ?? null)));
  const yearTotals = years.map((y) => {
    const ns = (data.get(y) ?? []).filter((v): v is number => v !== null);
    return ns.length > 0 ? ns.reduce((a, b) => a + b, 0) : null;
  });
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold tracking-tight text-foreground">{title}</h2>
      <div className="overflow-x-auto rounded-lg border border-border/60 bg-[var(--surface-low)]">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-muted-foreground w-16">Temps</th>
              {cols.map((col, i) => <th key={col} title={colsFull[i]} className="px-2 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground min-w-[80px]">{col}</th>)}
              <th className="px-2 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground min-w-[80px]">Total</th>
            </tr>
          </thead>
          <tbody>
            {years.map((year, yi) => (
              <tr key={year} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                <td className="px-4 py-1.5 text-[12px] font-bold text-foreground">{year}</td>
                {(data.get(year) ?? []).map((val, i) => <ReturnCell key={i} value={val} />)}
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

// ─── Main component ───────────────────────────────────────────────────────────

export function SeasonalReturnsView({ snapshots, integrations, allTrades, selectedIntegration, onSelectIntegration, isDcaOnly, dcaPriceHistory }: Props) {
  const integrationsWithTrades = useMemo(() => {
    const ids = new Set(allTrades.map((t) => String(t.integrationId)));
    return integrations.filter((i) => ids.has(String(i._id)));
  }, [integrations, allTrades]);

  const monthlyReturns = useMemo(() => {
    if (selectedIntegration === "all") {
      return computeMonthlyFromSnapshots(snapshots);
    }
    if (isDcaOnly) {
      if (!dcaPriceHistory) return new Map<number, (number | null)[]>();
      const filtered = allTrades.filter((t) => String(t.integrationId) === selectedIntegration);
      const dcaSnaps = buildDcaSnapshots(filtered, dcaPriceHistory);
      return computeMonthlyFromSnapshots(dcaSnaps);
    }
    const filtered = allTrades.filter((t) => String(t.integrationId) === selectedIntegration);
    return computeMonthlyFromTrades(buildTradeHistory(filtered));
  }, [selectedIntegration, isDcaOnly, dcaPriceHistory, snapshots, allTrades]);

  const quarterlyReturns = useMemo(() => computeQuarterlyReturns(monthlyReturns), [monthlyReturns]);
  const quarterColsFull = QUARTERS.map((q, qi) => `${q} (${QUARTER_MONTHS[qi].map((m) => MONTHS_SHORT[m]).join("-")})`);

  const isEmpty = selectedIntegration === "all"
    ? snapshots.length === 0
    : allTrades.filter((t) => String(t.integrationId) === selectedIntegration).length === 0;

  const isLoadingPrices = isDcaOnly && selectedIntegration !== "all" && dcaPriceHistory === null;

  const footnote = selectedIntegration === "all" || isDcaOnly
    ? "Performance mensuelle en valeur de marché, ajustée des flux de capitaux (méthode Dietz modifiée)."
    : "P&L réalisé mensuel en % du coût moyen d'achat.";

  return (
    <div className="space-y-6">
      {/* Integration filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Portefeuille</span>
        <div className="flex gap-1">
          <button onClick={() => onSelectIntegration("all")}
            className={`px-3 py-1 text-[11px] font-bold rounded transition-colors cursor-pointer ${selectedIntegration === "all" ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
            Tous
          </button>
          {integrationsWithTrades.map((intg) => (
            <button key={intg._id} onClick={() => onSelectIntegration(String(intg._id))}
              className={`px-3 py-1 text-[11px] font-bold rounded transition-colors cursor-pointer ${selectedIntegration === String(intg._id) ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              {intg.displayName ?? intg.provider}
            </button>
          ))}
        </div>
      </div>

      {isEmpty ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
          Aucune donnée disponible. Synchronisez vos intégrations.
        </div>
      ) : isLoadingPrices ? (
        <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground text-sm">
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          Chargement des prix historiques…
        </div>
      ) : (
        <>
          <ReturnsTable title="Retours mensuels (%)" data={monthlyReturns} cols={MONTHS_SHORT} colsFull={MONTHS} />
          <ReturnsTable title="Rendements trimestriels (%)" data={quarterlyReturns} cols={QUARTERS} colsFull={quarterColsFull} />
          <p className="text-[10px] text-muted-foreground/70 italic">{footnote}</p>
        </>
      )}
    </div>
  );
}
