"use client";

import { Fragment, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, Copy } from "lucide-react";
import { toast } from "sonner";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";
import { accountName } from "@/lib/provider-names";
import { cn } from "@/lib/utils";
import type { FlaggedFlow, ServiceSwap } from "@/convex/taxReport";

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const qty = new Intl.NumberFormat("fr-FR", { maximumSignificantDigits: 6 });
const dateLabel = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

const REASON: Record<NonNullable<FlaggedFlow["reason"]> | "outflow", { label: string; hint: string }> = {
  "untracked-deposit": {
    label: "Dépôt",
    hint: "Reçu d'un compte que Hashory ne suit pas : connectez-le pour retrouver le prix d'achat.",
  },
  "missing-history": {
    label: "Vendu sans achat connu",
    hint: "Le compte a cédé plus qu'il ne détenait : son historique commence sans doute trop tard.",
  },
  outflow: {
    label: "Envoi",
    hint: "Parti vers une adresse ou un compte non suivi : connectez-le s'il est à vous.",
  },
};

/** En deçà, une opération ne pèse pas sur l'impôt : on la range à part. */
const NEGLIGIBLE_EUR = 1;
const isSmall = (item: FlaggedFlow) => item.valueEur !== null && item.valueEur < NEGLIGIBLE_EUR;

const shortTx =(txId: string) => (txId.length > 16 ? `${txId.slice(0, 8)}…${txId.slice(-6)}` : txId);

async function copyTx(txId: string) {
  try {
    await navigator.clipboard.writeText(txId);
    toast.success("Identifiant de transaction copié");
  } catch {
    toast.error("Copie impossible dans ce navigateur.");
  }
}

/**
 * Le détail d'un avertissement fiscal : les opérations concernées, regroupées
 * d'abord par compte (c'est le compte qu'il faut connecter), puis une à une.
 */
export function FlaggedFlows({
  items,
  total,
  direction,
}: {
  /** Absent d'un rapport enregistré avant l'ajout du détail. */
  items: FlaggedFlow[] | undefined;
  /** Nombre total d'opérations, la liste pouvant être tronquée. */
  total: number;
  direction: "in" | "out";
}) {
  const { integrations } = useDashboardData();
  const [open, setOpen] = useState(false);

  const names = useMemo(
    () => new Map(integrations.map((integration) => [String(integration._id), accountName(integration)])),
    [integrations]
  );
  const nameOf = (account: string) => names.get(account) ?? "Compte supprimé";

  const byAccount = useMemo(() => {
    const groups = new Map<string, { count: number; valueEur: number }>();
    for (const item of items ?? []) {
      const group = groups.get(item.account) ?? { count: 0, valueEur: 0 };
      group.count += 1;
      group.valueEur += item.valueEur ?? 0;
      groups.set(item.account, group);
    }
    return [...groups.entries()].sort(([, a], [, b]) => b.valueEur - a.valueEur || b.count - a.count);
  }, [items]);

  if (items === undefined) {
    // Rapport enregistré avant l'ajout du détail : le prochain recalcul le complète.
    return <p className="mt-1.5 text-[11px] text-faint">Le détail s&apos;affichera après la prochaine mise à jour du portefeuille.</p>;
  }
  if (items.length === 0) return null;
  const noun = direction === "in" ? "entrée" : "envoi";

  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap gap-1.5">
        {byAccount.map(([account, group]) => (
          <span key={account} className="chip bg-surface text-[11px] text-foreground">
            <span className="font-bold">{nameOf(account)}</span>
            <span className="num font-normal text-muted-foreground">
              {group.count} · {eur.format(group.valueEur)}
            </span>
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-violet hover:underline"
      >
        {open ? "Masquer le détail" : `Voir ${total > 1 ? `les ${total} ${noun}s` : `l'${noun}`}`}
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-2 overflow-hidden rounded-xl border border-line">
          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {items.map((item, i) => {
              const reason = REASON[direction === "out" ? "outflow" : item.reason ?? "untracked-deposit"];
              // Triés par valeur : les petits montants viennent en bloc, à la fin.
              const firstSmall = isSmall(item) && (i === 0 || !isSmall(items[i - 1]));
              return (
                <Fragment key={i}>
                {firstSmall && (
                  <li className="bg-surface px-3.5 py-2 text-[11px] text-muted-foreground">
                    Moins de 1 € : poussière, récompenses en sats, jetons promotionnels. Sans effet notable sur l&apos;impôt.
                  </li>
                )}
                <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[13px] text-foreground">
                      <span className="font-bold">
                        {direction === "out" ? "−" : "+"}
                        <span className="num">{qty.format(item.quantity)}</span> {item.asset}
                      </span>
                      <span className="text-muted-foreground"> · {nameOf(item.account)}</span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      <span className="num">{dateLabel(item.date)}</span>
                      <span title={reason.hint} className="chip bg-chart-4/10 px-1.5 py-0 text-[10px] text-chart-4">
                        {reason.label}
                      </span>
                      {item.txId && (
                        <button
                          type="button"
                          onClick={() => copyTx(item.txId!)}
                          title={`Copier ${item.txId}`}
                          className="inline-flex items-center gap-1 font-mono hover:text-foreground"
                        >
                          {shortTx(item.txId)}
                          <Copy className="size-3" />
                        </button>
                      )}
                    </p>
                  </div>
                  <span className="num shrink-0 text-[13px] font-bold text-foreground">
                    {item.valueEur !== null ? eur.format(item.valueEur) : "cours inconnu"}
                  </span>
                </li>
                </Fragment>
              );
            })}
          </ul>
          {total > items.length && (
            <p className="border-t border-line bg-surface px-3.5 py-2 text-[11px] text-muted-foreground">
              Les {items.length} plus importantes sur {total}.
            </p>
          )}
          <p className="border-t border-line bg-surface px-3.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
            {direction === "in"
              ? "Si ces jetons viennent d'une autre plateforme ou d'un wallet à vous, connectez-le : leur prix d'achat sera repris. Pour un airdrop reçu sans contrepartie, le coût nul est en général le bon."
              : "Si l'adresse est à vous, connectez-la : le transfert devient interne. Sinon, un paiement en crypto est une cession à déclarer."}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Échanges via un service tiers que le calcul a reconnus : l'envoi et la
 * réception, avec leurs hash, ce qu'il faut garder comme justificatif.
 */
export function ServiceSwaps({ swaps }: { swaps: ServiceSwap[] }) {
  const { integrations } = useDashboardData();
  const [open, setOpen] = useState(false);
  const names = useMemo(
    () => new Map(integrations.map((integration) => [String(integration._id), accountName(integration)])),
    [integrations]
  );
  const nameOf = (account: string) => names.get(account) ?? "Compte supprimé";

  const side = (flow: ServiceSwap["given"], sign: "−" | "+") => (
    <span className="min-w-0">
      <span className="font-bold text-foreground">
        {sign}
        <span className="num">{qty.format(flow.quantity)}</span> {flow.asset}
      </span>
      <span className="text-muted-foreground"> · {nameOf(flow.account)}</span>
      {flow.txId && (
        <button
          type="button"
          onClick={() => copyTx(flow.txId!)}
          title={`Copier ${flow.txId}`}
          className="ml-1.5 inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
        >
          {shortTx(flow.txId)}
          <Copy className="size-3" />
        </button>
      )}
    </span>
  );

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs font-bold text-violet hover:underline"
      >
        {open ? "Masquer" : swaps.length > 1 ? `Voir les ${swaps.length} échanges` : "Voir l'échange"}
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {swaps.map((swap, i) => (
            <li key={i} className="px-3.5 py-2.5 text-[13px]">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {side(swap.given, "−")}
                <ArrowRight className="size-3.5 shrink-0 text-faint" aria-label="échangé contre" />
                {side(swap.received, "+")}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                <span className="num">{dateLabel(swap.date)}</span> · envoyé{" "}
                <span className="num">{eur.format(swap.givenEur)}</span>, reçu{" "}
                <span className="num">{eur.format(swap.receivedEur)}</span>
                {swap.implied && (
                  <>
                    {" "}· prix de {swap.implied.side === "received" ? swap.received.asset : swap.given.asset} déduit de
                    l&apos;échange : <span className="num">{eur.format(swap.implied.priceEur)}</span>
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
