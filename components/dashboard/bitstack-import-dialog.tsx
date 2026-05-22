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

type BitstackImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

type ParsedRow =
  | { kind: "trade"; externalId: string; executedAt: number; fromAsset: string; fromAmount: number; toAsset: string; toAmount: number; fee?: number; feeAsset?: string; price?: number }
  | { kind: "deposit"; externalId: string; executedAt: number; fiatCurrency: string; fiatAmount: number };

type ParseResult = {
  trades: Extract<ParsedRow, { kind: "trade" }>[];
  deposits: Extract<ParsedRow, { kind: "deposit" }>[];
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

function parseTimestamp(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/GMT$/i, "Z").replace(/UTC$/i, "Z").trim();
  const ts = Date.parse(cleaned);
  if (!isNaN(ts)) return ts;
  return null;
}

function parseAmount(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

function parseBitstackCsv(text: string): ParseResult {
  const bom = "﻿";
  const content = text.startsWith(bom) ? text.slice(1) : text;
  const lines = content.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length < 2) {
    return { trades: [], deposits: [], skipped: 0 };
  }

  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = parseCsvLine(lines[0], sep).map((h) => h.toLowerCase().trim());

  const idx = (candidates: string[]) => {
    for (const c of candidates) {
      const i = headers.findIndex((h) => h.includes(c));
      if (i !== -1) return i;
    }
    return -1;
  };

  const iType = idx(["type"]);
  const iDate = idx(["date"]);
  const iAmountIn = idx(["montant reçu", "montant rec"]);
  const iAssetIn = idx(["monnaie ou jeton reçu", "monnaie ou jeton rec", "jeton reçu"]);
  const iAmountOut = idx(["montant envoyé", "montant envoye"]);
  const iAssetOut = idx(["monnaie ou jeton envoyé", "monnaie ou jeton envoye", "jeton envoyé"]);
  const iFee = idx(["frais"]);
  const iFeeCurrency = idx(["monnaie ou jeton des frais", "jeton des frais"]);
  const iPrice = idx(["prix du jeton du montant reçu", "prix du jeton du montant"]);
  const iExternalId = idx(["id externe", "id_externe", "external"]);

  const trades: Extract<ParsedRow, { kind: "trade" }>[] = [];
  const deposits: Extract<ParsedRow, { kind: "deposit" }>[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], sep);
    const type = (iType !== -1 ? cols[iType] : "").toLowerCase();
    const dateRaw = iDate !== -1 ? cols[iDate] : "";
    const executedAt = parseTimestamp(dateRaw);

    if (!executedAt) {
      skipped++;
      continue;
    }

    const externalId = iExternalId !== -1 ? cols[iExternalId] : `row-${i}`;

    if (type === "échange" || type === "echange" || type === "exchange") {
      const toAmount = parseAmount(iAmountIn !== -1 ? cols[iAmountIn] : "");
      const toAsset = iAssetIn !== -1 ? cols[iAssetIn].toUpperCase() : "";
      const fromAmount = parseAmount(iAmountOut !== -1 ? cols[iAmountOut] : "");
      const fromAsset = iAssetOut !== -1 ? cols[iAssetOut].toUpperCase() : "";
      const fee = iFee !== -1 ? parseAmount(cols[iFee]) : undefined;
      const feeAsset = iFeeCurrency !== -1 ? cols[iFeeCurrency].toUpperCase() || undefined : undefined;
      const price = iPrice !== -1 ? parseAmount(cols[iPrice]) || undefined : undefined;

      if (!toAsset || !fromAsset || toAmount === 0) {
        skipped++;
        continue;
      }

      trades.push({
        kind: "trade",
        externalId: externalId || `trade-${i}`,
        executedAt,
        fromAsset,
        fromAmount,
        toAsset,
        toAmount,
        fee: fee !== undefined && fee > 0 ? fee : undefined,
        feeAsset,
        price,
      });
    } else if (type === "dépôt" || type === "depot" || type === "deposit") {
      const fiatAmount = parseAmount(iAmountIn !== -1 ? cols[iAmountIn] : "");
      const fiatCurrency = iAssetIn !== -1 ? cols[iAssetIn].toUpperCase() : "EUR";

      if (fiatAmount === 0) {
        skipped++;
        continue;
      }

      deposits.push({
        kind: "deposit",
        externalId: externalId || `deposit-${i}`,
        executedAt,
        fiatCurrency,
        fiatAmount,
      });
    } else {
      skipped++;
    }
  }

  return { trades, deposits, skipped };
}

export function BitstackImportDialog({ open, onOpenChange, onSuccess }: BitstackImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [importResult, setImportResult] = useState<{ tradesInserted: number; depositsInserted: number } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const ingestCsv = useMutation(api.bitstack.ingestCsv);

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
        const result = parseBitstackCsv(ev.target?.result as string);
        if (result.trades.length === 0 && result.deposits.length === 0) {
          setParseError("Aucune transaction reconnue dans ce fichier. Vérifiez que c'est bien un export Bitstack.");
        } else {
          setParsed(result);
        }
      } catch {
        setParseError("Impossible de lire le fichier. Vérifiez qu'il s'agit d'un CSV Bitstack valide.");
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
        trades: parsed.trades.map(({ kind: _k, ...t }) => t),
        deposits: parsed.deposits.map(({ kind: _k, ...d }) => d),
        displayName: "Bitstack",
      });
      setImportResult({ tradesInserted: result.tradesInserted, depositsInserted: result.depositsInserted });
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md gap-4">
        <DialogHeader className="space-y-1">
          <DialogTitle>Importer un export Bitstack</DialogTitle>
          <DialogDescription className="text-xs">
            Importez votre historique de transactions depuis un fichier CSV exporté depuis Bitstack.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label
            htmlFor="bitstack-csv"
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
              id="bitstack-csv"
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
              <p className="text-muted-foreground">
                {parsed.trades.length} achat{parsed.trades.length > 1 ? "s" : ""} par carte détecté{parsed.trades.length > 1 ? "s" : ""}
              </p>
              <p className="text-muted-foreground">
                {parsed.deposits.length} dépôt{parsed.deposits.length > 1 ? "s" : ""} fiat détecté{parsed.deposits.length > 1 ? "s" : ""}
              </p>
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
                {importResult.tradesInserted} achat{importResult.tradesInserted > 1 ? "s" : ""} et {importResult.depositsInserted} dépôt{importResult.depositsInserted > 1 ? "s" : ""} ajouté{importResult.tradesInserted + importResult.depositsInserted > 1 ? "s" : ""}
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
