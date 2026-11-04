"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDashed, Download, FileText, Stamp } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { useActiveQuery } from "@/hooks/usePageActivity";
import { useRecomputeTrigger } from "@/hooks/usePortfolioSnapshots";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { FlaggedFlows } from "@/components/dashboard/flagged-flows";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";
import { SectionLabel } from "@/app/dashboard/performance/ui";
import { accountName } from "@/lib/provider-names";
import { acquisitionsSheet, auditReadiness, cessionsSheet, flaggedSheet, type AuditCheck } from "@/lib/audit";
import type { Sheet } from "@/lib/export";
import { cn } from "@/lib/utils";
import type { TaxReportResult } from "@/convex/taxReport";

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eurCents = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const qty = new Intl.NumberFormat("fr-FR", { maximumSignificantDigits: 6 });
const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });

const METHOD = [
  ["Méthode de calcul", "Article 150 VH bis du CGI : prix total d'acquisition réparti au prorata de la valeur globale du portefeuille à chaque cession."],
  ["Devise", "Euros. Chaque opération est convertie au taux BCE de son jour."],
  ["Cours", "Clôture quotidienne (Binance, KuCoin, CoinGecko) ; à défaut, prix déduit d'un échange du même jour."],
  ["Échanges crypto contre crypto", "Non imposables (sursis d'imposition), stablecoins compris : swaps sur un DEX et via un service listés avec leur hash."],
  ["Jetons sans origine connue", "Comptés à coût nul par prudence, sauf pointage manuel avec justificatif."],
  ["Avertissement", "Estimation indicative établie par Hashory : faites vérifier les montants avant de déclarer."],
];

/** Classeur du dossier : une feuille par pièce, plus la méthode. */
async function downloadWorkbook(sheets: { name: string; sheet: Sheet }[]) {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Rubrique", "Détail"], ...METHOD]), "Méthode");
  for (const { name, sheet } of sheets) {
    const rows = sheet.rows.map((row) => row.map((cell) => (cell === undefined ? null : cell)));
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([sheet.columns, ...rows]), name);
  }
  XLSX.writeFile(book, `hashory-dossier-controle-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function StatusIcon({ status }: { status: AuditCheck["status"] }) {
  if (status === "ok") return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-jade" aria-label="Prêt" />;
  if (status === "warn") return <AlertTriangle className="mt-0.5 size-4 shrink-0 text-chart-4" aria-label="À compléter" />;
  return <CircleDashed className="mt-0.5 size-4 shrink-0 text-faint" aria-label="À faire" />;
}

/** Anneau de préparation : la part du dossier déjà justifiée. */
function ReadinessRing({ score }: { score: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const tone = score >= 0.9 ? "var(--jade)" : score >= 0.6 ? "var(--chart-4)" : "var(--negative)";
  return (
    <svg viewBox="0 0 100 100" className="size-28 shrink-0" role="img" aria-label={`Dossier prêt à ${pct.format(score)}`}>
      <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--line)" strokeWidth="8" />
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke={tone}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${circumference * score} ${circumference}`}
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="54" textAnchor="middle" className="num fill-foreground text-[20px] font-bold">
        {pct.format(score)}
      </text>
    </svg>
  );
}

export function AuditView() {
  const result = useActiveQuery(api.taxReport.computeTaxReport) as TaxReportResult | undefined;
  const { integrations } = useDashboardData();
  useRecomputeTrigger();
  const [showAllAcquisitions, setShowAllAcquisitions] = useState(false);

  const names = useMemo(
    () => new Map(integrations.map((integration) => [String(integration._id), accountName(integration)])),
    [integrations]
  );
  const nameOf = (account: string) => names.get(account) ?? "Compte supprimé";

  const readiness = useMemo(
    () =>
      result
        ? auditReadiness(result, {
            total: integrations.length,
            closed: integrations.filter((integration) => integration.closedAt).length,
          })
        : null,
    [result, integrations]
  );

  if (result === undefined || readiness === null) return <DashboardSkeleton />;

  const audit = result.audit;
  const acquisitions = audit?.acquisitions ?? [];
  const visibleAcquisitions = showAllAcquisitions ? acquisitions : acquisitions.slice(0, 12);
  const pointed = [
    ...(result.unknownCostInflows.items ?? []).filter((item) => item.justification).map((item) => ({ item, direction: "in" as const })),
    ...(result.untrackedOutflows.items ?? []).filter((item) => item.justification).map((item) => ({ item, direction: "out" as const })),
  ].sort((a, b) => b.item.date - a.item.date);
  const pending = result.unknownCostInflows.count + result.untrackedOutflows.count;

  async function exportDossier() {
    try {
      await downloadWorkbook([
        { name: "Cessions", sheet: cessionsSheet(result!, nameOf) },
        { name: "Acquisitions", sheet: acquisitionsSheet(result!, nameOf) },
        { name: "Pointages", sheet: flaggedSheet(result!, nameOf) },
      ]);
    } catch {
      toast.error("Export impossible dans ce navigateur.");
    }
  }

  let section = 0;
  const next = () => String(++section).padStart(2, "0");

  return (
    <div className="space-y-12 p-4 sm:p-6 md:p-8">
      <header>
        <p className="eyebrow">Contrôle fiscal · justificatifs</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <h1 className="title text-3xl text-foreground sm:text-4xl">
            Votre dossier de <span className="text-violet">contrôle</span>
          </h1>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild className="rounded-full">
              <Link href="/dashboard/tax-report">
                <FileText />
                Déclaration
              </Link>
            </Button>
            <Button onClick={() => void exportDossier()} className="rounded-full">
              <Download />
              Télécharger le dossier
            </Button>
          </div>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Ce qu&apos;un vérificateur vous demanderait de prouver : d&apos;où vient chaque jeton, où est parti chaque envoi,
          ce que vous avez payé. Pointez ce qui manque, notez où trouver le justificatif, et téléchargez le dossier
          complet — méthode, cessions, acquisitions et pointages.
        </p>
      </header>

      {/* ─── Préparation ─── */}
      <section className="space-y-4">
        <Reveal>
          <SectionLabel index={next()}>Où en est le dossier</SectionLabel>
        </Reveal>
        <Reveal delay={60}>
          <div className="float-card overflow-hidden">
            <div className="flex flex-col gap-5 border-b border-line px-5 py-5 sm:flex-row sm:items-center sm:px-6">
              <ReadinessRing score={readiness.score} />
              <div className="min-w-0">
                <p className="title text-2xl text-foreground">
                  {readiness.score >= 0.95
                    ? "Prêt à être présenté."
                    : pending > 0
                      ? `${pending} opération${pending > 1 ? "s" : ""} à justifier.`
                      : "Quelques points à compléter."}
                </p>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  {pending > 0 ? (
                    <>
                      Environ <span className="num font-bold text-foreground">{eur.format(readiness.pendingEur)}</span> de
                      mouvements sans explication. Chaque pointage, avec la référence de sa pièce, rapproche le dossier de ce
                      qu&apos;exigerait un contrôle.
                    </>
                  ) : (
                    "Chaque mouvement a une origine ou une destination connue. Gardez les pièces citées ci-dessous."
                  )}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  <span className="chip chip-jade">
                    <Stamp className="size-3" />
                    {pointed.length} pointage{pointed.length > 1 ? "s" : ""}
                  </span>
                  <span className="chip bg-surface text-foreground">
                    {audit?.internalTransfers ?? 0} transfert{(audit?.internalTransfers ?? 0) > 1 ? "s" : ""} interne
                    {(audit?.internalTransfers ?? 0) > 1 ? "s" : ""}
                  </span>
                  {(audit?.dexSwaps ?? []).map((row) => (
                    <span key={row.protocol} className="chip chip-violet">
                      {row.protocol === "Inconnu" ? "DEX non reconnu" : row.protocol} · {row.count}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <ul className="divide-y divide-line">
              {readiness.checks.map((check) => (
                <li key={check.id} className="grid gap-x-6 gap-y-1 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:px-6">
                  <div className="flex items-start gap-3">
                    <StatusIcon status={check.status} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground">{check.title}</p>
                      <p className="text-xs leading-relaxed text-muted-foreground">{check.detail}</p>
                    </div>
                  </div>
                  <p className="pl-7 text-xs leading-relaxed text-muted-foreground sm:pl-0">
                    <span className="font-bold text-foreground">Pièce à garder : </span>
                    {check.evidence}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </section>

      {/* ─── Reste à justifier ─── */}
      <section className="space-y-4">
        <Reveal>
          <SectionLabel index={next()}>Ce qui reste à justifier</SectionLabel>
        </Reveal>
        <Reveal delay={60}>
          <div className="float-card divide-y divide-line">
            <div className="px-5 py-4 sm:px-6">
              <p className="text-sm font-bold text-foreground">Entrées sans prix d&apos;acquisition connu</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {result.unknownCostInflows.count === 0
                  ? "Rien à justifier."
                  : `${result.unknownCostInflows.count} entrée${result.unknownCostInflows.count > 1 ? "s" : ""}, ${eurCents.format(result.unknownCostInflows.valueEur)} au cours du jour : comptées à coût nul tant qu'elles ne sont pas pointées.`}
              </p>
              <FlaggedFlows
                items={result.unknownCostInflows.items}
                total={result.unknownCostInflows.count}
                justified={result.unknownCostInflows.justifiedCount ?? 0}
                counterparts={result.untrackedOutflows.items}
                direction="in"
              />
            </div>
            <div className="px-5 py-4 sm:px-6">
              <p className="text-sm font-bold text-foreground">Envois vers un compte non suivi</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {result.untrackedOutflows.count === 0
                  ? "Rien à justifier."
                  : `${result.untrackedOutflows.count} envoi${result.untrackedOutflows.count > 1 ? "s" : ""}, ${eurCents.format(result.untrackedOutflows.valueEur)} : un contrôleur demandera s'il s'agit d'une vente ou d'un paiement.`}
              </p>
              <FlaggedFlows
                items={result.untrackedOutflows.items}
                total={result.untrackedOutflows.count}
                justified={result.untrackedOutflows.justifiedCount ?? 0}
                counterparts={result.unknownCostInflows.items}
                direction="out"
              />
            </div>
          </div>
        </Reveal>
      </section>

      {/* ─── Acquisitions ─── */}
      <section className="space-y-4">
        <Reveal>
          <SectionLabel index={next()}>Ce que vous avez payé</SectionLabel>
        </Reveal>
        <Reveal delay={60}>
          <div className="float-card overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4 sm:px-6">
              <p className="text-sm text-muted-foreground">
                Prix total d&apos;acquisition versé :{" "}
                <span className="num text-lg font-bold text-foreground">{eurCents.format(audit?.totalAcquiredEur ?? 0)}</span>
              </p>
              <p className="text-xs text-muted-foreground">Par mois, compte et actif : rapprochez chaque ligne d&apos;un relevé.</p>
            </div>
            {acquisitions.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground sm:px-6">
                {audit ? "Aucun achat contre monnaie dans l'historique." : "Le détail s'affichera après la prochaine mise à jour du portefeuille."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line">
                      {["Mois", "Compte", "Actif", "Achats", "Quantité", "Payé", "Origine"].map((label, index) => (
                        <th
                          key={label}
                          scope="col"
                          className={cn(
                            "whitespace-nowrap px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground",
                            index >= 3 && index <= 5 && "text-right"
                          )}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAcquisitions.map((row) => (
                      <tr key={`${row.month}-${row.account}-${row.asset}-${row.kind}`} className="border-b border-line last:border-b-0 hover:bg-surface">
                        <td className="num whitespace-nowrap px-4 py-2.5 text-[13px]">
                          {new Date(`${row.month}-01T00:00:00Z`).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}
                        </td>
                        <td className="px-4 py-2.5 text-[13px]">{nameOf(row.account)}</td>
                        <td className="px-4 py-2.5 text-[13px] font-bold">{row.asset}</td>
                        <td className="num px-4 py-2.5 text-right text-[13px] text-muted-foreground">{row.count}</td>
                        <td className="num px-4 py-2.5 text-right text-[13px] text-muted-foreground">{qty.format(row.quantity)}</td>
                        <td className="num px-4 py-2.5 text-right text-[13px] font-bold">{eurCents.format(row.costEur)}</td>
                        <td className="px-4 py-2.5">
                          <span className={cn("chip px-1.5 py-0 text-[10px]", row.kind === "fiat" ? "bg-surface text-foreground" : "chip-jade")}>
                            {row.kind === "fiat" ? "Achat" : "Pointage"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {acquisitions.length > 12 && (
              <button
                type="button"
                onClick={() => setShowAllAcquisitions((value) => !value)}
                className="w-full border-t border-line px-5 py-2.5 text-xs font-bold text-violet hover:bg-surface"
              >
                {showAllAcquisitions ? "Réduire" : `Voir les ${acquisitions.length} lignes`}
              </button>
            )}
          </div>
        </Reveal>
      </section>

      {/* ─── Journal ─── */}
      <section className="space-y-4">
        <Reveal>
          <SectionLabel index={next()}>Journal des pointages</SectionLabel>
        </Reveal>
        <Reveal delay={60}>
          <div className="float-card overflow-hidden">
            {pointed.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground sm:px-6">
                Aucun pointage pour l&apos;instant. Chaque opération pointée ci-dessus s&apos;inscrit ici, avec sa pièce.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {pointed.map(({ item, direction }) => (
                  <li key={`${direction}-${item.id}`} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-5 py-3 sm:px-6">
                    <div className="min-w-0">
                      <p className="text-[13px] text-foreground">
                        <span className="num font-bold">
                          {direction === "in" ? "+" : "−"}
                          {qty.format(item.quantity)} {item.asset}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {nameOf(item.account)} ·{" "}
                          {new Date(item.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {item.justification?.note ? `Justificatif : ${item.justification.note}` : "Aucune pièce notée : ajoutez-en une."}
                      </p>
                    </div>
                    {item.justification?.costEur !== undefined && (
                      <span className="num text-[13px] font-bold">{eurCents.format(item.justification.costEur)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Reveal>
      </section>

      <p className="max-w-3xl border-t border-line pt-6 text-[11px] leading-relaxed text-faint">
        Le dossier reprend les données de vos comptes connectés et vos pointages. En cas de contrôle, c&apos;est à vous
        d&apos;apporter les pièces : relevés des plateformes, virements bancaires, factures. Hashory ne les conserve pas à
        votre place. Estimation indicative : faites vérifier les montants avant de déclarer.
      </p>
    </div>
  );
}
