"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Check, LoaderCircle, Eye, EyeOff, ShieldCheck, Upload, FileText, AlertCircle } from "lucide-react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/convex/_generated/api";
import { isConvexConfigured } from "@/convex/client";

// ─── Bitstack CSV parser ───────────────────────────────────────────────────

type BitstackTrade = { externalId: string; executedAt: number; fromAsset: string; fromAmount: number; toAsset: string; toAmount: number; fee?: number; feeAsset?: string; price?: number };
type BitstackDeposit = { externalId: string; executedAt: number; fiatCurrency: string; fiatAmount: number };

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
      fields.push(field.trim()); field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field.trim());
  return fields;
}

function parseBitstackCsv(text: string): { trades: BitstackTrade[]; deposits: BitstackDeposit[]; skipped: number } {
  const bom = "﻿";
  const content = text.startsWith(bom) ? text.slice(1) : text;
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { trades: [], deposits: [], skipped: 0 };

  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = parseCsvLine(lines[0], sep).map((h) => h.toLowerCase().trim());

  const idx = (...candidates: string[]) => {
    for (const c of candidates) {
      const i = headers.findIndex((h) => h.includes(c));
      if (i !== -1) return i;
    }
    return -1;
  };

  const iType = idx("type");
  const iDate = idx("date");
  const iAmountIn = idx("montant reçu", "montant rec");
  const iAssetIn = idx("monnaie ou jeton reçu", "jeton reçu", "monnaie ou jeton rec");
  const iAmountOut = idx("montant envoyé", "montant envoye");
  const iAssetOut = idx("monnaie ou jeton envoyé", "monnaie ou jeton envoye", "jeton envoyé");
  const iFee = idx("frais");
  const iFeeCurrency = idx("monnaie ou jeton des frais", "jeton des frais");
  const iPrice = idx("prix du jeton du montant reçu", "prix du jeton du montant");
  const iExternalId = idx("id externe", "id_externe", "external");

  const trades: BitstackTrade[] = [];
  const deposits: BitstackDeposit[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], sep);
    const type = (iType !== -1 ? cols[iType] : "").toLowerCase();
    const dateRaw = (iDate !== -1 ? cols[iDate] : "").replace(/GMT$/i, "Z").replace(/UTC$/i, "Z").trim();
    const executedAt = Date.parse(dateRaw);
    if (isNaN(executedAt)) { skipped++; continue; }

    const externalId = iExternalId !== -1 && cols[iExternalId] ? cols[iExternalId] : `row-${i}`;
    const toAmount = parseFloat((iAmountIn !== -1 ? cols[iAmountIn] : "").replace(",", ".")) || 0;
    const toAsset = (iAssetIn !== -1 ? cols[iAssetIn] : "").toUpperCase();
    const fromAmount = parseFloat((iAmountOut !== -1 ? cols[iAmountOut] : "").replace(",", ".")) || 0;
    const fromAsset = (iAssetOut !== -1 ? cols[iAssetOut] : "").toUpperCase();

    if (type === "échange" || type === "echange" || type === "exchange") {
      if (!toAsset || !fromAsset || toAmount === 0) { skipped++; continue; }
      const fee = iFee !== -1 ? parseFloat(cols[iFee].replace(",", ".")) || undefined : undefined;
      const feeAsset = iFeeCurrency !== -1 ? cols[iFeeCurrency].toUpperCase() || undefined : undefined;
      const price = iPrice !== -1 ? parseFloat(cols[iPrice].replace(",", ".")) || undefined : undefined;
      trades.push({ externalId, executedAt, fromAsset, fromAmount, toAsset, toAmount, fee: fee && fee > 0 ? fee : undefined, feeAsset, price });
    } else if (type === "dépôt" || type === "depot" || type === "deposit") {
      if (toAmount === 0) { skipped++; continue; }
      deposits.push({ externalId, executedAt, fiatCurrency: toAsset || "EUR", fiatAmount: toAmount });
    } else {
      skipped++;
    }
  }

  return { trades, deposits, skipped };
}

// ───────────────────────────────────────────────────────────────────────────

type ConnectProviderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ProviderConfig = {
  value: string;
  label: string;
  description: string;
  iconUrl: string;
  disabled?: boolean;
  fileImport?: boolean;
  fields: Array<{
    name: "apiKey" | "apiSecret" | "address";
    label: string;
    placeholder: string;
    helper?: string;
    secret?: boolean;
  }>;
};

const providerConfigs: ProviderConfig[] = [
  {
    value: "binance",
    label: "Binance (API)",
    description: "Connexion par clé API avec permissions lecture seule.",
    iconUrl: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/270.png",
    fields: [
      {
        name: "apiKey",
        label: "API Key",
        placeholder: "Ex: aBcD1234...",
        helper: "Depuis Binance > Gestion API > Créer une clé.",
      },
      {
        name: "apiSecret",
        label: "API Secret",
        placeholder: "Ex: zYxW9876...",
        helper: "Copiez ce secret une seule fois, il est chiffré immédiatement côté serveur.",
        secret: true,
      },
    ],
  },
  {
    value: "kaspa",
    label: "Kaspa (wallet)",
    description: "Connexion par adresse publique Kaspa.",
    iconUrl: "https://s2.coinmarketcap.com/static/img/coins/64x64/20396.png",
    fields: [
      {
        name: "address",
        label: "Adresse Kaspa",
        placeholder: "kaspa:qr...",
        helper: "Adresse publique — aucune clé privée requise.",
      },
    ],
  },
  {
    value: "ethereum",
    label: "Ethereum (wallet)",
    description: "Connexion par adresse publique Ethereum.",
    iconUrl: "https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png",
    fields: [
      {
        name: "address" as const,
        label: "Adresse Ethereum",
        placeholder: "0x...",
        helper: "Adresse publique — aucune clé privée requise.",
      },
    ],
  },
  {
    value: "solana",
    label: "Solana (wallet)",
    description: "Connexion par adresse publique Solana.",
    iconUrl: "https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png",
    fields: [
      {
        name: "address" as const,
        label: "Adresse Solana",
        placeholder: "Ex: 5YNmS...",
        helper: "Adresse publique — aucune clé privée requise.",
      },
    ],
  },
  {
    value: "bitcoin",
    label: "Bitcoin (wallet)",
    description: "Connexion par adresse publique Bitcoin.",
    iconUrl: "https://s2.coinmarketcap.com/static/img/coins/64x64/1.png",
    fields: [
      {
        name: "address" as const,
        label: "Adresse Bitcoin",
        placeholder: "Ex: bc1q... ou 1A1z...",
        helper: "Adresse publique — aucune clé privée requise.",
      },
    ],
  },
  {
    value: "bitstack",
    label: "Bitstack (CSV)",
    description: "Importez votre historique via un export CSV.",
    iconUrl: "https://bitcoin.fr/wp-content/uploads/2022/05/Bitstack.jpg",
    fileImport: true,
    fields: [],
  },
  {
    value: "kucoin",
    label: "KuCoin (bientôt)",
    description: "Support en cours de préparation.",
    iconUrl: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/311.png",
    disabled: true,
    fields: [],
  },
];

export function ConnectProviderDialog(props: ConnectProviderDialogProps) {
  if (!isConvexConfigured) {
    return <ConnectProviderDialogPlaceholder {...props} />;
  }
  return <ConnectProviderDialogInner {...props} />;
}

function ConnectProviderDialogInner({ open, onOpenChange }: ConnectProviderDialogProps) {
  const [provider, setProvider] = useState<ProviderConfig>(providerConfigs[0]);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [address, setAddress] = useState("");
  const [readOnly, setReadOnly] = useState(true);
  const [label, setLabel] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  // Bitstack CSV import state
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvParsed, setCsvParsed] = useState<{ trades: BitstackTrade[]; deposits: BitstackDeposit[]; skipped: number } | null>(null);
  const [csvImportResult, setCsvImportResult] = useState<{ tradesInserted: number; depositsInserted: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const upsertIntegration = useMutation(api.integrations.upsert);
  const ingestBitstackCsv = useMutation(api.bitstack.ingestCsv);

  useEffect(() => {
    if (!open) {
      setApiKey("");
      setApiSecret("");
      setAddress("");
      setReadOnly(true);
      setLabel("");
      setShowSecret(false);
      setError(null);
      setCompleted(false);
      setProvider(providerConfigs[0]);
      setCsvFileName(null);
      setCsvParsed(null);
      setCsvImportResult(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [open]);

  const maskedProviderLabel = useMemo(() => provider.label.replace(/\(.*\)/, "").trim(), [provider.label]);

  function loadCsvFile(file: File) {
    setCsvFileName(file.name);
    setCsvParsed(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const result = parseBitstackCsv(ev.target?.result as string);
        if (result.trades.length === 0 && result.deposits.length === 0) {
          setError("Aucune transaction reconnue. Vérifiez que c'est bien un export Bitstack CSV.");
        } else {
          setCsvParsed(result);
        }
      } catch {
        setError("Impossible de lire le fichier CSV.");
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    loadCsvFile(file);
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
    if (file) loadCsvFile(file);
  }


  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (provider.disabled) {
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      if (provider.fileImport && csvParsed) {
        const result = await ingestBitstackCsv({
          trades: csvParsed.trades,
          deposits: csvParsed.deposits,
          displayName: label.trim() || "Bitstack",
        });
        setCsvImportResult({ tradesInserted: result.tradesInserted, depositsInserted: result.depositsInserted });
        setCompleted(true);
        setTimeout(() => {
          onOpenChange(false);
        }, 1500);
        return;
      }

      const usesAddress = provider.fields.some((f) => f.name === "address");
      const finalApiKey = usesAddress ? address : apiKey;
      const finalApiSecret = usesAddress ? undefined : apiSecret;

      await upsertIntegration({
        provider: provider.value,
        apiKey: finalApiKey,
        apiSecret: finalApiSecret,
        readOnly,
        displayName: label ? label.trim() : undefined,
      });
      setCompleted(true);
      setTimeout(() => {
        onOpenChange(false);
      }, 900);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Impossible d&apos;enregistrer la connexion.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-4">
        <DialogHeader className="space-y-1">
          <DialogTitle>Connecter une plateforme</DialogTitle>
          <DialogDescription className="text-xs">
            Saisissez les identifiants pour activer la synchronisation.
          </DialogDescription>
        </DialogHeader>

        {/* Rassurance sécurité */}
        {!provider.fileImport && (
          <div className="flex items-start gap-2.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            <span className="leading-snug">
              Accès <span className="font-semibold">lecture seule</span> — aucun ordre ne peut être passé.
              Vos clés sont chiffrées immédiatement côté serveur.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="provider" className="text-sm">Plateforme</Label>
            <Select
              value={provider.value}
              onValueChange={(value) => {
                const next = providerConfigs.find((config) => config.value === value);
                if (next) {
                  setProvider(next);
                  setShowSecret(false);
                }
              }}
            >
              <SelectTrigger id="provider" className="h-10">
                <SelectValue placeholder="Choisir un provider" />
              </SelectTrigger>
              <SelectContent>
                {providerConfigs.map((config) => (
                  <SelectItem key={config.value} value={config.value} disabled={config.disabled}>
                    <div className="flex items-center gap-2.5">
                      <div className="size-6 rounded-full overflow-hidden bg-muted border border-border shrink-0 relative flex items-center justify-center">
                        {config.iconUrl ? (
                          <Image
                            src={config.iconUrl}
                            alt=""
                            fill
                            sizes="24px"
                            className="object-cover"
                          />
                        ) : (
                          <FileText className="size-3.5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5 text-left">
                        <span className="text-sm">{config.label}</span>
                        <span className="text-xs text-muted-foreground">{config.description}</span>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!provider.disabled ? (
            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="label" className="text-sm">Nom interne <span className="text-muted-foreground font-normal">(optionnel)</span></Label>
                <Input
                  id="label"
                  placeholder={`Ex: ${maskedProviderLabel} - Mandat #42`}
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  className="h-9 text-sm"
                />
                <p className="text-[11px] text-muted-foreground leading-tight">
                  Visible uniquement dans Termenva pour distinguer vos connexions.
                </p>
              </div>

              {provider.fileImport ? (
                <div className="space-y-3">
                  <label
                    htmlFor="bitstack-csv-connect"
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                      "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-6 cursor-pointer transition-colors",
                      isDragging
                        ? "border-primary bg-primary/10"
                        : "border-border/60 bg-muted/30 hover:border-border hover:bg-muted/50"
                    )}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                      {csvFileName ? <FileText className="size-4 text-muted-foreground" /> : <Upload className="size-4 text-muted-foreground" />}
                    </div>
                    {csvFileName ? (
                      <p className="text-sm font-medium text-foreground">{csvFileName}</p>
                    ) : (
                      <div className="text-center">
                        <p className="text-sm font-medium">Sélectionner un export CSV Bitstack</p>
                        <p className="text-xs text-muted-foreground">Paramètres Bitstack → Exporter l'historique</p>
                      </div>
                    )}
                    <input
                      id="bitstack-csv-connect"
                      ref={fileRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="sr-only"
                      onChange={handleCsvFile}
                    />
                  </label>

                  {csvParsed && !completed && (
                    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2.5 text-xs space-y-1">
                      <p className="font-medium text-foreground">Aperçu</p>
                      <p className="text-muted-foreground">{csvParsed.trades.length} achat{csvParsed.trades.length > 1 ? "s" : ""} par carte</p>
                      <p className="text-muted-foreground">{csvParsed.deposits.length} dépôt{csvParsed.deposits.length > 1 ? "s" : ""} fiat</p>
                      {csvParsed.skipped > 0 && <p className="text-amber-600 dark:text-amber-500">{csvParsed.skipped} ligne{csvParsed.skipped > 1 ? "s" : ""} ignorée{csvParsed.skipped > 1 ? "s" : ""}</p>}
                    </div>
                  )}

                  {completed && csvImportResult && (
                    <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                      <p className="font-semibold flex items-center gap-1.5"><Check className="size-3.5" />Import réussi</p>
                      <p>{csvImportResult.tradesInserted} achat{csvImportResult.tradesInserted > 1 ? "s" : ""} · {csvImportResult.depositsInserted} dépôt{csvImportResult.depositsInserted > 1 ? "s" : ""} ajouté{csvImportResult.tradesInserted + csvImportResult.depositsInserted > 1 ? "s" : ""}</p>
                    </div>
                  )}
                </div>
              ) : (
                provider.fields.map((field) => {
                  const value =
                    field.name === "apiKey" ? apiKey : field.name === "apiSecret" ? apiSecret : address;
                  const setValue =
                    field.name === "apiKey"
                      ? setApiKey
                      : field.name === "apiSecret"
                      ? setApiSecret
                      : setAddress;
                  const isSecret = field.secret === true;
                  const inputType = isSecret && !showSecret ? "password" : "text";
                  return (
                    <div className="space-y-1.5" key={field.name}>
                      <Label htmlFor={field.name} className="text-sm">{field.label}</Label>
                      <div className="relative">
                        <Input
                          id={field.name}
                          type={inputType}
                          placeholder={field.placeholder}
                          autoComplete="off"
                          spellCheck={false}
                          value={value}
                          onChange={(event) => setValue(event.target.value)}
                          className={cn("h-9 text-sm font-mono", isSecret && "pr-10")}
                          required
                        />
                        {isSecret && value && (
                          <button
                            type="button"
                            onClick={() => setShowSecret((v) => !v)}
                            aria-label={showSecret ? "Masquer le secret" : "Afficher le secret"}
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
                          >
                            {showSecret ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                          </button>
                        )}
                      </div>
                      {field.helper ? <p className="text-[11px] text-muted-foreground leading-tight">{field.helper}</p> : null}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground text-center">
              Cette intégration sera disponible très bientôt.
              <br />
              Restez informé dans notre changelog.
            </div>
          )}

          {error ? (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
              {error}
            </div>
          ) : null}

          <DialogFooter className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting} className="h-9 text-sm cursor-pointer">
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={
                submitting ||
                provider.disabled ||
                (provider.fileImport
                  ? !csvParsed
                  : provider.fields.some((f) => f.name === "address") ? !address : !apiKey || !apiSecret)
              }
              className="h-9 min-w-[140px] text-sm cursor-pointer"
            >
              {submitting ? (
                <span className="flex items-center gap-1.5">
                  <LoaderCircle className="size-3.5 animate-spin" />
                  Connexion…
                </span>
              ) : completed ? (
                <span className="flex items-center gap-1.5">
                  <Check className="size-3.5" />
                  {provider.fileImport ? "Importé" : "Ajouté"}
                </span>
              ) : (
                provider.fileImport ? "Importer" : "Connecter"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConnectProviderDialogPlaceholder({ open, onOpenChange }: ConnectProviderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Intégrations indisponibles</DialogTitle>
          <DialogDescription>
            Configurez `NEXT_PUBLIC_CONVEX_URL` et déployez Convex pour activer la connexion des plateformes dans
            Termenva.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Ajoutez votre URL Convex dans les variables d&apos;environnement (local et Vercel), relancez le déploiement,
            puis ouvrez à nouveau ce formulaire pour saisir vos clés API Binance.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Compris
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
