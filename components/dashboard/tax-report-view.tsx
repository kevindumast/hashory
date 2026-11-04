"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeftRight, CheckCircle2, Copy, Download, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useActiveQuery } from "@/hooks/usePageActivity";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { Metric, MetricGrid, Notice, SectionLabel } from "@/app/dashboard/performance/ui";
import { TaxSimulator } from "@/components/dashboard/tax-simulator";
import { ForeignAccounts } from "@/components/dashboard/foreign-accounts";
import { YearEndOptimizer } from "@/components/dashboard/year-end-optimizer";
import { FlaggedFlows, ServiceSwaps } from "@/components/dashboard/flagged-flows";
import { cn } from "@/lib/utils";
import type { TaxableEvent, TaxReportResult } from "@/convex/taxReport";
import { taxSheet } from "@/lib/export";
import { useDownloadCsv } from "@/components/dashboard/export-preferences";
import { useRecomputeTrigger } from "@/hooks/usePortfolioSnapshots";

const usd = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
/** Devise de la déclaration : au centime, comme sur le formulaire. */
const eur = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const qty = new Intl.NumberFormat("fr-FR", { maximumSignificantDigits: 6 });
const pct = new Intl.NumberFormat("fr-FR", { style: "percent", minimumFractionDigits: 1 });

type Report = TaxReportResult["reports"][number];

const money = (amountEur: number | null, amountUsd: number) =>
  amountEur !== null ? eur.format(amountEur) : usd.format(amountUsd);

/** Montant tel qu'on le tape dans le formulaire : euros entiers, sans séparateur. */
const formValue = (amount: number) => String(Math.round(Math.abs(amount)));

async function copyAmount(label: string, amount: number) {
  try {
    await navigator.clipboard.writeText(formValue(amount));
    toast.success(`${label} copié : ${formValue(amount)}`);
  } catch {
    toast.error("Copie impossible dans ce navigateur.");
  }
}

// ─── Sections ─────────────────────────────────────────────────────────────

/** Année sans cession imposable : le dire clairement, et ce qui reste dû. */
function NothingToDeclare({ year, tradeCount, onlyStablecoins }: { year: number; tradeCount: number; onlyStablecoins: boolean }) {
  return (
    <div className="float-card px-5 py-6 sm:px-6">
      <p className="eyebrow text-jade">Aucun impôt sur les plus-values</p>
      <p className="title mt-3 text-2xl text-foreground sm:text-3xl">Aucune cession imposable en {year}.</p>
      <div className="mt-3 max-w-2xl space-y-2 text-sm leading-relaxed text-muted-foreground">
        {tradeCount > 0 ? (
          <p>
            <span className="num font-bold text-foreground">{tradeCount}</span> opération{tradeCount > 1 ? "s" : ""} cette
            année, mais aucune vente contre une monnaie légale.{" "}
            {onlyStablecoins
              ? "Vos échanges sont des conversions entre cryptos et stablecoins (ex : BTC → USDT), non imposables depuis la loi de finances 2019."
              : "Les échanges entre cryptos, stablecoins compris, ne sont pas imposables."}
          </p>
        ) : (
          <p>Aucune opération importée pour {year}. Connectez vos plateformes pour établir la déclaration.</p>
        )}
        <p>
          Seule une vente contre euros, dollars ou une autre monnaie (ex : BTC → EUR) est une cession imposable. Le
          formulaire 2086 n&apos;est alors pas à remplir, mais{" "}
          <Link href="#comptes-etranger" className="font-bold text-foreground underline underline-offset-4">
            vos comptes à l&apos;étranger
          </Link>{" "}
          restent à déclarer.
        </p>
      </div>
    </div>
  );
}

function ResultMetrics({ report }: { report: Report }) {
  const net = report.netGainLossEur ?? report.netGainLossUsd;
  const tax = report.estimatedTaxEur ?? report.estimatedTaxUsd;
  return (
    <MetricGrid>
      <Metric
        large
        label="Prix de cession"
        value={money(report.totalProceedsEur, report.totalProceedsUsd)}
        hint={`${report.events.length} cession${report.events.length > 1 ? "s" : ""} imposable${report.events.length > 1 ? "s" : ""}`}
      />
      <Metric
        large
        label={net >= 0 ? "Plus-value nette" : "Moins-value nette"}
        value={`${net >= 0 ? "+" : ""}${money(report.netGainLossEur, report.netGainLossUsd)}`}
        tone={net > 0 ? "positive" : net < 0 ? "negative" : "neutral"}
        hint={report.totalProceedsUsd > 0 ? `${pct.format(report.netGainLossUsd / report.totalProceedsUsd)} du prix de cession` : undefined}
      />
      <Metric label="Prix d'acquisition imputé" value={eur.format(report.totalCostBasisEur)} hint="Méthode proportionnelle" />
      <Metric
        label="Impôt estimé"
        value={report.isBelowThreshold ? "0 €" : money(report.estimatedTaxEur, report.estimatedTaxUsd)}
        tone={!report.isBelowThreshold && tax > 0 ? "negative" : "neutral"}
        hint={report.isBelowThreshold ? "Exonéré : cessions sous 305 €" : "PFU 30 % : 12,8 % d'impôt, 17,2 % de prélèvements"}
      />
    </MetricGrid>
  );
}

/** Lignes du formulaire, dans l'ordre où on les remplit. */
function FormLines({ report }: { report: Report }) {
  const net = report.netGainLossEur ?? report.netGainLossUsd;
  const lines = [
    { code: "2086 · l. 213", label: "Prix de cession", amount: report.totalProceedsEur ?? report.totalProceedsUsd },
    { code: "2086 · l. 214", label: "Frais de cession", amount: report.totalFeesEur },
    { code: "Calculé", label: "Prix d'acquisition imputé aux cessions", amount: report.totalCostBasisEur },
    {
      code: net >= 0 ? "2042 C · 3AN" : "2042 C · 3BN",
      label: net >= 0 ? "Plus-value nette à reporter" : "Moins-value nette à reporter",
      amount: net,
      highlight: true,
    },
  ];
  return (
    <div className="float-card overflow-hidden">
      <ul className="divide-y divide-line">
        {lines.map((line) => (
          <li key={line.code} className={cn("flex items-center gap-4 px-5 py-3.5", line.highlight && "bg-surface")}>
            <span className="chip num w-28 shrink-0 justify-center text-[10px] font-bold">{line.code}</span>
            <span className={cn("min-w-0 flex-1 text-sm", line.highlight ? "font-bold text-foreground" : "text-muted-foreground")}>
              {line.label}
            </span>
            <span
              className={cn(
                "num shrink-0 text-sm font-bold",
                line.highlight ? (net >= 0 ? "text-positive" : "text-negative") : "text-foreground"
              )}
            >
              {eur.format(Math.abs(line.amount))}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void copyAmount(line.label, line.amount)}
              aria-label={`Copier ${line.label}`}
              title="Copier le montant à saisir"
              className="size-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
            >
              <Copy className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-5 py-3 text-xs text-muted-foreground">
        Le 2086 se remplit cession par cession ; les montants ci-dessus en sont les cumuls. Le bouton copie le montant en
        euros entiers, tel qu&apos;il se saisit en ligne.
      </p>
    </div>
  );
}

function EventsTable({ events }: { events: TaxableEvent[] }) {
  return (
    <div className="float-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              {[
                ["Date", "left"],
                ["Actif", "left"],
                ["Quantité", "right"],
                ["Prix de cession", "right"],
                ["Valeur du portefeuille", "right"],
                ["Acquisition imputée", "right"],
                ["Résultat", "right"],
              ].map(([label, align]) => (
                <th
                  key={label}
                  scope="col"
                  className={cn(
                    "whitespace-nowrap px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground",
                    align === "right" && "text-right"
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((e, i) => {
              const gain = e.gainLossEur ?? e.gainLossUsd;
              return (
                <tr key={i} className="border-b border-line transition-colors last:border-b-0 hover:bg-surface">
                  <td className="num whitespace-nowrap px-4 py-3 text-[13px] text-foreground">
                    {new Date(e.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-bold text-foreground">{e.asset}</span>
                    <span className="block text-[11px] capitalize text-muted-foreground">{e.source}</span>
                  </td>
                  <td className="num px-4 py-3 text-right text-[13px] text-muted-foreground">{qty.format(e.quantity)}</td>
                  <td className="num px-4 py-3 text-right text-[13px] text-foreground">
                    {money(e.proceedsEur, e.proceedsUsd)}
                    {e.feesEur > 0 && (
                      <span className="block text-[11px] text-muted-foreground">dont {eur.format(e.feesEur)} de frais</span>
                    )}
                  </td>
                  <td className="num px-4 py-3 text-right text-[13px] text-muted-foreground">{eur.format(e.portfolioValueEur)}</td>
                  <td className="num px-4 py-3 text-right text-[13px] text-muted-foreground">{money(e.costBasisEur, e.costBasisUsd)}</td>
                  <td className={cn("num px-4 py-3 text-right text-[13px] font-bold", gain >= 0 ? "text-positive" : "text-negative")}>
                    {gain >= 0 ? "+" : ""}
                    {money(e.gainLossEur, e.gainLossUsd)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Ce qui fonde le calcul, et ce qui pourrait le fausser. */
type Check = {
  ok: boolean;
  title: string;
  okText: string;
  warnText: string;
  detail?: ReactNode;
  /** Détail à garder même une fois tout pointé, pour revoir les pointages. */
  alwaysDetail?: boolean;
};

function Reliability({ result }: { result: TaxReportResult }) {
  const checks: Check[] = [
    {
      ok: !result.hasIncompleteValuation,
      title: "Cours historiques",
      okText: "Chaque cession est valorisée au cours du marché de son jour.",
      warnText:
        "Certaines cessions ont été valorisées en partie au prix de revient, faute de cours à leur date : la plus-value est un plancher. Resynchronisez les prix avant de déclarer.",
    },
    {
      ok: !result.hasMissingFxRates,
      title: "Taux de change",
      okText: "Montants convertis en euros au taux BCE du jour de chaque cession.",
      warnText: "Aucun taux de change en base : les montants restent en dollars alors que la déclaration se fait en euros.",
    },
    {
      ok: result.unknownCostInflows.count === 0,
      title: "Origine des jetons",
      okText:
        (result.unknownCostInflows.justifiedCount ?? 0) > 0
          ? "Toutes les entrées sans prix d'achat connu sont pointées."
          : "Tous les jetons détenus ont un prix d'acquisition connu.",
      alwaysDetail: (result.unknownCostInflows.justifiedCount ?? 0) > 0,
      warnText: `${result.unknownCostInflows.count} entrée${result.unknownCostInflows.count > 1 ? "s" : ""} de jetons (environ ${eur.format(result.unknownCostInflows.valueEur)}) sans prix d'acquisition connu : il est compté nul, ce qui peut majorer l'impôt. Connectez la plateforme d'origine, ou pointez chaque entrée (achat ailleurs, airdrop, transfert) avec son justificatif.`,
      detail: (
        <FlaggedFlows
          items={result.unknownCostInflows.items}
          total={result.unknownCostInflows.count}
          justified={result.unknownCostInflows.justifiedCount ?? 0}
          counterparts={result.untrackedOutflows.items}
          direction="in"
        />
      ),
    },
    {
      ok: result.untrackedOutflows.count === 0,
      title: "Sorties suivies",
      okText:
        (result.untrackedOutflows.justifiedCount ?? 0) > 0
          ? "Tous les envois vers un compte non suivi sont pointés."
          : "Aucun envoi vers un compte que Hashory ne suit pas.",
      alwaysDetail: (result.untrackedOutflows.justifiedCount ?? 0) > 0,
      warnText: `${result.untrackedOutflows.count} envoi${result.untrackedOutflows.count > 1 ? "s" : ""} (environ ${eur.format(result.untrackedOutflows.valueEur)}) vers un compte non suivi : une vente réalisée là-bas n'apparaît pas ici.`,
      detail: (
        <FlaggedFlows
          items={result.untrackedOutflows.items}
          total={result.untrackedOutflows.count}
          justified={result.untrackedOutflows.justifiedCount ?? 0}
          counterparts={result.unknownCostInflows.items}
          direction="out"
        />
      ),
    },
  ];
  const issues = checks.filter((check) => !check.ok).length;
  const swaps = result.serviceSwaps ?? [];

  return (
    <div className="float-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <p className="text-sm text-foreground">
          {issues === 0 ? (
            <span className="font-bold text-jade">Calcul complet : rien à signaler.</span>
          ) : (
            <>
              <span className="num font-bold">{issues}</span> point{issues > 1 ? "s" : ""} à vérifier avant de déclarer
            </>
          )}
        </p>
        <span className={cn("chip num text-[11px] font-bold", issues === 0 ? "chip-jade" : "bg-chart-4/10 text-chart-4")}>
          {checks.length - issues}/{checks.length}
        </span>
      </div>
      <ul className="divide-y divide-line">
        {checks.map((check) => (
          <li key={check.title} className="flex items-start gap-3 px-5 py-3.5">
            {check.ok ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-jade" aria-label="Vérifié" />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-chart-4" aria-label="À vérifier" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">{check.title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{check.ok ? check.okText : check.warnText}</p>
              {(!check.ok || check.alwaysDetail) && check.detail}
            </div>
          </li>
        ))}
        {swaps.length > 0 && (
          <li className="flex items-start gap-3 px-5 py-3.5">
            <ArrowLeftRight className="mt-0.5 size-4 shrink-0 text-violet" aria-label="Information" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">Échanges via un service tiers</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {swaps.length} envoi{swaps.length > 1 ? "s" : ""} suivi{swaps.length > 1 ? "s" : ""} de la réception d&apos;un
                autre actif dans les deux heures, pour une valeur voisine : un swap ou un pont, donc un échange crypto
                contre crypto, non imposable et rien à déclarer. Le prix d&apos;acquisition a suivi les jetons. Gardez les deux
                hash comme justificatif.
              </p>
              <ServiceSwaps swaps={swaps} />
            </div>
          </li>
        )}
      </ul>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export function TaxReportView() {
  const downloadCsv = useDownloadCsv();
  const result = useActiveQuery(api.taxReport.computeTaxReport) as TaxReportResult | undefined;
  // Le rapport est enregistré par le recalcul : on le relance à l'ouverture,
  // pour qu'une synchronisation récente soit prise en compte.
  useRecomputeTrigger();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const availableYears = useMemo(() => {
    if (!result) return [currentYear];
    const years = [...result.availableYears];
    if (!years.includes(currentYear)) years.push(currentYear);
    return years.sort((a, b) => b - a);
  }, [result, currentYear]);

  // Par défaut, l'année d'activité la plus récente.
  const effectiveYear = selectedYear ?? result?.availableYears[0] ?? currentYear;
  const report = useMemo(
    () => result?.reports.find((r) => r.year === effectiveYear) ?? null,
    [result, effectiveYear]
  );

  if (result === undefined) return <DashboardSkeleton />;

  const tradeCount = result.tradeCountByYear[effectiveYear] ?? 0;
  // Numérotation continue, quelles que soient les sections affichées.
  let section = 0;
  const next = () => String(++section).padStart(2, "0");

  return (
    <div className="space-y-12 p-4 sm:p-6 md:p-8">
      <header>
        <p className="eyebrow">Fiscalité · art. 150 VH bis du CGI</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <h1 className="title text-3xl text-foreground sm:text-4xl">
            Vos plus-values <span className="text-violet">{effectiveYear}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {availableYears.length > 1 && (
              <div className="flex max-w-full overflow-x-auto rounded-full bg-surface p-0.5" role="group" aria-label="Année fiscale">
                {availableYears.map((year) => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => setSelectedYear(year)}
                    aria-pressed={effectiveYear === year}
                    className={cn(
                      "num shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] transition-colors",
                      effectiveYear === year ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {year}
                  </button>
                ))}
              </div>
            )}
            <Button variant="outline" asChild className="rounded-full">
              <Link href="/dashboard/audit">
                <ShieldCheck />
                Dossier de contrôle
              </Link>
            </Button>
            {report && (
              <Button variant="outline" onClick={() => downloadCsv(taxSheet(report.year, report.events))} className="rounded-full">
                <Download />
                Exporter
              </Button>
            )}
          </div>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Plus-values sur actifs numériques réalisées en {effectiveYear}, à déclarer au printemps {effectiveYear + 1} :
          formulaire 2086 pour le détail, case 3AN ou 3BN de la 2042 C pour le résultat.
        </p>
      </header>

      {/* ─── Résultat ─── */}
      <section className="space-y-4">
        <Reveal>
          <SectionLabel index={next()}>Le résultat</SectionLabel>
        </Reveal>
        <Reveal delay={60}>
          {report ? (
            <div className="space-y-3">
              <ResultMetrics report={report} />
              {report.isBelowThreshold && (
                <Notice>
                  <span className="font-bold text-chart-4">Sous le seuil de 305 €</span> — vos cessions (
                  {money(report.totalProceedsEur, report.totalProceedsUsd)}) sont exonérées d&apos;impôt, mais restent à
                  déclarer.
                </Notice>
              )}
            </div>
          ) : (
            <NothingToDeclare year={effectiveYear} tradeCount={tradeCount} onlyStablecoins={result.hasOnlyStablecoinTrades} />
          )}
        </Reveal>
      </section>

      {report && (
        <>
          <section className="space-y-4">
            <Reveal>
              <SectionLabel index={next()}>Ce qu&apos;il faut reporter</SectionLabel>
            </Reveal>
            <Reveal delay={60}>
              <FormLines report={report} />
            </Reveal>
          </section>

          <section className="space-y-4">
            <Reveal>
              <SectionLabel index={next()}>Le détail des cessions</SectionLabel>
            </Reveal>
            <Reveal delay={60}>
              <EventsTable events={report.events} />
            </Reveal>
          </section>
        </>
      )}

      <section className="space-y-4">
        <Reveal>
          <SectionLabel index={next()}>Fiabilité du calcul</SectionLabel>
        </Reveal>
        <Reveal delay={60}>
          <Reliability result={result} />
        </Reveal>
      </section>

      <YearEndOptimizer index={next()} result={result} />

      <TaxSimulator index={next()} />

      <ForeignAccounts index={next()} />

      <p className="max-w-3xl border-t border-line pt-6 text-[11px] leading-relaxed text-faint">
        Méthode : le prix total d&apos;acquisition est réparti sur chaque cession au prorata de la valeur globale du
        portefeuille, établie au cours du marché du jour de la cession et convertie en euros au taux BCE de ce même jour.
        Les échanges entre cryptos, stablecoins compris, ne sont pas imposables. Estimation indicative : faites vérifier
        les montants avant de déclarer.
      </p>
    </div>
  );
}
