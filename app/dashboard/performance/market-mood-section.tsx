"use client";

import { useMemo } from "react";
import {
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Reveal } from "@/components/motion";
import { useMarketMood } from "@/hooks/dashboard/useMarketMood";
import {
  FEAR_GREED_ZONES,
  readTiming,
  zoneLabel,
  zoneOf,
  type FearGreedZone,
  type SideTiming,
  type TimingProfile,
} from "@/lib/fear-greed";
import { Metric, MetricGrid, Notice, SectionLabel } from "./ui";

/**
 * Teinte de chaque zone : froide côté peur, chaude côté avidité, rien au
 * neutre. Le vert et le rouge restent aux achats et aux ventes.
 */
const ZONE_TINT: Record<FearGreedZone, { color: string; strength: number }> = {
  "extreme-fear": { color: "var(--chart-3)", strength: 0.18 },
  fear: { color: "var(--chart-3)", strength: 0.08 },
  neutral: { color: "transparent", strength: 0 },
  greed: { color: "var(--chart-4)", strength: 0.08 },
  "extreme-greed": { color: "var(--chart-4)", strength: 0.18 },
};

/** Teinte pleine, pour la barre de répartition. */
const ZONE_SOLID: Record<FearGreedZone, string> = {
  "extreme-fear": "color-mix(in srgb, var(--chart-3) 85%, transparent)",
  fear: "color-mix(in srgb, var(--chart-3) 45%, transparent)",
  neutral: "var(--line)",
  greed: "color-mix(in srgb, var(--chart-4) 45%, transparent)",
  "extreme-greed": "color-mix(in srgb, var(--chart-4) 85%, transparent)",
};

const usd = (value: number) =>
  value.toLocaleString("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const share = (value: number) => `${Math.round(value * 100)} %`;

const indexLabel = (value: number | null) => (value === null ? "—" : Math.round(value).toString());

const dayLabel = (dayUtc: number) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(dayUtc)
  );

/** Phrase de lecture : ce que disent les achats, puis les ventes. */
function verdict(profile: TimingProfile): string | null {
  const market = profile.marketAverage;
  if (market === null) return null;
  const gap = (side: SideTiming) => Math.abs(Math.round((side.averageIndex ?? market) - market));
  const points = (value: number) => `${value} point${value > 1 ? "s" : ""}`;

  const sentences: string[] = [];
  switch (readTiming("buy", profile.buys, market)) {
    case "against-the-crowd":
      sentences.push(
        `Vous achetez plutôt quand le marché a peur : ${points(gap(profile.buys))} sous son humeur moyenne de la période.`
      );
      break;
    case "with-the-crowd":
      sentences.push(
        `Vous achetez plutôt dans l'enthousiasme : ${points(gap(profile.buys))} au-dessus de l'humeur moyenne de la période.`
      );
      break;
    case "in-line":
      sentences.push("Vos achats suivent l'humeur moyenne du marché, sans biais marqué.");
      break;
  }
  switch (readTiming("sell", profile.sells, market)) {
    case "against-the-crowd":
      sentences.push("Vos ventes tombent plutôt dans l'euphorie, ce qui revient à encaisser quand les autres achètent.");
      break;
    case "with-the-crowd":
      sentences.push("Vos ventes tombent plutôt dans la peur, ce qui revient à céder quand les autres vendent.");
      break;
  }
  return sentences.length > 0 ? sentences.join(" ") : null;
}

/** Répartition des montants par zone, en une barre. */
function ZoneBar({ label, timing }: { label: string; timing: SideTiming }) {
  return (
    <div className="space-y-2 px-5 py-4">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">{label}</span>
        <span className="num text-xs text-muted-foreground">
          {usd(timing.totalUsd)} · {timing.days} jour{timing.days > 1 ? "s" : ""}
        </span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface">
        {FEAR_GREED_ZONES.map((zone) =>
          timing.shareByZone[zone.id] > 0 ? (
            <div
              key={zone.id}
              style={{ width: `${timing.shareByZone[zone.id] * 100}%`, background: ZONE_SOLID[zone.id] }}
              title={`${zone.label} : ${share(timing.shareByZone[zone.id])}`}
            />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {FEAR_GREED_ZONES.filter((zone) => timing.shareByZone[zone.id] > 0).map((zone) => (
          <span key={zone.id} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: ZONE_SOLID[zone.id] }} />
            {zone.label} <span className="num text-foreground">{share(timing.shareByZone[zone.id])}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function MarketMoodSection({ range }: { range: { fromDay: number; toDay: number } }) {
  const mood = useMarketMood(range);

  const { buys, sells, decisionByDay } = useMemo(() => {
    const buyPoints = mood.decisions
      .filter((day) => day.boughtUsd > 0)
      .map((day) => ({ dayUtc: day.dayUtc, value: day.value, amountUsd: day.boughtUsd }));
    const sellPoints = mood.decisions
      .filter((day) => day.soldUsd > 0)
      .map((day) => ({ dayUtc: day.dayUtc, value: day.value, amountUsd: day.soldUsd }));
    return {
      buys: buyPoints,
      sells: sellPoints,
      decisionByDay: new Map(mood.decisions.map((day) => [day.dayUtc, day])),
    };
  }, [mood.decisions]);

  const valueByDay = useMemo(
    () => new Map(mood.index.map((point) => [point.dayUtc, point.value])),
    [mood.index]
  );

  const profile = mood.profile;
  const reading = profile ? verdict(profile) : null;
  const fearShare = profile ? profile.buys.shareByZone["extreme-fear"] + profile.buys.shareByZone.fear : 0;
  const greedShare = profile
    ? profile.buys.shareByZone.greed + profile.buys.shareByZone["extreme-greed"]
    : 0;

  return (
    <section className="space-y-4">
      <Reveal>
        <SectionLabel index="03">Humeur du marché</SectionLabel>
      </Reveal>

      <Reveal delay={60}>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          L&apos;indice Fear &amp; Greed résume l&apos;humeur du marché crypto, de 0 (peur
          extrême) à 100 (avidité extrême). Seul, il ne dit rien de vous. Confronté à vos achats
          et à vos ventes, il montre si vous suivez la foule ou si vous allez contre elle.
        </p>
      </Reveal>

      <Reveal delay={120}>
        {mood.isLoading ? (
          <Notice>Chargement de l&apos;indice…</Notice>
        ) : mood.index.length === 0 ? (
          <Notice>
            L&apos;historique de l&apos;indice n&apos;est pas encore disponible sur cette période.
            Il est collecté chaque nuit.
          </Notice>
        ) : (
          <div className="space-y-4">
            {profile && profile.buys.totalUsd > 0 && (
              <MetricGrid>
                <Metric
                  large
                  label="Vos achats"
                  value={indexLabel(profile.buys.averageIndex)}
                  hint={
                    profile.buys.averageIndex === null
                      ? undefined
                      : `${zoneLabel(zoneOf(profile.buys.averageIndex))}, indice moyen pondéré par les montants.`
                  }
                />
                <Metric
                  large
                  label="Le marché"
                  value={indexLabel(profile.marketAverage)}
                  hint="Humeur moyenne sur la même période : la référence."
                />
                <Metric
                  label="Achats en zone de peur"
                  value={share(fearShare)}
                  hint={`Contre ${share(greedShare)} en zone d'avidité.`}
                />
                <Metric
                  label="Vos ventes"
                  value={indexLabel(profile.sells.averageIndex)}
                  hint={
                    profile.sells.averageIndex === null
                      ? "Aucune vente contre monnaie sur la période."
                      : `${zoneLabel(zoneOf(profile.sells.averageIndex))}, indice moyen pondéré.`
                  }
                />
              </MetricGrid>
            )}

            {reading && <Notice>{reading}</Notice>}

            {!mood.hasFlows ? (
              <Notice>
                Vos achats et ventes seront placés sur l&apos;indice au prochain recalcul du
                portefeuille.
              </Notice>
            ) : profile && profile.buys.totalUsd === 0 && profile.sells.totalUsd === 0 ? (
              <Notice>
                Aucun achat ni vente contre monnaie sur cette période. Les échanges entre cryptos
                ne sont pas comptés : ils ne changent pas votre exposition au marché.
              </Notice>
            ) : null}

            <div className="float-card p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">
                  Indice Fear &amp; Greed · vos décisions
                </p>
                <div className="flex items-center gap-4 text-[11px] text-muted-foreground" aria-hidden>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-positive" /> Achat
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-negative" /> Vente
                  </span>
                </div>
              </div>
              <ChartContainer
                config={{ value: { label: "Indice", color: "var(--muted-foreground)" } }}
                className="h-[220px] w-full sm:h-[280px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={mood.index} margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
                    {FEAR_GREED_ZONES.map((zone, position) => {
                      const tint = ZONE_TINT[zone.id];
                      const upper = FEAR_GREED_ZONES[position + 1]?.min ?? 100;
                      return (
                        <ReferenceArea
                          key={zone.id}
                          y1={zone.min}
                          y2={upper}
                          fill={tint.color}
                          fillOpacity={tint.strength}
                          strokeOpacity={0}
                          ifOverflow="hidden"
                        />
                      );
                    })}
                    <XAxis
                      dataKey="dayUtc"
                      type="number"
                      scale="time"
                      domain={[range.fromDay, range.toDay]}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={48}
                      tick={{ fontSize: 10, className: "num" }}
                      tickFormatter={(value: number) =>
                        new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" }).format(
                          new Date(value)
                        )
                      }
                    />
                    <YAxis
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                      tickLine={false}
                      axisLine={false}
                      width={28}
                      tick={{ fontSize: 10, className: "num" }}
                    />
                    {/* Une seule échelle de taille : un gros achat se voit gros. */}
                    <ZAxis dataKey="amountUsd" range={[18, 220]} />
                    <ChartTooltip
                      cursor={{ stroke: "var(--border)" }}
                      content={({ active, label }) => {
                        if (!active || label === undefined) return null;
                        const dayUtc = Number(label);
                        const value = valueByDay.get(dayUtc);
                        const decision = decisionByDay.get(dayUtc);
                        if (value === undefined) return null;
                        return (
                          <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm">
                            <p className="text-muted-foreground">{dayLabel(dayUtc)}</p>
                            <p className="num mt-1 font-semibold text-foreground">
                              {value} · {zoneLabel(zoneOf(value))}
                            </p>
                            {decision && decision.boughtUsd > 0 && (
                              <p className="num mt-1 text-positive">Achat {usd(decision.boughtUsd)}</p>
                            )}
                            {decision && decision.soldUsd > 0 && (
                              <p className="num mt-1 text-negative">Vente {usd(decision.soldUsd)}</p>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="var(--muted-foreground)"
                      strokeOpacity={0.7}
                      strokeWidth={1.25}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Scatter
                      data={buys}
                      dataKey="value"
                      fill="var(--positive)"
                      fillOpacity={0.75}
                      isAnimationActive={false}
                    />
                    <Scatter
                      data={sells}
                      dataKey="value"
                      fill="var(--negative)"
                      fillOpacity={0.75}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>

            {profile && (profile.buys.totalUsd > 0 || profile.sells.totalUsd > 0) && (
              <div className="float-card divide-y divide-line overflow-hidden">
                {profile.buys.totalUsd > 0 && <ZoneBar label="Achats par zone" timing={profile.buys} />}
                {profile.sells.totalUsd > 0 && <ZoneBar label="Ventes par zone" timing={profile.sells} />}
              </div>
            )}

            <p className="text-[11px] text-faint">
              Source : alternative.me, une valeur par jour depuis février 2018. Seuls les échanges
              entre monnaie (ou stablecoin) et actif sont comptés.
              {profile && profile.uncoveredDays > 0
                ? ` ${profile.uncoveredDays} jour${profile.uncoveredDays > 1 ? "s" : ""} d'opération sans valeur d'indice ne sont pas pris en compte.`
                : ""}
            </p>
          </div>
        )}
      </Reveal>
    </section>
  );
}
