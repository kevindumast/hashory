"use client";

import { useMemo, useState } from "react";
import { Reveal } from "@/components/motion";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";
import type { TransactionEntry } from "@/hooks/dashboard/useDashboardMetrics";
import { useFxRates } from "@/hooks/useFxRates";
import { computeRecap, recapYears, WEEKDAYS, type RecapOperation, type Verdict } from "@/lib/recap";
import { tradeFlows } from "@/lib/trade-flows";
import { accountName } from "@/lib/provider-names";
import { cn } from "@/lib/utils";
import { Metric, MetricGrid, Notice, SectionLabel } from "../performance/ui";

const usd = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
  maximumFractionDigits: 0,
});
const usdCents = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const signedUsd = (value: number) => `${value >= 0 ? "+" : "−"}${usd.format(Math.abs(value))}`;
const quantity = (value: number) =>
  value.toLocaleString("fr-FR", Math.abs(value) >= 1 ? { maximumFractionDigits: 4 } : { maximumSignificantDigits: 4 });
const dayLabel = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_NAMES = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** Opérations du tableau de bord, ramenées à ce qu'elles donnent et reçoivent. */
function toRecapOperations(transactions: TransactionEntry[]): RecapOperation[] {
  return transactions.map((tx): RecapOperation => {
    const account = accountName({ provider: tx.provider, displayName: tx.providerDisplayName });
    if (tx.type === "trade") {
      const flows = tradeFlows(tx);
      return {
        kind: "exchange",
        timestamp: tx.executedAt,
        account,
        given: flows.given,
        received: flows.received,
        fee: tx.fee && tx.feeAsset ? { asset: tx.feeAsset, quantity: tx.fee } : undefined,
      };
    }
    return {
      kind: tx.type,
      timestamp: tx.timestamp,
      account,
      asset: tx.baseAsset,
      quantity: tx.amount,
      fee: tx.fee ?? undefined,
    };
  });
}

export function RecapClient() {
  const { transactions, currentPrices, isLoading } = useDashboardData();
  const { rateAt } = useFxRates();

  const operations = useMemo(() => toRecapOperations(transactions), [transactions]);
  const years = useMemo(() => recapYears(operations), [operations]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const year = selectedYear ?? years[0] ?? new Date().getFullYear();

  const recap = useMemo(() => {
    const rateNow = rateAt(Date.now());
    return computeRecap(operations, year, {
      priceUsd: (asset) => currentPrices[asset] ?? null,
      usdPerEurAt: (timestamp) => {
        const point = rateAt(timestamp);
        return point && point.eurPerUsd > 0 ? 1 / point.eurPerUsd : null;
      },
      usdPerEurNow: rateNow && rateNow.eurPerUsd > 0 ? 1 / rateNow.eurPerUsd : null,
    });
  }, [operations, year, currentPrices, rateAt]);

  if (isLoading && transactions.length === 0) return <DashboardSkeleton />;

  const busiestMonth = recap.monthly.indexOf(Math.max(...recap.monthly));
  const peak = peakSlot(recap.heatmap);
  const sortedVerdicts = [...recap.verdicts.items].sort((a, b) => b.deltaUsd - a.deltaUsd);
  const best = sortedVerdicts.filter((v) => v.deltaUsd > 0).slice(0, 3);
  const worst = sortedVerdicts.filter((v) => v.deltaUsd < 0).reverse().slice(0, 3);

  return (
    <div className="space-y-10 p-4 sm:p-6 md:p-8">
      <header>
        <p className="eyebrow">Rétrospective</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <h1 className="title text-3xl text-foreground sm:text-4xl">
            Votre année <span className="text-violet">{year}</span> en crypto
          </h1>
          {years.length > 1 && (
            <div className="flex max-w-full overflow-x-auto rounded-full bg-surface p-0.5" role="group" aria-label="Année">
              {years.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setSelectedYear(entry)}
                  aria-pressed={entry === year}
                  className={cn(
                    "num shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] transition-colors",
                    entry === year ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {entry}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {recap.operationCount === 0 ? (
        <Notice>Aucune opération en {year}. Connectez ou synchronisez un compte pour composer votre rétrospective.</Notice>
      ) : (
        <>
          {/* ─── 01 · L'essentiel ─── */}
          <section className="space-y-4">
            <Reveal>
              <SectionLabel index="01">L&apos;essentiel</SectionLabel>
            </Reveal>
            <Reveal delay={60}>
              <MetricGrid>
                <Metric
                  large
                  label="Opérations"
                  value={recap.operationCount.toLocaleString("fr-FR")}
                  hint={`${recap.exchangeCount} échanges, ${recap.depositCount} entrées, ${recap.withdrawalCount} sorties.`}
                />
                <Metric
                  large
                  label="Jours actifs"
                  value={recap.activeDays.toLocaleString("fr-FR")}
                  hint={
                    recap.longestPauseDays !== null && recap.longestPauseDays > 0
                      ? `Plus longue pause : ${recap.longestPauseDays} jours sans rien toucher.`
                      : "Pas une journée de pause entre deux opérations."
                  }
                />
                <Metric
                  label="Argent placé"
                  value={usd.format(recap.investedUsd)}
                  hint={
                    recap.cashedOutUsd > 0
                      ? `${usd.format(recap.cashedOutUsd)} récupérés en vendant.`
                      : "Rien récupéré en monnaie cette année."
                  }
                />
                <Metric
                  label="Frais payés"
                  value={usdCents.format(recap.fees.totalUsd)}
                  hint={
                    recap.fees.cryptoUsd > 0
                      ? `Dont ${usdCents.format(recap.fees.cryptoUsd)} payés en crypto, au cours d'aujourd'hui.`
                      : "Plateformes et réseaux confondus."
                  }
                />
              </MetricGrid>
            </Reveal>
          </section>

          {/* ─── 02 · Vos habitudes ─── */}
          <section className="space-y-4">
            <Reveal>
              <SectionLabel index="02">Vos habitudes</SectionLabel>
            </Reveal>

            {recap.profiles.length > 0 && (
              <Reveal delay={40}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {recap.profiles.slice(0, 3).map((profile) => (
                    <div key={profile.id} className="float-card px-5 py-4">
                      <p className="eyebrow text-jade">{profile.title}</p>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{profile.description}</p>
                    </div>
                  ))}
                </div>
              </Reveal>
            )}

            <Reveal delay={80}>
              <div className="float-card space-y-5 px-5 py-5">
                <p className="text-sm text-muted-foreground">
                  Votre créneau favori : le <span className="font-bold text-foreground">{WEEKDAYS[peak.weekday]}</span>{" "}
                  vers <span className="num font-bold text-foreground">{peak.hour} h</span>. Mois le plus chargé :{" "}
                  <span className="font-bold text-foreground">{MONTH_NAMES[busiestMonth]}</span>
                  {recap.busiestDay && recap.busiestDay.count > 1 && (
                    <>
                      , et une journée record le{" "}
                      <span className="font-bold text-foreground">{dayLabel(recap.busiestDay.timestamp)}</span> avec{" "}
                      <span className="num font-bold text-foreground">{recap.busiestDay.count}</span> opérations
                    </>
                  )}
                  .
                </p>
                <Heatmap grid={recap.heatmap} />
                <MonthBars monthly={recap.monthly} />
              </div>
            </Reveal>
          </section>

          {/* ─── 03 · Le verdict de vos ventes ─── */}
          <section className="space-y-4">
            <Reveal>
              <SectionLabel index="03">Le verdict de vos ventes</SectionLabel>
            </Reveal>
            <Reveal delay={40}>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Chaque crypto cédée, rejugée au cours d&apos;aujourd&apos;hui : ce que vaudrait ce que vous avez
                donné, face à ce que vaut ce que vous avez obtenu. Le marché tranche, pas le regret.
              </p>
            </Reveal>

            {recap.verdicts.items.length === 0 ? (
              <Notice>
                {recap.verdicts.unpricedCount > 0
                  ? `${recap.verdicts.unpricedCount} cession${recap.verdicts.unpricedCount > 1 ? "s" : ""} cette année, mais sans cours actuel pour les rejuger.`
                  : "Aucune crypto cédée cette année : rien à rejuger."}
              </Notice>
            ) : (
              <Reveal delay={80}>
                <div className="float-card overflow-hidden">
                  <div className="px-5 py-5">
                    <p className="eyebrow">Bilan de {recap.verdicts.items.length} cessions</p>
                    <p
                      className={cn(
                        "num mt-2 text-3xl font-bold tracking-[-0.03em]",
                        recap.verdicts.totalDeltaUsd >= 0 ? "text-positive" : "text-negative"
                      )}
                    >
                      {signedUsd(recap.verdicts.totalDeltaUsd)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {recap.verdicts.totalDeltaUsd >= 0
                        ? "Vos ventes ont eu raison : garder vous aurait coûté cette somme."
                        : "Garder vous aurait rapporté cette somme de plus, au cours d'aujourd'hui."}
                      {recap.verdicts.unpricedCount > 0 &&
                        ` ${recap.verdicts.unpricedCount} cession${recap.verdicts.unpricedCount > 1 ? "s" : ""} sans cours actuel ne sont pas comptées.`}
                    </p>
                  </div>
                  <div className="grid gap-px border-t border-line bg-line md:grid-cols-2">
                    <VerdictList title="Vos meilleures décisions" tone="positive" items={best} empty="Aucune vente n'a battu le marché." />
                    <VerdictList title="Vos regrets" tone="negative" items={worst} empty="Aucune vente regrettable." />
                  </div>
                </div>
              </Reveal>
            )}
          </section>

          {/* ─── 04 · Où sont partis vos frais ─── */}
          <section className="space-y-4">
            <Reveal>
              <SectionLabel index="04">Où sont partis vos frais</SectionLabel>
            </Reveal>
            <Reveal delay={60}>
              <div className="float-card overflow-hidden">
                {recap.fees.byAccount.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted-foreground">Aucun frais relevé cette année.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {recap.fees.byAccount.map((entry) => (
                      <li key={entry.account} className="px-5 py-3">
                        <div className="flex items-baseline justify-between gap-4">
                          <span className="text-sm font-bold text-foreground">{entry.account}</span>
                          <span className="num text-sm text-muted-foreground">{usdCents.format(entry.usd)}</span>
                        </div>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface" aria-hidden>
                          <div
                            className="h-full rounded-full bg-violet"
                            style={{ width: `${recap.fees.totalUsd > 0 ? (entry.usd / recap.fees.totalUsd) * 100 : 0}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {recap.fees.totalUsd > 0 && recap.investedUsd > 0 && (
                  <p className="border-t border-line px-5 py-3 text-xs text-muted-foreground">
                    Soit{" "}
                    <span className="num text-foreground">
                      {((recap.fees.totalUsd / recap.investedUsd) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %
                    </span>{" "}
                    de l&apos;argent placé dans l&apos;année.
                    {recap.fees.unpricedCount > 0 && ` ${recap.fees.unpricedCount} frais sans cours ne sont pas chiffrés.`}
                  </p>
                )}
              </div>
            </Reveal>
          </section>

          {/* ─── 05 · Découvertes ─── */}
          <section className="space-y-4">
            <Reveal>
              <SectionLabel index="05">Découvertes et favoris</SectionLabel>
            </Reveal>
            <Reveal delay={60}>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="float-card px-5 py-4">
                  <p className="eyebrow">Nouvelles venues</p>
                  {recap.discoveries.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">Aucune crypto nouvelle : vous êtes resté en terrain connu.</p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {recap.discoveries.map((asset) => (
                        <span key={asset} className="chip chip-violet text-xs font-bold">{asset}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="float-card px-5 py-4">
                  <p className="eyebrow">Les plus échangées</p>
                  <ol className="mt-3 space-y-1.5">
                    {recap.topAssets.map((entry, index) => (
                      <li key={entry.asset} className="flex items-baseline justify-between text-sm">
                        <span className="text-foreground">
                          <span className="num mr-2 text-faint">{index + 1}</span>
                          <span className="font-bold">{entry.asset}</span>
                        </span>
                        <span className="num text-muted-foreground">{entry.count} op.</span>
                      </li>
                    ))}
                  </ol>
                  {recap.largestPurchase && (
                    <p className="mt-4 border-t border-line pt-3 text-xs text-muted-foreground">
                      Plus gros achat : <span className="num text-foreground">{usd.format(recap.largestPurchase.usd)}</span> de{" "}
                      {recap.largestPurchase.asset} sur {recap.largestPurchase.account}, le {dayLabel(recap.largestPurchase.timestamp)}.
                    </p>
                  )}
                </div>
              </div>
            </Reveal>
          </section>
        </>
      )}
    </div>
  );
}

function peakSlot(grid: number[][]): { weekday: number; hour: number } {
  let best = { weekday: 0, hour: 0, count: -1 };
  grid.forEach((row, weekday) =>
    row.forEach((count, hour) => {
      if (count > best.count) best = { weekday, hour, count };
    })
  );
  return best;
}

const HEAT_DAYS = ["L", "M", "M", "J", "V", "S", "D"];

/** Carte de chaleur jour × heure : quand vous ouvrez vos applications. */
function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[520px] max-w-3xl gap-[3px]"
        style={{ gridTemplateColumns: "16px repeat(24, minmax(0, 1fr))" }}
        role="img"
        aria-label="Répartition de vos opérations par jour de la semaine et par heure"
      >
        {grid.map((row, weekday) => (
          <div key={weekday} className="contents">
            <span className="num self-center text-[10px] text-faint">{HEAT_DAYS[weekday]}</span>
            {row.map((count, hour) => (
              <span
                key={hour}
                title={`${WEEKDAYS[weekday]} ${hour} h : ${count} opération${count > 1 ? "s" : ""}`}
                className="h-4 rounded-[3px] bg-surface sm:h-5"
                style={
                  count > 0
                    ? { backgroundColor: `color-mix(in srgb, var(--violet) ${Math.round(20 + (count / max) * 80)}%, transparent)` }
                    : undefined
                }
              />
            ))}
          </div>
        ))}
        <span />
        {Array.from({ length: 24 }, (_, hour) => (
          <span key={hour} className="num text-center text-[9px] text-faint">
            {hour % 6 === 0 ? `${hour} h` : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function MonthBars({ monthly }: { monthly: number[] }) {
  const max = Math.max(1, ...monthly);
  return (
    <div className="flex max-w-3xl items-end gap-1.5" role="img" aria-label="Opérations par mois">
      {monthly.map((count, month) => (
        <div key={month} className="flex flex-1 flex-col items-center gap-1" title={`${MONTH_NAMES[month]} : ${count}`}>
          <div className="flex h-16 w-full items-end">
            <div
              className={cn("w-full rounded-t-[3px]", count > 0 ? "bg-violet/70" : "bg-surface")}
              style={{ height: `${Math.max(4, (count / max) * 100)}%` }}
            />
          </div>
          <span className="num text-[10px] text-faint">{MONTHS[month]}</span>
        </div>
      ))}
    </div>
  );
}

function VerdictList({
  title,
  tone,
  items,
  empty,
}: {
  title: string;
  tone: "positive" | "negative";
  items: Verdict[];
  empty: string;
}) {
  return (
    <div className="bg-card px-5 py-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {items.map((item) => (
            <li key={`${item.timestamp}-${item.given.asset}`} className="flex items-baseline justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">
                  <span className="num">{quantity(item.given.quantity)}</span> <span className="font-bold">{item.given.asset}</span>
                  <span className="text-faint"> → </span>
                  <span className="num">{quantity(item.received.quantity)}</span> <span className="font-bold">{item.received.asset}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {dayLabel(item.timestamp)} · {item.account}
                </p>
              </div>
              <span className={cn("num shrink-0 text-sm font-bold", tone === "positive" ? "text-positive" : "text-negative")}>
                {signedUsd(item.deltaUsd)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
