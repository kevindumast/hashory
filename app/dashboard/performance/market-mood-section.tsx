"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
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

/** Couleur de chaque zone, du rouge de la peur extrême au vert de l'avidité. */
const ZONE_COLOR: Record<FearGreedZone, string> = {
  "extreme-fear": "var(--fg-extreme-fear)",
  fear: "var(--fg-fear)",
  neutral: "var(--fg-neutral)",
  greed: "var(--fg-greed)",
  "extreme-greed": "var(--fg-extreme-greed)",
};

/** Seuls les extrêmes ont un fond : c'est là que l'indice dit quelque chose. */
const EXTREME_BANDS = [
  { id: "extreme-greed", y1: 76, y2: 100, label: "Avidité extrême", position: "insideTopRight" },
  { id: "extreme-fear", y1: 0, y2: 25, label: "Peur extrême", position: "insideBottomRight" },
] as const;

/**
 * Arrêts d'un dégradé vertical qui colore la courbe selon sa zone. Le
 * dégradé couvre la boîte de la courbe, du maximum au minimum atteints :
 * chaque seuil y est placé en proportion, avec deux arrêts au même point
 * pour une transition nette.
 */
function zoneStops(values: number[]): { offset: number; color: string }[] {
  if (values.length === 0) return [];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min;
  if (span === 0) return [{ offset: 0, color: ZONE_COLOR[zoneOf(max)] }];

  const stops: { offset: number; color: string }[] = [];
  // Du haut vers le bas : avidité extrême d'abord.
  for (const zone of [...FEAR_GREED_ZONES].reverse()) {
    const top = Math.min(zone.max + 1, max);
    const bottom = Math.max(zone.min, min);
    if (top < bottom) continue;
    stops.push({ offset: (max - top) / span, color: ZONE_COLOR[zone.id] });
    stops.push({ offset: (max - bottom) / span, color: ZONE_COLOR[zone.id] });
  }
  return stops;
}

const usd = (value: number) =>
  value.toLocaleString("fr-FR", { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 });

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
              style={{ width: `${timing.shareByZone[zone.id] * 100}%`, background: ZONE_COLOR[zone.id] }}
              title={`${zone.label} : ${share(timing.shareByZone[zone.id])}`}
            />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {FEAR_GREED_ZONES.filter((zone) => timing.shareByZone[zone.id] > 0).map((zone) => (
          <span key={zone.id} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: ZONE_COLOR[zone.id] }} />
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
  const stops = useMemo(() => zoneStops(mood.index.map((point) => point.value)), [mood.index]);

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
                    <span className="h-2 w-2 rounded-full bg-violet" /> Achat
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-foreground" /> Vente
                  </span>
                </div>
              </div>
              <ChartContainer
                config={{ value: { label: "Indice", color: "var(--muted-foreground)" } }}
                className="h-[220px] w-full sm:h-[280px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={mood.index} margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
                    <defs>
                      <linearGradient id="fear-greed-line" x1="0" y1="0" x2="0" y2="1">
                        {stops.map((stop, position) => (
                          <stop key={position} offset={stop.offset} stopColor={stop.color} />
                        ))}
                      </linearGradient>
                    </defs>
                    {EXTREME_BANDS.map((band) => (
                      <ReferenceArea
                        key={band.id}
                        y1={band.y1}
                        y2={band.y2}
                        fill={ZONE_COLOR[band.id]}
                        fillOpacity={0.1}
                        strokeOpacity={0}
                        ifOverflow="hidden"
                        label={{
                          value: band.label,
                          position: band.position,
                          fontSize: 10,
                          fill: "var(--muted-foreground)",
                        }}
                      />
                    ))}
                    <CartesianGrid
                      vertical={false}
                      stroke="var(--border)"
                      strokeOpacity={0.6}
                      strokeDasharray="2 3"
                    />
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
                            <p className="num mt-1 flex items-center gap-1.5 font-semibold text-foreground">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ background: ZONE_COLOR[zoneOf(value)] }}
                              />
                              {value} · {zoneLabel(zoneOf(value))}
                            </p>
                            {decision && decision.boughtUsd > 0 && (
                              <p className="num mt-1 text-violet">Achat {usd(decision.boughtUsd)}</p>
                            )}
                            {decision && decision.soldUsd > 0 && (
                              <p className="num mt-1 text-foreground">Vente {usd(decision.soldUsd)}</p>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="url(#fear-greed-line)"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Scatter
                      data={buys}
                      dataKey="value"
                      fill="var(--violet)"
                      fillOpacity={0.85}
                      stroke="var(--card)"
                      strokeWidth={1}
                      isAnimationActive={false}
                    />
                    <Scatter
                      data={sells}
                      dataKey="value"
                      fill="var(--foreground)"
                      fillOpacity={0.85}
                      stroke="var(--card)"
                      strokeWidth={1}
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
