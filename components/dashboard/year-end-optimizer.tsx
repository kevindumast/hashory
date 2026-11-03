"use client";

import { useMemo } from "react";
import { Reveal } from "@/components/motion";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";
import { Notice, SectionLabel } from "@/app/dashboard/performance/ui";
import { useFxRates } from "@/hooks/useFxRates";
import type { TaxReportResult } from "@/convex/taxReport";
import { daysLeftInYear, yearEndLevers, type Lever } from "@/lib/tax-optimizer";

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/**
 * Leviers de fin d'année : ce que l'on peut encore faire avant le
 * 31 décembre pour l'impôt de l'année en cours.
 */
export function YearEndOptimizer({ index, result }: { index: string; result: TaxReportResult }) {
  const { portfolioTokens, currentPrices } = useDashboardData();
  const { rateAt } = useFxRates();
  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();

  const levers = useMemo(() => {
    const eurPerUsd = rateAt(now.getTime())?.eurPerUsd ?? null;
    if (!eurPerUsd) return null;
    const valueUsd = portfolioTokens.reduce(
      (sum, token) => sum + token.currentQuantity * (currentPrices[token.symbol] ?? 0),
      0
    );
    const current = result.reports.find((entry) => entry.year === year);
    return yearEndLevers({
      yearProceedsEur: current?.totalProceedsEur ?? (current ? current.totalProceedsUsd * eurPerUsd : 0),
      yearGainEur: current?.netGainLossEur ?? (current ? current.netGainLossUsd * eurPerUsd : 0),
      portfolioValueEur: valueUsd * eurPerUsd,
      acquisitionCostEur: result.currentAcquisitionCostEur,
      now,
    });
  }, [portfolioTokens, currentPrices, rateAt, result, year, now]);

  if (levers === null) return null;
  const daysLeft = daysLeftInYear(now);

  return (
    <section className="space-y-4">
      <Reveal>
        <SectionLabel index={index}>Optimiser {year}</SectionLabel>
      </Reveal>
      <Reveal delay={40}>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Ce que vous pouvez encore faire pour l&apos;impôt de {year} : il reste{" "}
          <span className="num font-bold text-foreground">{daysLeft}</span> jour{daysLeft > 1 ? "s" : ""} avant le
          31 décembre.
        </p>
      </Reveal>
      {levers.length === 0 ? (
        <Notice>Aucun levier utile pour l&apos;instant : rien ne change l&apos;impôt de {year} d&apos;ici la fin de l&apos;année.</Notice>
      ) : (
        <Reveal delay={80}>
          <div className="grid gap-3 lg:grid-cols-3">
            {levers.map((lever) => (
              <LeverCard key={lever.kind} lever={lever} year={year} />
            ))}
          </div>
        </Reveal>
      )}
    </section>
  );
}

function LeverCard({ lever, year }: { lever: Lever; year: number }) {
  if (lever.kind === "threshold") {
    return (
      <div className="float-card flex flex-col gap-2 px-5 py-5">
        <p className="eyebrow text-jade">Seuil de 305 €</p>
        <p className="title text-xl text-foreground">
          Encore <span className="num">{eur.format(lever.remainingEur)}</span> de ventes exonérées
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Tant que le total de vos ventes contre monnaie en {year} ne dépasse pas 305 €, aucun impôt n&apos;est dû.
          Au-delà, c&apos;est l&apos;ensemble qui devient imposable, pas seulement l&apos;excédent.
        </p>
      </div>
    );
  }

  if (lever.kind === "offset") {
    return (
      <div className="float-card flex flex-col gap-2 px-5 py-5">
        <p className="eyebrow text-jade">Compenser la plus-value</p>
        <p className="title text-xl text-foreground">
          <span className="num">{eur.format(lever.taxSavedEur)}</span> d&apos;impôt évitable
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Votre portefeuille est en moins-value latente. Vendre{" "}
          <span className="num font-bold text-foreground">{eur.format(lever.saleEur)}</span> avant le 31 décembre
          réaliserait <span className="num text-foreground">{eur.format(lever.lossEur)}</span> de moins-value,
          imputée sur la plus-value de l&apos;année
          {lever.partial ? " — même une vente totale ne l'efface pas entièrement" : ", qui serait effacée"}.
        </p>
        <p className="text-xs leading-relaxed text-faint">
          Une moins-value ne se reporte pas sur l&apos;année suivante. Racheter aussitôt les mêmes jetons peut être
          contesté par l&apos;administration.
        </p>
      </div>
    );
  }

  return (
    <div className="float-card flex flex-col gap-2 px-5 py-5">
      <p className="eyebrow text-violet">Attendre janvier</p>
      <p className="title text-xl text-foreground">Un an de plus pour payer</p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Chaque euro vendu aujourd&apos;hui contient{" "}
        <span className="num font-bold text-foreground">
          {Math.round(lever.taxablePerEuro * 100)} centime{Math.round(lever.taxablePerEuro * 100) > 1 ? "s" : ""}
        </span>{" "}
        de plus-value imposable. Une vente prévue peut attendre le 1er janvier : l&apos;impôt se déclarera alors au
        printemps {year + 2}, pas {year + 1}.
      </p>
    </div>
  );
}
