"use client";

import { Fragment, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, ChevronDown, Copy, ExternalLink, Search, Stamp } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { JustifyDialog } from "@/components/dashboard/justify-dialog";
import { useRequestRecompute } from "@/hooks/usePortfolioSnapshots";
import { categoryInfo } from "@/lib/justification";
import { addressExplorerUrl, shortAddress } from "@/lib/dex";
import { BLOCKCHAIN_NETWORKS, explorerUrl } from "@/lib/onchain";
import { toast } from "sonner";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";
import { accountName } from "@/lib/provider-names";
import { cn } from "@/lib/utils";
import type { FlaggedFlow, ServiceSwap } from "@/convex/taxReport";

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const qty = new Intl.NumberFormat("fr-FR", { maximumSignificantDigits: 6 });
const dateLabel = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

type Reason = { label: string; hint: string; tone: "warn" | "ok" };

const REASON: Record<NonNullable<FlaggedFlow["reason"]> | "outflow" | "gift" | "rounding", Reason> = {
  "untracked-deposit": {
    label: "Reçu, origine inconnue",
    hint: "Reçu d'un compte que Hashory ne suit pas : connectez-le pour retrouver le prix d'achat.",
    tone: "warn",
  },
  gift: {
    label: "Cadeau de la plateforme",
    hint: "Crédit offert par la plateforme (bonus, parrainage, récompense) : sans achat, son coût nul est le bon.",
    tone: "ok",
  },
  rounding: {
    label: "Écart d'arrondi",
    hint: "Quelques centimes d'écart entre l'historique et le solde (frais, arrondis de la plateforme) : sans effet sur l'impôt.",
    tone: "ok",
  },
  "missing-history": {
    label: "Vendu sans achat connu",
    hint: "Le compte a cédé plus qu'il ne détenait : son historique commence sans doute trop tard.",
    tone: "warn",
  },
  outflow: {
    label: "Envoi",
    hint: "Parti vers une adresse ou un compte non suivi : connectez-le s'il est à vous.",
    tone: "warn",
  },
};

/**
 * Plateformes qui ne reçoivent jamais de crypto de l'extérieur : un crédit en
 * crypto sans achat y est forcément un cadeau (Bitstack offre des sats).
 */
const GIFTING_PROVIDERS = new Set(["bitstack"]);

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
  counterparts = [],
  justified = 0,
}: {
  /** Absent d'un rapport enregistré avant l'ajout du détail. */
  items: FlaggedFlow[] | undefined;
  /** Nombre d'opérations restant à pointer, la liste pouvant être tronquée. */
  total: number;
  direction: "in" | "out";
  /** Opérations de sens contraire, pour rapprocher un transfert interne. */
  counterparts?: FlaggedFlow[];
  /** Opérations déjà pointées. */
  justified?: number;
}) {
  const { integrations } = useDashboardData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FlaggedFlow | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const names = useMemo(
    () => new Map(integrations.map((integration) => [String(integration._id), accountName(integration)])),
    [integrations]
  );
  const nameOf = (account: string) => names.get(account) ?? "Compte supprimé";
  const providers = useMemo(
    () => new Map(integrations.map((integration) => [String(integration._id), integration.provider.toLowerCase()])),
    [integrations]
  );
  const reasonOf = (item: FlaggedFlow): Reason => {
    if (direction === "out") return REASON.outflow;
    if (item.reason !== "missing-history" && GIFTING_PROVIDERS.has(providers.get(item.account) ?? "")) return REASON.gift;
    if (item.reason === "missing-history" && isSmall(item)) return REASON.rounding;
    return REASON[item.reason ?? "untracked-deposit"];
  };

  const byAccount = useMemo(() => {
    const groups = new Map<string, { count: number; valueEur: number }>();
    for (const item of (items ?? []).filter((entry) => !entry.justification)) {
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
  const listed = total + justified;

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
        {open ? "Masquer le détail" : `Voir et pointer ${listed > 1 ? `les ${listed} ${noun}s` : `l'${noun}`}`}
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {justified > 0 && (
        <span className="ml-3 inline-flex items-center gap-1 text-[11px] font-bold text-jade">
          <CheckCircle2 className="size-3" />
          {justified} déjà pointée{justified > 1 ? "s" : ""}
        </span>
      )}

      {open && (
        <div className="mt-2 overflow-hidden rounded-xl border border-line">
          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {items.map((item, i) => {
              const reason = reasonOf(item);
              // Triés par valeur : les petits montants viennent en bloc, à la fin.
              const firstSmall = isSmall(item) && (i === 0 || !isSmall(items[i - 1]));
              return (
                <Fragment key={i}>
                {firstSmall && (
                  <li className="bg-surface px-3.5 py-2 text-[11px] text-muted-foreground">
                    Moins de 1 € : poussière, récompenses en sats, jetons promotionnels. Sans effet notable sur l&apos;impôt.
                  </li>
                )}
                <FlowRow
                  item={item}
                  direction={direction}
                  reason={reason}
                  nameOf={nameOf}
                  provider={providers.get(item.account) ?? ""}
                  expanded={expanded === i}
                  onToggle={() => setExpanded(expanded === i ? null : i)}
                  onJustify={() => setEditing(item)}
                />
                </Fragment>
              );
            })}
          </ul>
          {listed > items.length && (
            <p className="border-t border-line bg-surface px-3.5 py-2 text-[11px] text-muted-foreground">
              Les {items.length} plus importantes sur {listed}.
            </p>
          )}
          <p className="border-t border-line bg-surface px-3.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
            {direction === "in"
              ? "Si ces jetons viennent d'une autre plateforme ou d'un wallet à vous, connectez-le : leur prix d'achat sera repris. Sinon, pointez-les : achat payé ailleurs, airdrop, revenu… avec la référence du justificatif."
              : "Si l'adresse est à vous, connectez-la : le transfert devient interne. Sinon, pointez l'envoi : un paiement en crypto est une cession à déclarer."}
          </p>
        </div>
      )}
      {editing && (
        <JustifyDialog
          item={editing}
          direction={direction}
          candidates={counterparts}
          nameOf={nameOf}
          open
          onOpenChange={(value) => !value && setEditing(null)}
        />
      )}
    </div>
  );
}

/** Une opération signalée : ce qu'elle est, son pointage, et de quoi remonter à son origine. */
function FlowRow({
  item,
  direction,
  reason,
  nameOf,
  provider,
  expanded,
  onToggle,
  onJustify,
}: {
  item: FlaggedFlow;
  direction: "in" | "out";
  reason: Reason;
  nameOf: (account: string) => string;
  provider: string;
  expanded: boolean;
  onToggle: () => void;
  onJustify: () => void;
}) {
  const upsert = useMutation(api.flowJustifications.upsert);
  const requestRecompute = useRequestRecompute();
  const pointed = item.justification ? categoryInfo(direction, item.justification.category) : null;
  const txUrl = explorerUrl(provider, item.txId);
  const addressUrl = addressExplorerUrl(provider, item.counterparty);

  async function confirmSuggestion() {
    if (!item.id || !item.suggestion) return;
    try {
      await upsert({
        operationId: item.id,
        direction,
        category: "internal",
        linkedOperationId: item.suggestion.id,
        note: "Rapprochement confirmé",
      });
      toast.success("Transfert interne confirmé : le coût d'acquisition suit les jetons.");
      requestRecompute();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rapprochement impossible.");
    }
  }

  return (
    <li className={cn("px-3.5 py-2.5", item.justification && "bg-jade/[0.03]")}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="text-[13px] text-foreground">
            <span className="font-bold">
              {direction === "out" ? "−" : "+"}
              <span className="num">{qty.format(item.quantity)}</span> {item.asset}
            </span>
            <span className="text-muted-foreground"> · {nameOf(item.account)}</span>
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span className="num">{dateLabel(item.date)}</span>
            {pointed ? (
              <span className="chip chip-jade px-1.5 py-0 text-[10px]" title={item.justification?.note ?? pointed.hint}>
                <Stamp className="size-3" />
                {pointed.label}
                {item.justification?.costEur !== undefined && pointed.needsCost && (
                  <span className="num font-normal">· {eur.format(item.justification.costEur)}</span>
                )}
              </span>
            ) : (
              <span
                title={reason.hint}
                className={cn("chip px-1.5 py-0 text-[10px]", reason.tone === "ok" ? "chip-jade" : "bg-chart-4/10 text-chart-4")}
              >
                {reason.label}
              </span>
            )}
            {item.protocol && <span className="chip chip-violet px-1.5 py-0 text-[10px]">{item.protocol}</span>}
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
          {item.justification?.note ? (
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">Justificatif : {item.justification.note}</p>
          ) : (
            !pointed && <p className="mt-0.5 text-[11px] leading-relaxed text-faint">{reason.hint}</p>
          )}
          {!item.justification && item.suggestion && (
            <p className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg bg-violet/5 px-2.5 py-1.5 text-[11px] text-foreground">
              <span>
                Piste : {direction === "in" ? "envoi de" : "réception de"}{" "}
                <span className="num font-bold">{qty.format(item.suggestion.quantity)} {item.asset}</span> depuis{" "}
                <span className="font-bold">{nameOf(item.suggestion.account)}</span> le{" "}
                <span className="num">{dateLabel(item.suggestion.date)}</span>.
              </span>
              {item.id && (
                <button type="button" onClick={() => void confirmSuggestion()} className="font-bold text-violet hover:underline">
                  C&apos;est mon transfert
                </button>
              )}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="num text-[13px] font-bold text-foreground">
            {item.valueEur !== null ? eur.format(item.valueEur) : "cours inconnu"}
          </span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-muted-foreground hover:bg-surface hover:text-foreground"
            >
              <Search className="size-3" />
              Approfondir
            </button>
            {item.id && (
              <button
                type="button"
                onClick={onJustify}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold transition-colors",
                  item.justification ? "text-jade hover:bg-jade/10" : "bg-violet text-white hover:brightness-110"
                )}
              >
                <Stamp className="size-3" />
                {item.justification ? "Modifier" : "Pointer"}
              </button>
            )}
          </span>
        </div>
      </div>

      {expanded && (
        <dl className="mt-2.5 grid gap-x-6 gap-y-2 rounded-xl border border-line bg-card px-3.5 py-3 text-[12px] sm:grid-cols-2">
          <Detail label="Compte">
            {nameOf(item.account)}
            {BLOCKCHAIN_NETWORKS[provider] && <span className="text-muted-foreground"> · {BLOCKCHAIN_NETWORKS[provider]}</span>}
          </Detail>
          <Detail label="Pourquoi c'est signalé">{reason.label}</Detail>
          {item.txId && (
            <Detail label="Transaction">
              <span className="font-mono">{shortTx(item.txId)}</span>
              {txUrl && (
                <a href={txUrl} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 font-bold text-violet hover:underline">
                  Explorateur <ExternalLink className="size-3" />
                </a>
              )}
            </Detail>
          )}
          <Detail label={direction === "in" ? "Adresse émettrice" : "Adresse destinataire"}>
            {item.counterparty ? (
              <>
                <span className="font-mono">{shortAddress(item.counterparty)}</span>
                {addressUrl && (
                  <a href={addressUrl} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 font-bold text-violet hover:underline">
                    Historique de l&apos;adresse <ExternalLink className="size-3" />
                  </a>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">
                {provider && BLOCKCHAIN_NETWORKS[provider]
                  ? "Lue à la prochaine synchronisation."
                  : "Non communiquée par la plateforme : retrouvez-la dans son historique de dépôts."}
              </span>
            )}
          </Detail>
          {item.protocol && <Detail label="Service ou DEX">{item.protocol}</Detail>}
          <Detail label="Pour remonter à l'origine">
            <span className="text-muted-foreground">
              {item.counterparty
                ? "Ouvrez l'historique de l'adresse : si elle a reçu ces jetons d'une plateforme (Binance, Coinbase…), c'est là qu'est le prix d'achat."
                : direction === "in"
                  ? "Cherchez le retrait du même montant, à la même date, sur vos autres plateformes ou wallets."
                  : "Retrouvez le destinataire : un wallet à vous, une plateforme, un commerçant."}
            </span>
          </Detail>
        </dl>
      )}
    </li>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">{label}</dt>
      <dd className="mt-0.5 break-words text-foreground">{children}</dd>
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
