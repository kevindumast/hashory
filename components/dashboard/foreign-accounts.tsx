"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Reveal } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";
import { SectionLabel } from "@/app/dashboard/performance/ui";
import { useFxRates } from "@/hooks/useFxRates";
import {
  FINE_PER_ACCOUNT_EUR,
  declarationPeriod,
  foreignAccounts,
  openingDate,
  type ForeignAccountRow,
} from "@/lib/foreign-accounts";
import { accountName } from "@/lib/provider-names";
import { foreignAccountsSheet } from "@/lib/export";
import { useDownloadCsv } from "@/components/dashboard/export-preferences";
import { Download } from "lucide-react";
import { errorMessage } from "@/lib/toast";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const dateLabel = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

const STATUS: Record<ForeignAccountRow["status"], { label: string; className: string }> = {
  declare: { label: "À déclarer", className: "bg-negative/10 text-negative" },
  verify: { label: "À vérifier", className: "bg-chart-4/10 text-chart-4" },
  upcoming: { label: "Pas encore", className: "bg-surface text-muted-foreground" },
  closed: { label: "Clôturé", className: "bg-surface text-muted-foreground" },
  exempt: { label: "Non concerné", className: "bg-surface text-muted-foreground" },
};

const storageKey = (filingYear: number) => `hashory:3916-bis:${filingYear}`;

function readChecked(filingYear: number): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey(filingYear));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** « 2025-03-14 » ↔ minuit local, ce qu'attend un champ de date. */
const toInputDate = (timestamp: number) => {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fromInputDate = (value: string) => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
};

/**
 * Comptes à reporter sur le formulaire 3916-bis, avec ce qu'il faut pour le
 * remplir : entité, pays, dates d'ouverture et de clôture. La clôture est
 * enregistrée sur le compte ; la case « Déclaré » n'est qu'un aide-mémoire,
 * retenu dans ce navigateur.
 */
export function ForeignAccounts({ index }: { index: string }) {
  const { integrations, transactions, portfolioTokens, currentPrices } = useDashboardData();
  const { rateAt } = useFxRates();
  const { incomeYear, filingYear } = declarationPeriod();
  const downloadCsv = useDownloadCsv();
  const [checked, setChecked] = useState<string[]>([]);

  useEffect(() => {
    setChecked(readChecked(filingYear));
  }, [filingYear]);

  const rows = useMemo(() => {
    const eurPerUsd = rateAt(Date.now())?.eurPerUsd ?? null;

    const firstActivity = new Map<string, number>();
    for (const tx of transactions) {
      const at = tx.type === "trade" ? tx.executedAt : tx.timestamp;
      const id = String(tx.integrationId);
      const current = firstActivity.get(id);
      if (current === undefined || at < current) firstActivity.set(id, at);
    }

    const valueUsd = new Map<string, number>();
    for (const token of portfolioTokens) {
      const price = currentPrices[token.symbol];
      if (price === undefined) continue;
      for (const source of token.quantityBySource) {
        valueUsd.set(source.integrationId, (valueUsd.get(source.integrationId) ?? 0) + source.quantity * price);
      }
    }

    return foreignAccounts(
      integrations.map((integration) => {
        const id = String(integration._id);
        const usd = valueUsd.get(id);
        return {
          provider: integration.provider,
          name: accountName(integration),
          ids: [id],
          openedAt: integration.accountCreatedAt ?? null,
          firstActivityAt: firstActivity.get(id) ?? null,
          closedAt: integration.closedAt ?? null,
          valueEur: usd !== undefined && eurPerUsd ? usd * eurPerUsd : null,
        };
      }),
      incomeYear
    );
  }, [integrations, transactions, portfolioTokens, currentPrices, rateAt, incomeYear]);

  if (rows.length === 0) return null;

  const concerned = rows.filter((row) => row.status === "declare" || row.status === "verify");
  const later = rows.filter((row) => row.status === "closed" || row.status === "upcoming");
  const exempt = rows.filter((row) => row.status === "exempt");
  const pending = concerned.filter((row) => !checked.includes(row.provider));
  const maxFine = pending.reduce((sum, row) => sum + (row.fineEur ?? 0), 0);
  const pendingDeclare = pending.filter((row) => row.status === "declare").length;
  const pendingVerify = pending.length - pendingDeclare;

  const toggle = (provider: string, value: boolean) => {
    setChecked((current) => {
      const next = value ? [...new Set([...current, provider])] : current.filter((p) => p !== provider);
      try {
        window.localStorage.setItem(storageKey(filingYear), JSON.stringify(next));
      } catch {
        // Stockage indisponible : la case vaut pour la session.
      }
      return next;
    });
  };

  return (
    <section id="comptes-etranger" className="scroll-mt-24 space-y-4">
      <Reveal>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel index={index}>Comptes à l&apos;étranger</SectionLabel>
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv(
                foreignAccountsSheet(
                  filingYear,
                  rows.map((row) => ({ ...row, openedAt: openingDate(row) }))
                )
              )
            }
            className="rounded-full"
          >
            <Download />
            Exporter la liste
          </Button>
        </div>
      </Reveal>

      <Reveal delay={40}>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Indépendamment de l&apos;impôt, chaque compte ouvert chez une plateforme établie hors de France se
          déclare sur le formulaire <span className="font-bold text-foreground">3916-bis</span>, même inactif ou
          vide. L&apos;oubli coûte <span className="num text-foreground">{eur.format(FINE_PER_ACCOUNT_EUR)}</span>{" "}
          par compte. Liste établie pour la déclaration {filingYear}, sur les revenus {incomeYear}.
        </p>
      </Reveal>

      {concerned.length > 0 ? (
        <Reveal delay={80}>
          <div className="float-card overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line px-5 py-4">
              <p className="text-sm text-foreground">
                {pending.length === 0 ? (
                  <span className="font-bold text-jade">Tous vos comptes sont cochés pour {filingYear}.</span>
                ) : (
                  <>
                    <span className="num font-bold">{pendingDeclare}</span> compte{pendingDeclare > 1 ? "s" : ""} à
                    déclarer
                    {pendingVerify > 0 && (
                      <>
                        , <span className="num font-bold">{pendingVerify}</span> à vérifier
                      </>
                    )}
                  </>
                )}
              </p>
              {pending.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Amende encourue en cas d&apos;oubli : jusqu&apos;à{" "}
                  <span className="num text-negative">{eur.format(maxFine)}</span>
                </p>
              )}
            </div>
            <ul className="divide-y divide-line">
              {concerned.map((row) => (
                <AccountRow
                  key={row.provider}
                  row={row}
                  declared={checked.includes(row.provider)}
                  onToggle={(value) => toggle(row.provider, value)}
                />
              ))}
            </ul>
          </div>
        </Reveal>
      ) : (
        <Reveal delay={80}>
          <p className="rounded-2xl bg-surface px-4 py-3 text-sm text-muted-foreground">
            Aucun compte à reporter pour la déclaration {filingYear}.
          </p>
        </Reveal>
      )}

      {later.length > 0 && (
        <Reveal delay={100}>
          <div className="float-card overflow-hidden">
            <p className="border-b border-line px-5 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-faint">
              Plus ou pas encore à déclarer
            </p>
            <ul className="divide-y divide-line">
              {later.map((row) => (
                <AccountRow key={row.provider} row={row} />
              ))}
            </ul>
          </div>
        </Reveal>
      )}

      {exempt.length > 0 && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-bold text-foreground">Non concernés :</span> {exempt.map((row) => row.name).join(", ")}{" "}
          — auto-garde ou prestataire établi en France.
        </p>
      )}

      <p className="text-[11px] leading-relaxed text-faint">
        Entités indicatives : celle qui tient votre compte dépend de sa date d&apos;ouverture et figure dans vos
        conditions d&apos;utilisation. Le formulaire demande aussi son adresse. Ce n&apos;est pas un conseil fiscal.
      </p>
    </section>
  );
}

function openingLabel(row: ForeignAccountRow): string {
  const opened = row.openedAt ?? null;
  const first = row.firstActivityAt ?? null;
  const best = openingDate(row);
  if (best === null) return "Date d'ouverture inconnue.";
  // Une date d'ouverture postérieure à la première opération n'en est pas une.
  if (opened !== null && (first === null || opened <= first)) return `Ouvert le ${dateLabel(opened)}.`;
  return `Ouvert au plus tard le ${dateLabel(best)}, date de la première opération connue.`;
}

function AccountRow({
  row,
  declared,
  onToggle,
}: {
  row: ForeignAccountRow;
  declared?: boolean;
  onToggle?: (value: boolean) => void;
}) {
  const id = `3916-${row.provider}`;
  return (
    <li className={cn("flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between", declared && "opacity-60")}>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-foreground">{row.name}</span>
          <span className={cn("chip text-[10px] font-bold uppercase tracking-[0.12em]", STATUS[row.status].className)}>
            {STATUS[row.status].label}
          </span>
        </div>
        {(row.entity || row.country) && (
          <p className="text-xs text-foreground">
            {row.entity}
            {row.entity && row.country && " · "}
            {row.country}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {openingLabel(row)} {row.note}
        </p>
        <ClosingDate row={row} />
      </div>
      {onToggle && (
        <label htmlFor={id} className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Checkbox id={id} checked={declared} onCheckedChange={(value) => onToggle(value === true)} />
          Déclaré
        </label>
      )}
    </li>
  );
}

/** Date de clôture : affichée, saisie ou retirée, pour toutes les connexions du compte. */
function ClosingDate({ row }: { row: ForeignAccountRow }) {
  const setClosedAt = useMutation(api.integrations.setClosedAt);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(row.closedAt ? toInputDate(row.closedAt) : "");
  const [saving, setSaving] = useState(false);
  const minDate = openingDate(row);

  const save = async (closedAt: number | null) => {
    setSaving(true);
    try {
      await Promise.all(
        row.ids.map((integrationId) => setClosedAt({ integrationId: integrationId as Id<"integrations">, closedAt }))
      );
      setEditing(false);
      toast.success(closedAt === null ? "Clôture retirée" : "Date de clôture enregistrée");
    } catch (error) {
      toast.error(errorMessage(error, "Impossible d'enregistrer la date."));
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <form
        className="flex flex-wrap items-center gap-2 pt-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (value) void save(fromInputDate(value));
        }}
      >
        <label htmlFor={`close-${row.provider}`} className="text-xs text-muted-foreground">
          Clôturé le
        </label>
        <input
          id={`close-${row.provider}`}
          type="date"
          value={value}
          min={minDate ? toInputDate(minDate) : undefined}
          max={toInputDate(Date.now())}
          onChange={(event) => setValue(event.target.value)}
          className="num h-8 rounded-full border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-primary"
        />
        <Button type="submit" size="sm" disabled={!value || saving} className="h-8 rounded-full px-3 text-xs">
          Enregistrer
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(false)}
          className="h-8 rounded-full px-3 text-xs text-muted-foreground"
        >
          Annuler
        </Button>
      </form>
    );
  }

  return (
    <p className="pt-1 text-xs">
      {row.closedAt ? (
        <>
          <span className="text-foreground">Clôturé le {dateLabel(row.closedAt)}.</span>{" "}
          <button type="button" onClick={() => setEditing(true)} className="cursor-pointer font-bold text-violet hover:underline">
            Modifier
          </button>
          <span className="text-faint"> · </span>
          <button
            type="button"
            onClick={() => void save(null)}
            disabled={saving}
            className="cursor-pointer text-muted-foreground hover:text-foreground hover:underline"
          >
            Retirer
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="cursor-pointer font-bold text-violet hover:underline">
          Compte clôturé ? Indiquer la date
        </button>
      )}
    </p>
  );
}
