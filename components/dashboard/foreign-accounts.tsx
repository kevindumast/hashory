"use client";

import { useEffect, useMemo, useState } from "react";
import { Reveal } from "@/components/motion";
import { Checkbox } from "@/components/ui/checkbox";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";
import { useFxRates } from "@/hooks/useFxRates";
import { FINE_PER_ACCOUNT_EUR, foreignAccounts, type ForeignAccountRow } from "@/lib/foreign-accounts";
import { accountName } from "@/lib/provider-names";
import { cn } from "@/lib/utils";

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const dateLabel = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

const STATUS_LABELS: Record<ForeignAccountRow["status"], string> = {
  declare: "À déclarer",
  verify: "À vérifier",
  exempt: "Non concerné",
};

const storageKey = (year: number) => `hashory:3916-bis:${year}`;

function readChecked(year: number): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey(year));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Comptes à reporter sur le formulaire 3916-bis, avec ce qu'il faut pour le
 * remplir : entité, pays, date d'ouverture. Une case par compte, retenue
 * dans ce navigateur, sert d'aide-mémoire le jour de la déclaration.
 */
export function ForeignAccounts() {
  const { integrations, transactions, portfolioTokens, currentPrices } = useDashboardData();
  const { rateAt } = useFxRates();
  // On déclare au printemps les comptes détenus l'année précédente.
  const declarationYear = new Date().getFullYear();
  const [checked, setChecked] = useState<string[]>([]);

  useEffect(() => {
    setChecked(readChecked(declarationYear));
  }, [declarationYear]);

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
          openedAt: integration.accountCreatedAt ?? null,
          firstActivityAt: firstActivity.get(id) ?? null,
          valueEur: usd !== undefined && eurPerUsd ? usd * eurPerUsd : null,
        };
      })
    );
  }, [integrations, transactions, portfolioTokens, currentPrices, rateAt]);

  if (rows.length === 0) return null;

  const toDeclare = rows.filter((row) => row.status !== "exempt");
  const exempt = rows.filter((row) => row.status === "exempt");
  const pending = toDeclare.filter((row) => !checked.includes(row.provider));
  const maxFine = pending.reduce((sum, row) => sum + (row.fineEur ?? 0), 0);
  const pendingDeclare = pending.filter((row) => row.status === "declare").length;
  const pendingVerify = pending.length - pendingDeclare;

  const toggle = (provider: string, value: boolean) => {
    setChecked((current) => {
      const next = value ? [...new Set([...current, provider])] : current.filter((p) => p !== provider);
      try {
        window.localStorage.setItem(storageKey(declarationYear), JSON.stringify(next));
      } catch {
        // Stockage indisponible : la case vaut pour la session.
      }
      return next;
    });
  };

  return (
    <section className="space-y-6">
      <Reveal>
        <div className="flex items-baseline gap-4 border-b border-border/60 pb-4">
          <span className="num text-xs text-primary">→</span>
          <span className="num text-xs uppercase tracking-[0.28em] text-muted-foreground">
            Comptes à l&apos;étranger · formulaire 3916-bis
          </span>
        </div>
      </Reveal>

      <Reveal delay={60}>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Indépendamment de l&apos;impôt, chaque compte ouvert chez une plateforme établie hors de France se
          déclare tous les ans avec vos revenus, même inactif ou vide. L&apos;oubli coûte{" "}
          <span className="num text-foreground">{eur.format(FINE_PER_ACCOUNT_EUR)}</span> par compte. Vos
          portefeuilles en auto-garde n&apos;y sont pas soumis.
        </p>
      </Reveal>

      {toDeclare.length > 0 && (
        <Reveal delay={90}>
          <div className="float-card overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line px-5 py-4">
              <p className="text-sm text-foreground">
                {pending.length === 0 ? (
                  <span className="font-bold text-jade">Tous vos comptes sont cochés pour {declarationYear}.</span>
                ) : (
                  <>
                    Déclaration {declarationYear} :{" "}
                    <span className="num font-bold">{pendingDeclare}</span> compte{pendingDeclare > 1 ? "s" : ""} à déclarer
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
              {toDeclare.map((row) => (
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
      )}

      {exempt.length > 0 && (
        <Reveal delay={120}>
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-bold text-foreground">Non concernés :</span>{" "}
            {exempt.map((row) => row.name).join(", ")} — auto-garde ou prestataire établi en France.
          </p>
        </Reveal>
      )}

      <p className="text-[11px] leading-relaxed text-faint">
        Entités indicatives : celle qui tient votre compte dépend de sa date d&apos;ouverture et figure dans vos
        conditions d&apos;utilisation. Le formulaire demande aussi l&apos;adresse de l&apos;entité et la date
        d&apos;ouverture, ou de clôture, du compte. Ce n&apos;est pas un conseil fiscal.
      </p>
    </section>
  );
}

/**
 * Date d'ouverture à reporter. Une date communiquée par la plateforme mais
 * postérieure à la première opération connue n'est pas l'ouverture du
 * compte : la première opération est alors la meilleure borne disponible.
 */
function openingLabel(row: ForeignAccountRow): string {
  const opened = row.openedAt ?? null;
  const first = row.firstActivityAt ?? null;
  if (opened !== null && (first === null || opened <= first)) return `Ouvert le ${dateLabel(opened)}.`;
  if (first !== null) return `Ouvert au plus tard le ${dateLabel(first)}, date de la première opération connue.`;
  return "Date d'ouverture inconnue.";
}

function AccountRow({
  row,
  declared,
  onToggle,
}: {
  row: ForeignAccountRow;
  declared: boolean;
  onToggle: (value: boolean) => void;
}) {
  const id = `3916-${row.provider}`;
  return (
    <li className={cn("flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between", declared && "opacity-60")}>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-foreground">{row.name}</span>
          <span
            className={cn(
              "chip text-[10px] font-bold uppercase tracking-[0.12em]",
              row.status === "declare" ? "bg-negative/10 text-negative" : "bg-chart-4/10 text-chart-4"
            )}
          >
            {STATUS_LABELS[row.status]}
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
      </div>
      <label htmlFor={id} className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <Checkbox id={id} checked={declared} onCheckedChange={(value) => onToggle(value === true)} />
        Déclaré
      </label>
    </li>
  );
}
