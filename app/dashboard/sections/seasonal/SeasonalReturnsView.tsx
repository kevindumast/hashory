"use client";

import React, { useMemo } from "react";
import type { PortfolioSnapshot } from "@/hooks/usePortfolioSnapshots";
import type { IntegrationRecord } from "@/hooks/dashboard/useIntegrations";
import { compoundReturns, monthlyReturns, quarterlyReturns } from "@/lib/portfolio-history";

const MONTHS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const MONTHS_SHORT = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
const QUARTERS = ["T1","T2","T3","T4"];
const QUARTER_MONTHS = [[0,1,2],[3,4,5],[6,7,8],[9,10,11]];

type Props = {
  /** Série du périmètre affiché : portefeuille entier ou compte choisi. */
  snapshots: PortfolioSnapshot[];
  integrations: IntegrationRecord[];
  selectedIntegration: string;
  onSelectIntegration: (id: string) => void;
  isLoading: boolean;
};

// ─── Presentation ─────────────────────────────────────────────────────────────

function cellColor(v: number | null) {
  if (v === null) return "bg-muted/20 text-muted-foreground/40";
  if (v === 0) return "bg-muted/30 text-muted-foreground";
  return v > 0 ? "text-positive" : "text-negative";
}

function cellBg(v: number | null): React.CSSProperties {
  if (v === null || v === 0) return {};
  const intensity = Math.min(Math.abs(v) / 30, 1);
  const share = Math.round((0.12 + intensity * 0.55) * 100);
  const tone = v > 0 ? "var(--positive)" : "var(--negative)";
  return { backgroundColor: `color-mix(in srgb, ${tone} ${share}%, transparent)` };
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
    <td className={`num px-2 py-2 text-center text-[12px] font-bold rounded transition-all ${cellColor(value)}`} style={cellBg(value)}>
      {fmt(value)}
    </td>
  );
}

function SummaryCell({ value }: { value: number | null }) {
  return <td className="num px-2 py-2 text-center text-[12px] font-semibold bg-muted/30 text-muted-foreground">{fmt(value)}</td>;
}

function ReturnsTable({ title, data, cols, colsFull }: { title: string; data: Map<number, (number | null)[]>; cols: string[]; colsFull: string[] }) {
  const years = Array.from(data.keys()).sort((a, b) => b - a);
  const colAvgs = cols.map((_, i) => avg(years.map((y) => data.get(y)?.[i] ?? null)));
  const colMeds = cols.map((_, i) => median(years.map((y) => data.get(y)?.[i] ?? null)));
  const yearTotals = years.map((y) => compoundReturns(data.get(y) ?? []));
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold tracking-tight text-foreground">{title}</h2>
      {/* Téléphone : le tableau pivote — une ligne par période, une colonne
          par année. Treize colonnes ne tiennent pas en 400 px ; trois ou
          quatre années, si. */}
      <div className="md:hidden overflow-hidden rounded-lg border border-border/60 bg-[var(--surface-low)]">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="px-3 py-2.5 text-left num text-[10px] uppercase tracking-[0.2em] text-muted-foreground" />
              {years.map((year) => (
                <th key={year} className="px-1 py-2.5 text-center num text-[11px] font-bold text-foreground">{year}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cols.map((col, i) => (
              <tr key={col} className="border-b border-border/30">
                <td title={colsFull[i]} className="px-3 py-1 num text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{col}</td>
                {years.map((year) => <ReturnCell key={year} value={data.get(year)?.[i] ?? null} />)}
              </tr>
            ))}
            <tr>
              <td className="px-3 py-1.5 num text-[10px] font-bold uppercase tracking-[0.16em] text-foreground">Total</td>
              {yearTotals.map((total, yi) => <ReturnCell key={years[yi]} value={total} />)}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="hidden md:block overflow-x-auto rounded-lg border border-border/60 bg-[var(--surface-low)]">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="px-4 py-3 text-left num text-[10px] uppercase tracking-[0.24em] text-muted-foreground w-16">Temps</th>
              {cols.map((col, i) => <th key={col} title={colsFull[i]} className="px-2 py-3 text-center num text-[10px] uppercase tracking-[0.24em] text-muted-foreground min-w-[80px]">{col}</th>)}
              <th className="px-2 py-3 text-center num text-[10px] uppercase tracking-[0.24em] text-muted-foreground min-w-[80px]">Total</th>
            </tr>
          </thead>
          <tbody>
            {years.map((year, yi) => (
              <tr key={year} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                <td className="num px-4 py-1.5 text-[12px] font-bold text-foreground">{year}</td>
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

export function SeasonalReturnsView({ snapshots, integrations, selectedIntegration, onSelectIntegration, isLoading }: Props) {
  // Le calcul est fait côté serveur depuis le grand livre : la vue ne fait
  // que lire l'indice de performance et le découper en mois.
  const monthly = useMemo(
    () => monthlyReturns(snapshots.map((s) => ({ dayUtc: s.dayUtc, twrIndex: 1 + s.profitPercent / 100 }))),
    [snapshots]
  );
  const quarterly = useMemo(() => quarterlyReturns(monthly), [monthly]);
  const quarterColsFull = QUARTERS.map((q, qi) => `${q} (${QUARTER_MONTHS[qi].map((m) => MONTHS_SHORT[m]).join("-")})`);

  return (
    <div className="space-y-6">
      {/* Integration filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="num text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Portefeuille</span>
        <div className="flex flex-wrap gap-1">
          <button onClick={() => onSelectIntegration("all")}
            className={`px-3 py-1 text-[11px] font-bold rounded transition-colors cursor-pointer ${selectedIntegration === "all" ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
            Tous
          </button>
          {integrations.map((intg) => (
            <button key={intg._id} onClick={() => onSelectIntegration(String(intg._id))}
              className={`px-3 py-1 text-[11px] font-bold rounded transition-colors cursor-pointer ${selectedIntegration === String(intg._id) ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              {intg.displayName ?? intg.provider}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground text-sm">
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          Calcul de la performance…
        </div>
      ) : snapshots.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
          Aucune donnée disponible. Synchronisez vos intégrations.
        </div>
      ) : (
        <>
          <ReturnsTable title="Retours mensuels (%)" data={monthly} cols={MONTHS_SHORT} colsFull={MONTHS} />
          <ReturnsTable title="Rendements trimestriels (%)" data={quarterly} cols={QUARTERS} colsFull={quarterColsFull} />
          <p className="text-[10px] text-muted-foreground/70 italic">
            Rendement pondéré par le temps, en dollars : apports et retraits n&apos;entrent pas dans la
            performance, seuls les cours et les frais la font varier. Euros et stablecoins détenus comptent
            dans la valeur.
          </p>
        </>
      )}
    </div>
  );
}
