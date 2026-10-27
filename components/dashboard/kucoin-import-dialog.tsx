"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Check, LoaderCircle, Upload, FileText, AlertCircle, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { errorMessage, toast } from "@/lib/toast";
import type { Id } from "@/convex/_generated/dataModel";
import { decodeCsvText } from "@/lib/csv-text";
import { readFirstSheet } from "@/lib/xlsx-reader";
import {
  mergeKucoinExports,
  parseCsvRows,
  parseKucoinExport,
  type KucoinExport,
  type KucoinExportKind,
} from "@/lib/kucoin-export";

type KucoinImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrationId: Id<"integrations">;
  onSuccess?: () => void;
};

type KucoinImportPanelProps = {
  /** Compte à alimenter. Absent : le compte KuCoin est créé, ou repris s'il existe. */
  integrationId?: Id<"integrations">;
  /** Nom du compte s'il est créé par cet import. */
  displayName?: string;
  onClose: () => void;
  onSuccess?: () => void;
};

const MAX_FILE_BYTES = 20 * 1024 * 1024;

const KIND_LABELS: Record<KucoinExportKind, string> = {
  spot: "ordres spot",
  spot_split: "détail des exécutions, ignoré (déjà dans les ordres spot)",
  convert: "conversions",
  deposit: "dépôts on-chain",
  withdrawal: "retraits on-chain",
  account: "relevé de compte",
  fiat_fast_trade: "achats par carte",
  fiat_other: "export Fiat non pris en charge",
  unknown: "fichier non reconnu",
};

type LoadedFile = { name: string; result: KucoinExport | null; error: string | null };

type ImportResult = {
  createdAccount: boolean;
  spotInserted: number;
  convertsInserted: number;
  depositsInserted: number;
  withdrawalsInserted: number;
  cardPurchasesInserted: number;
  cardPurchasesRepriced: number;
  duplicatesRemoved: number;
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? "s" : ""}`;
}

function describe(result: KucoinExport): string {
  const parts: string[] = [];
  if (result.spotTrades.length) parts.push(plural(result.spotTrades.length, "ordre"));
  if (result.converts.length) parts.push(plural(result.converts.length, "conversion"));
  if (result.deposits.length) parts.push(plural(result.deposits.length, "dépôt"));
  if (result.withdrawals.length) parts.push(plural(result.withdrawals.length, "retrait"));
  if (result.cardPurchases.length) parts.push(plural(result.cardPurchases.length, "achat par carte"));
  if (parts.length > 0) return parts.join(" · ");
  if (result.kind === "spot_split" || result.kind === "unknown") return KIND_LABELS[result.kind];
  if (result.kind === "fiat_other") {
    return result.skipped > 0
      ? `${plural(result.skipped, "ligne")} non prise${result.skipped > 1 ? "s" : ""} en charge (virement, P2P ou paiement tiers)`
      : "aucune ligne sur cette période";
  }
  if (result.kind === "account") return "aucun achat par carte (le reste figure dans les autres fichiers)";
  return "aucune ligne sur cette période";
}

async function readExport(file: File): Promise<string[][]> {
  const buffer = await file.arrayBuffer();
  if (/\.xlsx$/i.test(file.name)) return readFirstSheet(buffer);
  return parseCsvRows(decodeCsvText(buffer));
}

export function KucoinImportDialog({ open, onOpenChange, integrationId, onSuccess }: KucoinImportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-4">
        <DialogHeader className="space-y-1">
          <DialogTitle className="title text-2xl leading-tight">Importer des exports KuCoin</DialogTitle>
          <DialogDescription className="text-xs">{IMPORT_HINT}</DialogDescription>
        </DialogHeader>
        {/* Monté seulement à l'ouverture : chaque ouverture repart de zéro. */}
        {open && (
          <KucoinImportPanel integrationId={integrationId} onClose={() => onOpenChange(false)} onSuccess={onSuccess} />
        )}
      </DialogContent>
    </Dialog>
  );
}

export const IMPORT_HINT =
  "Déposez tous les fichiers exportés depuis KuCoin (Orders et Assets → History), toutes années confondues. Chaque fichier est reconnu automatiquement ; les mouvements déjà connus ne sont pas ajoutés deux fois.";

/** Choix des fichiers, aperçu et import : partagé par l'ajout de compte et le menu du compte. */
export function KucoinImportPanel({ integrationId, displayName, onClose, onSuccess }: KucoinImportPanelProps) {
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [reading, setReading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const ingestXlsx = useMutation(api.kucoin_import.ingestXlsx);

  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setReading(true);
    setError(null);
    setImportResult(null);
    const loaded: LoadedFile[] = [];
    for (const file of Array.from(list)) {
      if (!/\.(xlsx|csv)$/i.test(file.name)) {
        loaded.push({ name: file.name, result: null, error: "Format attendu : .xlsx ou .csv" });
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        loaded.push({ name: file.name, result: null, error: "Fichier trop volumineux." });
        continue;
      }
      try {
        loaded.push({ name: file.name, result: parseKucoinExport(await readExport(file)), error: null });
      } catch (err) {
        loaded.push({ name: file.name, result: null, error: errorMessage(err, "Impossible de lire le fichier.") });
      }
    }
    // Un fichier redéposé remplace le précédent du même nom.
    setFiles((current) => [...current.filter((f) => !loaded.some((l) => l.name === f.name)), ...loaded]);
    setReading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeFile(name: string) {
    setFiles((current) => current.filter((f) => f.name !== name));
    setImportResult(null);
  }

  const merged = mergeKucoinExports(files.flatMap((f) => (f.result ? [f.result] : [])));
  const totalRows =
    merged.spotTrades.length +
    merged.converts.length +
    merged.deposits.length +
    merged.withdrawals.length +
    merged.cardPurchases.length;

  async function handleImport() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await ingestXlsx({
        integrationId,
        displayName,
        spotTrades: merged.spotTrades,
        converts: merged.converts,
        deposits: merged.deposits,
        withdrawals: merged.withdrawals,
        cardPurchases: merged.cardPurchases,
      });
      setImportResult(result);
      const inserted =
        result.spotInserted +
        result.convertsInserted +
        result.depositsInserted +
        result.withdrawalsInserted +
        result.cardPurchasesInserted +
        result.cardPurchasesRepriced;
      toast.success(
        inserted > 0 || result.duplicatesRemoved > 0
          ? `Import KuCoin terminé : ${plural(inserted, "ligne")} ajoutée${inserted > 1 ? "s" : ""}`
          : "Import KuCoin terminé, rien de nouveau"
      );
      onSuccess?.();
    } catch (err) {
      console.error("KuCoin import failed:", err);
      setError(errorMessage(err, "Échec de l'import KuCoin."));
      toast.error(errorMessage(err, "Échec de l'import KuCoin."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <label
        htmlFor="kucoin-export-files"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void addFiles(e.dataTransfer.files); }}
        className={`flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-4 transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border/60 bg-muted/20 hover:border-border hover:bg-muted/30"
        }`}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
          {reading ? <LoaderCircle className="size-4 animate-spin text-muted-foreground" /> : <Upload className="size-4 text-muted-foreground" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">Choisir ou glisser les fichiers</p>
          <p className="text-xs text-muted-foreground">.xlsx ou .csv, plusieurs à la fois</p>
        </div>
        <input
          id="kucoin-export-files"
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => void addFiles(e.target.files)}
        />
      </label>

      {files.length > 0 && (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {files.map((file) => {
            const useful = file.result && file.result.kind !== "unknown";
            return (
              <li key={file.name} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/30">
                <FileText className={`size-3.5 shrink-0 ${file.error ? "text-destructive" : useful ? "text-positive" : "text-muted-foreground"}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-foreground">{file.name}</p>
                  <p className={`truncate ${file.error ? "text-destructive" : "text-muted-foreground"}`}>
                    {file.error ?? (file.result ? describe(file.result) : "")}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Retirer ${file.name}`}
                  onClick={() => removeFile(file.name)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {totalRows > 0 && !importResult && (
        <p className="text-xs text-muted-foreground">
          À importer : {[
            merged.spotTrades.length && plural(merged.spotTrades.length, "ordre spot"),
            merged.converts.length && plural(merged.converts.length, "conversion"),
            merged.deposits.length && plural(merged.deposits.length, "dépôt"),
            merged.withdrawals.length && plural(merged.withdrawals.length, "retrait"),
            merged.cardPurchases.length && plural(merged.cardPurchases.length, "achat par carte"),
          ].filter(Boolean).join(" · ")}
        </p>
      )}

      {importResult && (
        <div className="space-y-1 border-l-2 border-positive py-3 pl-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-positive"><Check className="size-4" /> Import réussi</p>
          {importResult.createdAccount && <p className="text-xs text-positive">Compte KuCoin créé, alimenté par ses exports</p>}
          {importResult.spotInserted > 0 && <p className="text-xs text-positive">{plural(importResult.spotInserted, "ordre spot")}</p>}
          {importResult.convertsInserted > 0 && <p className="text-xs text-positive">{plural(importResult.convertsInserted, "conversion")}</p>}
          {importResult.depositsInserted > 0 && <p className="text-xs text-positive">{plural(importResult.depositsInserted, "dépôt")}</p>}
          {importResult.withdrawalsInserted > 0 && <p className="text-xs text-positive">{plural(importResult.withdrawalsInserted, "retrait")}</p>}
          {importResult.cardPurchasesInserted > 0 && <p className="text-xs text-positive">{plural(importResult.cardPurchasesInserted, "achat par carte")}</p>}
          {importResult.cardPurchasesRepriced > 0 && (
            <p className="text-xs text-positive">{plural(importResult.cardPurchasesRepriced, "achat par carte")} au prix réellement payé</p>
          )}
          {importResult.duplicatesRemoved > 0 && (
            <p className="text-xs text-muted-foreground">{plural(importResult.duplicatesRemoved, "doublon")} d&apos;anciens imports retiré{importResult.duplicatesRemoved > 1 ? "s" : ""}</p>
          )}
          {importResult.spotInserted + importResult.convertsInserted + importResult.depositsInserted + importResult.withdrawalsInserted + importResult.cardPurchasesInserted + importResult.cardPurchasesRepriced + importResult.duplicatesRemoved === 0 && (
            <p className="text-xs text-muted-foreground">Tout était déjà enregistré.</p>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 border-l-2 border-destructive py-2 pl-3 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </div>
      )}

      <DialogFooter className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end">
        <Button type="button" variant="ghost" onClick={onClose} disabled={submitting} className="h-9 cursor-pointer text-sm">
          {importResult ? "Fermer" : "Annuler"}
        </Button>
        <Button
          type="button"
          disabled={totalRows === 0 || submitting || reading || importResult !== null}
          onClick={handleImport}
          className="h-9 min-w-[140px] cursor-pointer text-sm"
        >
          {submitting ? (
            <span className="flex items-center gap-1.5"><LoaderCircle className="size-3.5 animate-spin" />Import…</span>
          ) : importResult ? (
            <span className="flex items-center gap-1.5"><Check className="size-3.5" />Importé</span>
          ) : (
            `Importer${totalRows > 0 ? ` (${totalRows})` : ""}`
          )}
        </Button>
      </DialogFooter>
    </div>
  );
}
