"use client";

import { useRef, useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { Check, LoaderCircle, Upload, FileText, AlertCircle } from "lucide-react";
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

type FinaryImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

type FinaryTrade = {
  externalId: string;
  executedAt: number;
  receivedAmount: number;
  receivedCurrency: string;
  sentAmount: number;
  sentCurrency: string;
  feeAmount?: number;
  feeCurrency?: string;
  description: string;
};

type FinaryWithdrawal = {
  externalId: string;
  executedAt: number;
  sentAmount: number;
  sentCurrency: string;
  feeAmount?: number;
  feeCurrency?: string;
  address?: string;
  txHash?: string;
};

type ParseResult = {
  trades: FinaryTrade[];
  withdrawals: FinaryWithdrawal[];
  skipped: number;
};

function parseCsvLine(line: string, sep: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === sep && !inQuotes) {
      fields.push(field.trim());
      field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field.trim());
  return fields;
}

function parseAmount(raw: string): number {
  if (!raw) return 0;
  return parseFloat(raw.replace(/\s/g, "").replace(",", ".")) || 0;
}

function parseFinaryCsv(text: string): ParseResult {
  const bom = "﻿";
  const content = text.startsWith(bom) ? text.slice(1) : text;
  const lines = content.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length < 2) return { trades: [], withdrawals: [], skipped: 0 };

  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = parseCsvLine(lines[0], sep).map((h) => h.toLowerCase().trim());

  const col = (name: string) => headers.indexOf(name);

  const iType = col("type");
  const iDate = col("date");
  const iReceivedAmount = col("received_amount");
  const iReceivedCurrency = col("received_currency");
  const iSentAmount = col("sent_amount");
  const iSentCurrency = col("sent_currency");
  const iFeeAmount = col("fee_amount");
  const iFeeCurrency = col("fee_currency");
  const iDescription = col("description");
  const iAddress = col("address");
  const iTxHash = col("transaction_hash");
  const iExternalId = col("external_id");

  const trades: FinaryTrade[] = [];
  const withdrawals: FinaryWithdrawal[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], sep);
    const type = (iType !== -1 ? cols[iType] : "").toLowerCase().trim();
    const dateRaw = iDate !== -1 ? cols[iDate] : "";
    const executedAt = Date.parse(dateRaw.replace(/GMT$/i, "Z").replace(/UTC$/i, "Z").trim());

    if (isNaN(executedAt)) {
      skipped++;
      continue;
    }

    const externalId = (iExternalId !== -1 && cols[iExternalId]) ? cols[iExternalId] : `row-${i}`;
    const description = (iDescription !== -1 ? cols[iDescription] : "").trim();
    const feeAmount = iFeeAmount !== -1 ? parseAmount(cols[iFeeAmount]) : 0;
    const feeCurrency = iFeeCurrency !== -1 ? cols[iFeeCurrency].toUpperCase() || undefined : undefined;

    if (type === "trade") {
      const receivedAmount = parseAmount(iReceivedAmount !== -1 ? cols[iReceivedAmount] : "");
      const receivedCurrency = (iReceivedCurrency !== -1 ? cols[iReceivedCurrency] : "").toUpperCase();
      const sentAmount = parseAmount(iSentAmount !== -1 ? cols[iSentAmount] : "");
      const sentCurrency = (iSentCurrency !== -1 ? cols[iSentCurrency] : "").toUpperCase();

      if (!receivedCurrency || !sentCurrency || receivedAmount === 0) {
        skipped++;
        continue;
      }

      trades.push({
        externalId,
        executedAt,
        receivedAmount,
        receivedCurrency,
        sentAmount,
        sentCurrency,
        feeAmount: feeAmount > 0 ? feeAmount : undefined,
        feeCurrency,
        description,
      });
    } else if (type === "withdrawal") {
      const sentAmount = parseAmount(iSentAmount !== -1 ? cols[iSentAmount] : "");
      const sentCurrency = (iSentCurrency !== -1 ? cols[iSentCurrency] : "").toUpperCase();
      const address = iAddress !== -1 ? cols[iAddress] || undefined : undefined;
      const txHash = iTxHash !== -1 ? cols[iTxHash] || undefined : undefined;

      if (!sentCurrency || sentAmount === 0) {
        skipped++;
        continue;
      }

      withdrawals.push({
        externalId,
        executedAt,
        sentAmount,
        sentCurrency,
        feeAmount: feeAmount > 0 ? feeAmount : undefined,
        feeCurrency,
        address,
        txHash,
      });
    } else {
      skipped++;
    }
  }

  return { trades, withdrawals, skipped };
}

export function FinaryImportDialog({ open, onOpenChange, onSuccess }: FinaryImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [importResult, setImportResult] = useState<{ tradesInserted: number; withdrawalsInserted: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const ingestCsv = useMutation(api.finary.ingestCsv);

  function reset() {
    setFileName(null);
    setParsed(null);
    setParseError(null);
    setSubmitting(false);
    setCompleted(false);
    setImportResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const loadFile = useCallback((file: File) => {
    setFileName(file.name);
    setParsed(null);
    setParseError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const result = parseFinaryCsv(ev.target?.result as string);
        if (result.trades.length === 0 && result.withdrawals.length === 0) {
          setParseError("Aucune transaction reconnue dans ce fichier. Vérifiez que c'est bien un export Finary CSV.");
        } else {
          setParsed(result);
        }
      } catch {
        setParseError("Impossible de lire le fichier. Vérifiez qu'il s'agit d'un CSV Finary valide.");
      }
    };
    reader.readAsText(file, "utf-8");
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  }

  async function handleImport() {
    if (!parsed) return;
    setSubmitting(true);

    try {
      const result = await ingestCsv({
        trades: parsed.trades,
        withdrawals: parsed.withdrawals,
        displayName: "Finary",
      });
      setImportResult({ tradesInserted: result.tradesInserted, withdrawalsInserted: result.withdrawalsInserted });
      setCompleted(true);
      onSuccess?.();
      setTimeout(() => {
        onOpenChange(false);
        reset();
      }, 2000);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Erreur lors de l'import.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(val: boolean) {
    if (!val) reset();
    onOpenChange(val);
  }

  const buyCount = parsed?.trades.filter((t) => t.description.toLowerCase() !== "swap").length ?? 0;
  const swapCount = parsed?.trades.filter((t) => t.description.toLowerCase() === "swap").length ?? 0;
  const withdrawalCount = parsed?.withdrawals.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md gap-4">
        <DialogHeader className="space-y-1">
          <DialogTitle>Importer un export Finary</DialogTitle>
          <DialogDescription className="text-xs">
            Importez votre historique depuis un fichier CSV exporté depuis Finary (Compte → Exporter).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label
            htmlFor="finary-csv"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 cursor-pointer transition-colors ${isDragging ? "border-primary bg-primary/10" : "border-border/60 bg-muted/30 hover:border-border hover:bg-muted/50"}`}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              {fileName ? (
                <FileText className="size-5 text-muted-foreground" />
              ) : (
                <Upload className="size-5 text-muted-foreground" />
              )}
            </div>
            <div className="text-center">
              {fileName ? (
                <p className="text-sm font-medium text-foreground">{fileName}</p>
              ) : (
                <>
                  <p className="text-sm font-medium">Glissez votre fichier ici</p>
                  <p className="text-xs text-muted-foreground">ou cliquez pour sélectionner un CSV</p>
                </>
              )}
            </div>
            <input
              id="finary-csv"
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={handleFileChange}
            />
          </label>

          {parsed && !completed && (
            <div className="rounded-md border border-border/60 bg-muted/30 px-4 py-3 text-sm space-y-1">
              <p className="font-medium text-foreground">Aperçu du fichier</p>
              {buyCount > 0 && (
                <p className="text-muted-foreground">
                  {buyCount} achat{buyCount > 1 ? "s" : ""} crypto détecté{buyCount > 1 ? "s" : ""}
                </p>
              )}
              {swapCount > 0 && (
                <p className="text-muted-foreground">
                  {swapCount} swap{swapCount > 1 ? "s" : ""} crypto détecté{swapCount > 1 ? "s" : ""}
                </p>
              )}
              {withdrawalCount > 0 && (
                <p className="text-muted-foreground">
                  {withdrawalCount} retrait{withdrawalCount > 1 ? "s" : ""} détecté{withdrawalCount > 1 ? "s" : ""}
                </p>
              )}
              {parsed.skipped > 0 && (
                <p className="text-amber-600 dark:text-amber-500 text-xs">
                  {parsed.skipped} ligne{parsed.skipped > 1 ? "s" : ""} ignorée{parsed.skipped > 1 ? "s" : ""}
                </p>
              )}
            </div>
          )}

          {completed && importResult && (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm space-y-1">
              <p className="font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                <Check className="size-4" />
                Import réussi
              </p>
              <p className="text-emerald-700 dark:text-emerald-400 text-xs">
                {importResult.tradesInserted} trade{importResult.tradesInserted > 1 ? "s" : ""} · {importResult.withdrawalsInserted} retrait{importResult.withdrawalsInserted > 1 ? "s" : ""} ajouté{importResult.tradesInserted + importResult.withdrawalsInserted > 1 ? "s" : ""}
              </p>
            </div>
          )}

          {parseError && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-start gap-2" role="alert">
              <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
              {parseError}
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={submitting} className="h-9 text-sm cursor-pointer">
            Annuler
          </Button>
          <Button
            type="button"
            disabled={!parsed || submitting || completed}
            onClick={handleImport}
            className="h-9 min-w-[140px] text-sm cursor-pointer"
          >
            {submitting ? (
              <span className="flex items-center gap-1.5">
                <LoaderCircle className="size-3.5 animate-spin" />
                Import…
              </span>
            ) : completed ? (
              <span className="flex items-center gap-1.5">
                <Check className="size-3.5" />
                Importé
              </span>
            ) : (
              "Importer"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
