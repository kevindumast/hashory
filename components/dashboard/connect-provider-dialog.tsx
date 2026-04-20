"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { Check, LoaderCircle, Eye, EyeOff, ShieldCheck } from "lucide-react";
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
    iconUrl: "",
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
    iconUrl: "",
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
    iconUrl: "",
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
    iconUrl: "",
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
    iconUrl: "",
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
    value: "kucoin",
    label: "KuCoin (bientôt)",
    description: "Support en cours de préparation.",
    iconUrl: "",
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

  const upsertIntegration = useMutation(api.integrations.upsert);

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
    }
  }, [open]);

  const maskedProviderLabel = useMemo(() => provider.label.replace(/\(.*\)/, "").trim(), [provider.label]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (provider.disabled) {
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
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
        <div className="flex items-start gap-2.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          <span className="leading-snug">
            Accès <span className="font-semibold">lecture seule</span> — aucun ordre ne peut être passé.
            Vos clés sont chiffrées immédiatement côté serveur.
          </span>
        </div>

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
                      <div className="size-6 rounded-full overflow-hidden bg-muted border border-border shrink-0 relative">
                        <Image
                          src={config.iconUrl}
                          alt=""
                          fill
                          sizes="24px"
                          className="object-cover"
                        />
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

              {provider.fields.map((field) => {
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
              })}
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
                (provider.fields.some((f) => f.name === "address") ? !address : !apiKey || !apiSecret)
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
                  Ajouté
                </span>
              ) : (
                "Connecter"
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
