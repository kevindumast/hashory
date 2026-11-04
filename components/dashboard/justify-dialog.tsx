"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Check, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRequestRecompute } from "@/hooks/usePortfolioSnapshots";
import {
  INFLOW_CATEGORIES,
  OUTFLOW_CATEGORIES,
  categoryInfo,
  type JustificationCategory,
} from "@/lib/justification";
import { cn } from "@/lib/utils";
import type { FlaggedFlow } from "@/convex/taxReport";

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const qty = new Intl.NumberFormat("fr-FR", { maximumSignificantDigits: 6 });
const dateLabel = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/**
 * Pointage d'une opération : ce qu'elle est, son prix d'acquisition s'il y a
 * lieu, et la référence du justificatif. Le calcul fiscal en tient compte
 * dès le recalcul suivant, lancé à l'enregistrement.
 */
export function JustifyDialog({
  item,
  direction,
  candidates,
  nameOf,
  open,
  onOpenChange,
}: {
  item: FlaggedFlow;
  direction: "in" | "out";
  /** Opérations de sens contraire, pour un transfert interne. */
  candidates: FlaggedFlow[];
  nameOf: (account: string) => string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const upsert = useMutation(api.flowJustifications.upsert);
  const remove = useMutation(api.flowJustifications.remove);
  const requestRecompute = useRequestRecompute();
  const categories = direction === "in" ? INFLOW_CATEGORIES : OUTFLOW_CATEGORIES;

  const [category, setCategory] = useState<JustificationCategory>(
    item.justification?.category ?? (item.suggestion ? "internal" : direction === "in" ? "purchase" : "own-wallet")
  );
  const [cost, setCost] = useState(item.justification?.costEur !== undefined ? String(item.justification.costEur) : "");
  const [note, setNote] = useState(item.justification?.note ?? "");
  const [linked, setLinked] = useState(item.justification?.linkedOperationId ?? item.suggestion?.id ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategory(item.justification?.category ?? (item.suggestion ? "internal" : direction === "in" ? "purchase" : "own-wallet"));
    setCost(item.justification?.costEur !== undefined ? String(item.justification.costEur) : "");
    setNote(item.justification?.note ?? "");
    setLinked(item.justification?.linkedOperationId ?? item.suggestion?.id ?? "");
  }, [open, item, direction]);

  const info = categoryInfo(direction, category);
  // Même actif d'abord, puis les plus proches dans le temps.
  const linkOptions = useMemo(
    () =>
      candidates
        .filter((candidate) => candidate.id && candidate.asset === item.asset && candidate.account !== item.account)
        .sort((a, b) => Math.abs(a.date - item.date) - Math.abs(b.date - item.date))
        .slice(0, 20),
    [candidates, item]
  );

  const parsedCost = cost.trim() === "" ? undefined : Number(cost.replace(/\s/g, "").replace(",", "."));
  const costInvalid = info?.needsCost && parsedCost !== undefined && (!Number.isFinite(parsedCost) || parsedCost < 0);
  const canSave = Boolean(item.id) && !costInvalid && (!info?.needsLink || Boolean(linked));

  async function save() {
    if (!item.id || !canSave) return;
    setSaving(true);
    try {
      await upsert({
        operationId: item.id,
        direction,
        category,
        costEur: info?.needsCost ? parsedCost : undefined,
        linkedOperationId: info?.needsLink ? linked : undefined,
        note: note.trim() || undefined,
      });
      toast.success("Opération pointée : le calcul se met à jour.");
      requestRecompute();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pointage impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function unpoint() {
    if (!item.id) return;
    setSaving(true);
    try {
      await remove({ operationId: item.id });
      toast.success("Pointage retiré.");
      requestRecompute();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pointer cette {direction === "in" ? "entrée" : "sortie"}</DialogTitle>
          <DialogDescription>
            <span className="num font-bold text-foreground">
              {direction === "in" ? "+" : "−"}
              {qty.format(item.quantity)} {item.asset}
            </span>{" "}
            · {nameOf(item.account)} · {dateLabel(item.date)}
            {item.valueEur !== null && <> · {eur.format(item.valueEur)} au cours du jour</>}
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            De quoi s&apos;agit-il ?
          </legend>
          {(Object.entries(categories) as [JustificationCategory, (typeof categories)[keyof typeof categories]][]).map(
            ([key, value]) => (
              <label
                key={key}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2.5 transition-colors",
                  category === key ? "border-violet bg-violet/5" : "border-line hover:bg-surface"
                )}
              >
                <input
                  type="radio"
                  name="category"
                  value={key}
                  checked={category === key}
                  onChange={() => setCategory(key)}
                  className="mt-1 accent-[var(--violet)]"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                    {value.label}
                    {value.taxable && <span className="chip bg-chart-4/10 px-1.5 py-0 text-[10px] text-chart-4">Cession</span>}
                  </span>
                  <span className="block text-xs leading-relaxed text-muted-foreground">{value.hint}</span>
                </span>
              </label>
            )
          )}
        </fieldset>

        {info?.needsCost && (
          <div className="space-y-1.5">
            <Label htmlFor="justify-cost">Prix d&apos;acquisition, frais compris (€)</Label>
            <Input
              id="justify-cost"
              inputMode="decimal"
              placeholder="ex : 250,00"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
              aria-invalid={costInvalid || undefined}
              className="num"
            />
            <p className="text-[11px] text-muted-foreground">
              {costInvalid
                ? "Montant invalide."
                : item.valueEur !== null
                  ? `Valeur au jour de la réception : ${eur.format(item.valueEur)}. Laissez vide si vous ne le connaissez pas : il restera compté nul.`
                  : "Laissez vide si vous ne le connaissez pas : il restera compté nul."}
            </p>
          </div>
        )}

        {info?.needsLink && (
          <div className="space-y-1.5">
            <Label>Opération correspondante</Label>
            {linkOptions.length === 0 ? (
              <p className="rounded-xl bg-surface px-3.5 py-2.5 text-xs text-muted-foreground">
                Aucune {direction === "in" ? "sortie" : "entrée"} de {item.asset} non rapprochée sur un autre compte. Le
                compte d&apos;en face n&apos;est peut-être pas encore connecté.
              </p>
            ) : (
              <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-xl border border-line">
                {linkOptions.map((candidate) => (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      onClick={() => setLinked(candidate.id!)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-[13px] transition-colors",
                        linked === candidate.id ? "bg-violet/5" : "hover:bg-surface"
                      )}
                    >
                      <span className="min-w-0">
                        <span className="num font-bold">
                          {direction === "in" ? "−" : "+"}
                          {qty.format(candidate.quantity)} {candidate.asset}
                        </span>
                        <span className="text-muted-foreground"> · {nameOf(candidate.account)}</span>
                        <span className="num block text-[11px] text-muted-foreground">
                          {dateLabel(candidate.date)}
                          {candidate.id === item.suggestion?.id && " · piste la plus probable"}
                        </span>
                      </span>
                      {linked === candidate.id && <Check className="size-4 shrink-0 text-violet" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="justify-note">Justificatif (facultatif)</Label>
          <textarea
            id="justify-note"
            rows={2}
            maxLength={1000}
            placeholder="Facture, relevé, nom de la plateforme, hash…"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="w-full resize-y rounded-xl border border-line bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-violet/40"
          />
          <p className="text-[11px] text-muted-foreground">
            En cas de contrôle, c&apos;est cette pièce qu&apos;on vous demandera : notez où la retrouver.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {item.justification ? (
            <Button variant="ghost" onClick={() => void unpoint()} disabled={saving} className="text-negative">
              <Trash2 />
              Retirer le pointage
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={() => void save()} disabled={!canSave || saving} className="rounded-full">
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
