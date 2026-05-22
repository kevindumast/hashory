"use client";

import { useRef, useState, useCallback } from "react";
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
import type { Id } from "@/convex/_generated/dataModel";

type KucoinImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrationId: Id<"integrations">;
  onSuccess?: () => void;
};

const PREFERRED_QUOTES = new Set(["USDT", "USDC", "USD", "DAI", "FDUSD", "TUSD", "BUSD", "EUR", "GBP", "BTC", "ETH", "KCS"]);

function resolveConvertSymbol(fromAsset: string, toAsset: string): { symbol: string; side: "BUY" | "SELL" } {
  const from = fromAsset.toUpperCase();
  const to = toAsset.toUpperCase();
  if (PREFERRED_QUOTES.has(from) && !PREFERRED_QUOTES.has(to)) return { symbol: `${to}${from}`, side: "BUY" };
  if (PREFERRED_QUOTES.has(to) && !PREFERRED_QUOTES.has(from)) return { symbol: `${from}${to}`, side: "SELL" };
  return { symbol: `${to}${from}`, side: "BUY" };
}

function parseKucoinTime(raw: string): number | null {
  if (!raw) return null;
  const iso = String(raw).trim().replace(" ", "T") + "+08:00";
  const ts = Date.parse(iso);
  return isNaN(ts) ? null : ts;
}

function parseAmountCurrency(raw: string): { amount: number; currency: string } | null {
  const parts = String(raw).trim().split(" ");
  if (parts.length < 2) return null;
  const amount = parseFloat(parts[0]);
  const currency = parts[parts.length - 1].toUpperCase();
  if (isNaN(amount) || !currency) return null;
  return { amount, currency };
}

function parseCsvLine(line: string, sep: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
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

function parseCsv(text: string): string[][] {
  const bom = "﻿";
  const content = text.startsWith(bom) ? text.slice(1) : text;
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  return lines.map((l) => parseCsvLine(l, sep));
}

function idxH(headers: string[], candidates: string[]): number {
  for (const c of candidates) {
    const i = headers.findIndex((h) => h.toLowerCase().includes(c.toLowerCase()));
    if (i !== -1) return i;
  }
  return -1;
}

type FileType = "convert" | "spot" | "deposit" | "withdrawal" | "account_funding" | "account_trading";

type SpotTrade = { orderId: string; symbol: string; side: "BUY" | "SELL"; avgFilledPrice: number; filledAmount: number; filledVolume: number; fee: number; feeAsset: string; executedAt: number };
type Convert = { sellAsset: string; sellAmount: number; buyAsset: string; buyAmount: number; symbol: string; side: "BUY" | "SELL"; executedAt: number };
type Deposit = { hash: string; coin: string; amount: number; fee: number; address: string; network: string; executedAt: number };
type Withdrawal = { hash: string; coin: string; amount: number; fee: number; address: string; network: string; executedAt: number };
type InternalTransfer = { transferId: string; account: string; coin: string; amount: number; fee: number; executedAt: number };

type ParseResult = {
  spotTrades: SpotTrade[];
  converts: Convert[];
  deposits: Deposit[];
  withdrawals: Withdrawal[];
  transfers: InternalTransfer[];
  skipped: number;
};

type SlotState = { fileName: string; count: number; skipped: number } | null;
type AllParsed = { spotTrades: SpotTrade[]; converts: Convert[]; deposits: Deposit[]; withdrawals: Withdrawal[]; transfers: InternalTransfer[] };

function detectFileType(filename: string): FileType | null {
  const lower = filename.toLowerCase();
  if (lower.includes("convert")) return "convert";
  if (lower.includes("spot")) return "spot";
  if (lower.includes("deposit history")) return "deposit";
  if (lower.includes("withdrawal history")) return "withdrawal";
  if (lower.includes("trading account")) return "account_trading";
  if (lower.includes("funding account") || lower.includes("account history")) return "account_funding";
  return null;
}

function parseFile(fileType: FileType, rows: string[][]): ParseResult {
  const empty: ParseResult = { spotTrades: [], converts: [], deposits: [], withdrawals: [], transfers: [], skipped: 0 };
  if (rows.length < 2) return empty;

  const headers = rows[0].map((h) => String(h ?? "").toLowerCase().trim());
  const dataRows = rows.slice(1);
  let skipped = 0;

  if (fileType === "convert") {
    const iSell = idxH(headers, ["sell"]);
    const iBuy = idxH(headers, ["buy"]);
    const iTime = idxH(headers, ["time of update", "time"]);
    const iStatus = idxH(headers, ["status"]);
    const converts: Convert[] = [];
    for (const row of dataRows) {
      if (String(row[iStatus] ?? "").toUpperCase() !== "SUCCESS") { skipped++; continue; }
      const sell = parseAmountCurrency(String(row[iSell] ?? ""));
      const buy = parseAmountCurrency(String(row[iBuy] ?? ""));
      const executedAt = parseKucoinTime(String(row[iTime] ?? ""));
      if (!sell || !buy || !executedAt) { skipped++; continue; }
      const { symbol, side } = resolveConvertSymbol(sell.currency, buy.currency);
      converts.push({ sellAsset: sell.currency, sellAmount: sell.amount, buyAsset: buy.currency, buyAmount: buy.amount, symbol, side, executedAt });
    }
    return { ...empty, converts, skipped };
  }

  if (fileType === "spot") {
    const iOrderId = idxH(headers, ["order id"]);
    const iSymbol = idxH(headers, ["symbol"]);
    const iSide = idxH(headers, ["side"]);
    const iAvgPrice = idxH(headers, ["avg. filled price", "avg filled price"]);
    const iFilledAmount = idxH(headers, ["filled amount"]);
    const iFilledVolume = idxH(headers, ["filled volume (usdt)", "filled volume"]);
    const iFee = idxH(headers, ["fee"]);
    const iFeeAsset = idxH(headers, ["fee currency"]);
    const iFilledTime = idxH(headers, ["filled time"]);
    const iStatus = idxH(headers, ["status"]);
    const spotTrades: SpotTrade[] = [];
    for (const row of dataRows) {
      const status = String(row[iStatus] ?? "").toLowerCase();
      if (status !== "deal" && status !== "part_deal") { skipped++; continue; }
      const orderId = String(row[iOrderId] ?? "").trim();
      const symbol = String(row[iSymbol] ?? "").trim();
      const side = String(row[iSide] ?? "").toUpperCase() as "BUY" | "SELL";
      const avgFilledPrice = parseFloat(String(row[iAvgPrice] ?? "")) || 0;
      const filledAmount = parseFloat(String(row[iFilledAmount] ?? "")) || 0;
      const filledVolume = parseFloat(String(row[iFilledVolume] ?? "")) || 0;
      const fee = parseFloat(String(row[iFee] ?? "")) || 0;
      const feeAsset = String(row[iFeeAsset] ?? "").trim();
      const executedAt = parseKucoinTime(String(row[iFilledTime] ?? ""));
      if (!orderId || !symbol || !executedAt || filledAmount === 0) { skipped++; continue; }
      spotTrades.push({ orderId, symbol: symbol.replace("-", ""), side, avgFilledPrice, filledAmount, filledVolume, fee, feeAsset, executedAt });
    }
    return { ...empty, spotTrades, skipped };
  }

  if (fileType === "deposit") {
    const iTime = idxH(headers, ["time"]);
    const iCoin = idxH(headers, ["coin"]);
    const iAmount = idxH(headers, ["amount"]);
    const iFee = idxH(headers, ["fee"]);
    const iHash = idxH(headers, ["hash"]);
    const iAddress = idxH(headers, ["deposit address"]);
    const iNetwork = idxH(headers, ["transfer network"]);
    const iStatus = idxH(headers, ["status"]);
    const deposits: Deposit[] = [];
    for (const row of dataRows) {
      if (String(row[iStatus] ?? "").toUpperCase() !== "SUCCESS") { skipped++; continue; }
      const executedAt = parseKucoinTime(String(row[iTime] ?? ""));
      const coin = String(row[iCoin] ?? "").trim().toUpperCase();
      const amount = parseFloat(String(row[iAmount] ?? "")) || 0;
      const hash = String(row[iHash] ?? "").trim();
      if (!executedAt || !coin || !hash || amount === 0) { skipped++; continue; }
      deposits.push({ hash, coin, amount, fee: parseFloat(String(row[iFee] ?? "")) || 0, address: String(row[iAddress] ?? "").trim(), network: String(row[iNetwork] ?? "").trim(), executedAt });
    }
    return { ...empty, deposits, skipped };
  }

  if (fileType === "withdrawal") {
    const iTime = idxH(headers, ["time"]);
    const iCoin = idxH(headers, ["coin"]);
    const iAmount = idxH(headers, ["amount"]);
    const iFee = idxH(headers, ["fee"]);
    const iHash = idxH(headers, ["hash"]);
    const iAddress = idxH(headers, ["withdrawal address", "address"]);
    const iNetwork = idxH(headers, ["transfer network"]);
    const iStatus = idxH(headers, ["status"]);
    const withdrawals: Withdrawal[] = [];
    for (const row of dataRows) {
      if (String(row[iStatus] ?? "").toUpperCase() !== "SUCCESS") { skipped++; continue; }
      const executedAt = parseKucoinTime(String(row[iTime] ?? ""));
      const coin = String(row[iCoin] ?? "").trim().toUpperCase();
      const amount = parseFloat(String(row[iAmount] ?? "")) || 0;
      const hash = String(row[iHash] ?? "").trim();
      if (!executedAt || !coin || !hash || amount === 0) { skipped++; continue; }
      withdrawals.push({ hash, coin, amount, fee: parseFloat(String(row[iFee] ?? "")) || 0, address: String(row[iAddress] ?? "").trim(), network: String(row[iNetwork] ?? "").trim(), executedAt });
    }
    return { ...empty, withdrawals, skipped };
  }

  if (fileType === "account_funding" || fileType === "account_trading") {
    // Columns: UID, Account Type, Currency, Side, Amount, Fee, Time(UTC+08:00), Remark, Type
    const iTime = idxH(headers, ["time"]);
    const iCurrency = idxH(headers, ["currency"]);
    const iSide = idxH(headers, ["side"]);
    const iAmount = idxH(headers, ["amount"]);
    const iFee = idxH(headers, ["fee"]);
    // Exact match to avoid "Account Type" column being matched instead of "Type"
    const iType = headers.findIndex((h) => h === "type");
    const account = fileType === "account_funding" ? "funding" : "trading";
    const deposits: Deposit[] = [];
    const withdrawals: Withdrawal[] = [];
    const transfers: InternalTransfer[] = [];
    for (const row of dataRows) {
      const type = String(row[iType] ?? "").trim();
      const side = String(row[iSide] ?? "").trim().toLowerCase();
      const executedAt = parseKucoinTime(String(row[iTime] ?? ""));
      const coin = String(row[iCurrency] ?? "").trim().toUpperCase();
      const rawAmount = parseFloat(String(row[iAmount] ?? "")) || 0;
      const amount = Math.abs(rawAmount);
      const fee = parseFloat(String(row[iFee] ?? "")) || 0;
      if (!executedAt || !coin || amount === 0) { skipped++; continue; }
      const key = `${executedAt}:${coin}:${amount}`;
      if (type === "Deposit" && side === "deposit" && account === "funding") {
        deposits.push({ hash: `acct-deposit:${key}`, coin, amount, fee, address: "", network: "", executedAt });
      } else if (type === "Withdraw" && side === "withdrawal" && account === "funding") {
        withdrawals.push({ hash: `acct-withdraw:${key}`, coin, amount, fee, address: "", network: "", executedAt });
      } else if (type === "Transfer") {
        transfers.push({ transferId: `acct-transfer-${account}:${key}`, account, coin, amount, fee, executedAt });
      } else {
        skipped++;
      }
    }
    return { ...empty, deposits, withdrawals, transfers, skipped };
  }

  return empty;
}

const SLOTS: { type: FileType; label: string; hint: string }[] = [
  { type: "convert", label: "Convert Orders_Filled Orders", hint: "conversions instantanées" },
  { type: "spot", label: "Spot Orders_Filled Orders", hint: "trades spot" },
  { type: "deposit", label: "Deposit_Withdrawal History_Deposit History", hint: "dépôts on-chain (avec hash)" },
  { type: "withdrawal", label: "Deposit_Withdrawal History_Withdrawal History", hint: "retraits on-chain (avec hash)" },
  { type: "account_funding", label: "Account History_Funding Account", hint: "dépôts, retraits et transferts" },
  { type: "account_trading", label: "Account History_Trading Account", hint: "transferts entre comptes" },
];

function slotCount(type: FileType, result: ParseResult): number {
  if (type === "convert") return result.converts.length;
  if (type === "spot") return result.spotTrades.length;
  if (type === "deposit") return result.deposits.length;
  if (type === "withdrawal") return result.withdrawals.length;
  if (type === "account_funding") return result.deposits.length + result.withdrawals.length + result.transfers.length;
  if (type === "account_trading") return result.transfers.length;
  return 0;
}

function slotHint(type: FileType, result: ParseResult): string {
  if (type === "account_funding") {
    const deps = result.deposits.filter(d => d.hash.startsWith("acct-deposit:"));
    const wths = result.withdrawals.filter(w => w.hash.startsWith("acct-withdraw:"));
    const trfs = result.transfers.filter(t => t.transferId.startsWith("acct-transfer-funding:"));
    const parts = [];
    if (deps.length > 0) parts.push(`${deps.length} dépôt${deps.length > 1 ? "s" : ""}`);
    if (wths.length > 0) parts.push(`${wths.length} retrait${wths.length > 1 ? "s" : ""}`);
    if (trfs.length > 0) parts.push(`${trfs.length} transfert${trfs.length > 1 ? "s" : ""}`);
    return parts.length > 0 ? parts.join(" · ") : "0 lignes";
  }
  if (type === "account_trading") {
    const trfs = result.transfers.filter(t => t.transferId.startsWith("acct-transfer-trading:"));
    return `${trfs.length} transfert${trfs.length > 1 ? "s" : ""}`;
  }
  return `${slotCount(type, result)} ligne${slotCount(type, result) > 1 ? "s" : ""}`;
}

const emptyParsed: AllParsed = { spotTrades: [], converts: [], deposits: [], withdrawals: [], transfers: [] };

export function KucoinImportDialog({ open, onOpenChange, integrationId, onSuccess }: KucoinImportDialogProps) {
  const [slots, setSlots] = useState<Record<FileType, SlotState>>({ convert: null, spot: null, deposit: null, withdrawal: null, account_funding: null, account_trading: null });
  const [parsed, setParsed] = useState<AllParsed>(emptyParsed);
  const [dragOver, setDragOver] = useState<FileType | null>(null);
  const [errors, setErrors] = useState<Record<FileType, string | null>>({ convert: null, spot: null, deposit: null, withdrawal: null, account_funding: null, account_trading: null });
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [importResult, setImportResult] = useState<{ spotInserted: number; convertsInserted: number; depositsInserted: number; withdrawalsInserted: number; transfersInserted: number } | null>(null);
  const fileRefs = useRef<Record<FileType, HTMLInputElement | null>>({ convert: null, spot: null, deposit: null, withdrawal: null, account_funding: null, account_trading: null });

  const ingestXlsx = useMutation(api.kucoin_import.ingestXlsx);

  function reset() {
    setSlots({ convert: null, spot: null, deposit: null, withdrawal: null, account_funding: null, account_trading: null });
    setParsed(emptyParsed);
    setErrors({ convert: null, spot: null, deposit: null, withdrawal: null, account_funding: null, account_trading: null });
    setSubmitting(false);
    setCompleted(false);
    setImportResult(null);
    Object.values(fileRefs.current).forEach((r) => { if (r) r.value = ""; });
  }

  const loadFile = useCallback((file: File, expectedType: FileType) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rows = parseCsv(ev.target?.result as string);

        if (rows.some((r) => r.join("").toLowerCase().includes("no matching records"))) {
          setErrors((e) => ({ ...e, [expectedType]: "Aucune donnée sur cette période." }));
          return;
        }

        const result = parseFile(expectedType, rows);
        const count = slotCount(expectedType, result);

        if (count === 0) {
          // For account history files, show unique Type values to help debug
          if (expectedType === "account_funding" || expectedType === "account_trading") {
            const headers = rows[0].map((h) => String(h ?? "").toLowerCase().trim());
            const iType = headers.findIndex((h) => h === "type");
            const uniqueTypes = iType !== -1
              ? [...new Set(rows.slice(1).map((r) => String(r[iType] ?? "").trim()).filter(Boolean))].slice(0, 5).join(", ")
              : "?";
            setErrors((e) => ({ ...e, [expectedType]: `0 lignes valides (${result.skipped} ignorées). Types trouvés : ${uniqueTypes}` }));
          } else {
            const firstRow = rows[1]?.join(" | ") ?? "vide";
            setErrors((e) => ({ ...e, [expectedType]: `0 lignes valides, ${result.skipped} skippées. Ex: ${firstRow.slice(0, 100)}` }));
          }
          return;
        }

        setErrors((e) => ({ ...e, [expectedType]: null }));
        setSlots((s) => ({ ...s, [expectedType]: { fileName: file.name, count, skipped: result.skipped } }));
        const acctPrefix = expectedType === "account_funding" ? "funding" : expectedType === "account_trading" ? "trading" : null;
        setParsed((p) => ({
          spotTrades: expectedType === "spot" ? result.spotTrades : p.spotTrades,
          converts: expectedType === "convert" ? result.converts : p.converts,
          deposits: (expectedType === "deposit" || expectedType === "account_funding") ? [...(expectedType === "account_funding" ? p.deposits.filter(d => !d.hash.startsWith("acct-deposit:")) : []), ...result.deposits] : p.deposits,
          withdrawals: (expectedType === "withdrawal" || expectedType === "account_funding") ? [...(expectedType === "account_funding" ? p.withdrawals.filter(w => !w.hash.startsWith("acct-withdraw:")) : []), ...result.withdrawals] : p.withdrawals,
          transfers: acctPrefix ? [...p.transfers.filter(t => !t.transferId.startsWith(`acct-transfer-${acctPrefix}:`)), ...result.transfers] : p.transfers,
        }));
      } catch {
        setErrors((e) => ({ ...e, [expectedType]: "Impossible de lire le fichier." }));
      }
    };
    reader.readAsText(file, "utf-8");
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>, type: FileType) {
    const file = e.target.files?.[0];
    if (file) loadFile(file, type);
  }

  function handleDrop(e: React.DragEvent, type: FileType) {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file, type);
  }

  function clearSlot(type: FileType) {
    setSlots((s) => ({ ...s, [type]: null }));
    setErrors((e) => ({ ...e, [type]: null }));
    setParsed((p) => ({
      spotTrades: type === "spot" ? [] : p.spotTrades,
      converts: type === "convert" ? [] : p.converts,
      deposits: type === "deposit" ? [] : type === "account_funding" ? p.deposits.filter(d => !d.hash.startsWith("acct-deposit:")) : p.deposits,
      withdrawals: type === "withdrawal" ? [] : type === "account_funding" ? p.withdrawals.filter(w => !w.hash.startsWith("acct-withdraw:")) : p.withdrawals,
      transfers: type === "account_funding" ? p.transfers.filter(t => !t.transferId.startsWith("acct-transfer-funding:"))
        : type === "account_trading" ? p.transfers.filter(t => !t.transferId.startsWith("acct-transfer-trading:"))
        : p.transfers,
    }));
    const ref = fileRefs.current[type];
    if (ref) ref.value = "";
  }

  async function handleImport() {
    setSubmitting(true);
    try {
      const result = await ingestXlsx({
        integrationId,
        spotTrades: parsed.spotTrades,
        converts: parsed.converts,
        deposits: parsed.deposits,
        withdrawals: parsed.withdrawals,
        transfers: parsed.transfers,
      });
      setImportResult(result);
      setCompleted(true);
      onSuccess?.();
      setTimeout(() => { onOpenChange(false); reset(); }, 2500);
    } catch (err) {
      setErrors((e) => ({ ...e, convert: err instanceof Error ? err.message : "Erreur lors de l'import." }));
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(val: boolean) {
    if (!val) reset();
    onOpenChange(val);
  }

  const totalRows = parsed.spotTrades.length + parsed.converts.length + parsed.deposits.length + parsed.withdrawals.length + parsed.transfers.length;
  const hasAny = totalRows > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg gap-4">
        <DialogHeader className="space-y-1">
          <DialogTitle>Importer des exports KuCoin</DialogTitle>
          <DialogDescription className="text-xs">
            KuCoin → Orders → Order Records → Export → <span className="font-medium text-foreground">choisir CSV</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {SLOTS.map(({ type, label, hint }) => {
            const slot = slots[type];
            const error = errors[type];
            const isOver = dragOver === type;

            return (
              <div key={type}>
                <label
                  htmlFor={`kucoin-csv-${type}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(type); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => handleDrop(e, type)}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                    slot ? "border-emerald-500/40 bg-emerald-500/5"
                      : isOver ? "border-primary bg-primary/5"
                      : error ? "border-destructive/40 bg-destructive/5"
                      : "border-border/60 bg-muted/20 hover:border-border hover:bg-muted/30"
                  }`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    {slot ? <FileText className="size-4 text-emerald-600 dark:text-emerald-400" /> : <Upload className="size-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{label}<span className="text-muted-foreground font-normal">.csv</span></p>
                    {slot ? (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        {slotHint(type, { spotTrades: parsed.spotTrades, converts: parsed.converts, deposits: parsed.deposits, withdrawals: parsed.withdrawals, transfers: parsed.transfers, skipped: slot.skipped })}
                        {slot.skipped > 0 ? ` · ${slot.skipped} ignorée${slot.skipped > 1 ? "s" : ""}` : ""}
                      </p>
                    ) : error ? (
                      <p className="text-xs text-destructive truncate">{error}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">{hint}</p>
                    )}
                  </div>
                  {slot && (
                    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); clearSlot(type); }} className="shrink-0 text-muted-foreground hover:text-foreground">
                      <X className="size-3.5" />
                    </button>
                  )}
                  <input id={`kucoin-csv-${type}`} ref={(el) => { fileRefs.current[type] = el; }} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => handleFileChange(e, type)} />
                </label>
              </div>
            );
          })}
        </div>

        {completed && importResult && (
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm space-y-1">
            <p className="font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-2"><Check className="size-4" /> Import réussi</p>
            {importResult.spotInserted > 0 && <p className="text-emerald-700 dark:text-emerald-400 text-xs">{importResult.spotInserted} spot trade{importResult.spotInserted > 1 ? "s" : ""}</p>}
            {importResult.convertsInserted > 0 && <p className="text-emerald-700 dark:text-emerald-400 text-xs">{importResult.convertsInserted} convert{importResult.convertsInserted > 1 ? "s" : ""}</p>}
            {importResult.depositsInserted > 0 && <p className="text-emerald-700 dark:text-emerald-400 text-xs">{importResult.depositsInserted} dépôt{importResult.depositsInserted > 1 ? "s" : ""}</p>}
            {importResult.withdrawalsInserted > 0 && <p className="text-emerald-700 dark:text-emerald-400 text-xs">{importResult.withdrawalsInserted} retrait{importResult.withdrawalsInserted > 1 ? "s" : ""}</p>}
            {importResult.transfersInserted > 0 && <p className="text-emerald-700 dark:text-emerald-400 text-xs">{importResult.transfersInserted} transfert{importResult.transfersInserted > 1 ? "s" : ""} entre comptes</p>}
          </div>
        )}

        {Object.values(errors).some((e) => e) && !completed && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-start gap-2">
            <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
            {Object.values(errors).find((e) => e)}
          </div>
        )}

        <DialogFooter className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={submitting} className="h-9 text-sm cursor-pointer">Annuler</Button>
          <Button type="button" disabled={!hasAny || submitting || completed} onClick={handleImport} className="h-9 min-w-[140px] text-sm cursor-pointer">
            {submitting ? <span className="flex items-center gap-1.5"><LoaderCircle className="size-3.5 animate-spin" />Import…</span>
              : completed ? <span className="flex items-center gap-1.5"><Check className="size-3.5" />Importé</span>
              : `Importer${hasAny ? ` (${totalRows})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
