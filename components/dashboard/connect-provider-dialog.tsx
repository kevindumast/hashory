"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { Check, LoaderCircle } from "lucide-react";
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
  disabled?: boolean;
  fields: Array<{
    name: "apiKey" | "apiSecret";
    label: string;
    placeholder: string;
    helper?: string;
  }>;
};

const providerConfigs: ProviderConfig[] = [
  {
    value: "binance",
    label: "Binance (API)",
    description: "Connexion par clé API avec permissions lecture seule.",
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
      },
    ],
  },
  {
    value: "kucoin",
    label: "KuCoin (bientôt)",
    description: "Support en cours de préparation.",
    disabled: true,
    fields: [],
  },
  {
    value: "wallet",
    label: "Wallet (adresse)",
    description: "Connexion par adresse publique (prochainement).",
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
  const [readOnly, setReadOnly] = useState(true);
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const upsertIntegration = useMutation(api.integrations.upsert);

  useEffect(() => {
    if (!open) {
      setApiKey("");
      setApiSecret("");
      setReadOnly(true);
      setLabel("");
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
      await upsertIntegration({
        provider: provider.value,
        apiKey,
        apiSecret,
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
      <DialogContent className="max-w-md gap-4 bg-background/95">
        <DialogHeader className="space-y-1">
          <DialogTitle>Connecter une plateforme</DialogTitle>
          <DialogDescription className="text-xs">
            Saisissez les identifiants pour activer la synchronisation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="provider" className="text-sm">Plateforme</Label>
            <Select
              value={provider.value}
              onValueChange={(value) => {
                const next = providerConfigs.find((config) => config.value === value);
                if (next) {
                  setProvider(next);
                }
              }}
            >
              <SelectTrigger id="provider" className="h-9">
                <SelectValue placeholder="Choisir un provider" />
              </SelectTrigger>
              <SelectContent>
                {providerConfigs.map((config) => (
                  <SelectItem key={config.value} value={config.value} disabled={config.disabled}>
                    <div className="flex flex-col gap-0.5">
                      <span>{config.label}</span>
                      <span className="text-xs text-muted-foreground">{config.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!provider.disabled ? (
            <>
              <div className="grid gap-2.5">
                <div className="space-y-1">
                  <Label htmlFor="label" className="text-sm">Nom interne (optionnel)</Label>
                  <Input
                    id="label"
                    placeholder={`Ex: ${maskedProviderLabel} - Mandat #42`}
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    className="h-8 text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    Visible uniquement dans Oracly pour distinguer vos connexions.
                  </p>
                </div>

                {provider.fields.map((field) => (
                  <div className="space-y-1" key={field.name}>
                    <Label htmlFor={field.name} className="text-sm">{field.label}</Label>
                    <Input
                      id={field.name}
                      placeholder={field.placeholder}
                      autoComplete="off"
                      value={field.name === "apiKey" ? apiKey : apiSecret}
                      onChange={(event) =>
                        field.name === "apiKey" ? setApiKey(event.target.value) : setApiSecret(event.target.value)
                      }
                      className="h-8 text-sm"
                      required
                    />
                    {field.helper ? <p className="text-[11px] text-muted-foreground leading-tight">{field.helper}</p> : null}
                  </div>
                ))}
              </div>

            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border/60 bg-muted/30 p-6 text-sm text-muted-foreground">
              Cette intégration sera disponible très bientôt. Restez informé dans notre changelog.
            </div>
          )}


          {error ? (
            <div className="rounded-md border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-500">{error}</div>
          ) : null}

          <DialogFooter className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting} className="h-8 text-sm">
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={submitting || provider.disabled || !apiKey || !apiSecret}
              className="h-8 min-w-[140px] text-sm"
            >
              {submitting ? (
                <span className="flex items-center gap-1.5">
                  <LoaderCircle className="size-3 animate-spin" />
                  Connexion...
                </span>
              ) : completed ? (
                <span className="flex items-center gap-1.5">
                  <Check className="size-3" />
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
      <DialogContent className="max-w-md bg-background/95">
        <DialogHeader>
          <DialogTitle>Intégrations indisponibles</DialogTitle>
          <DialogDescription>
            Configurez `NEXT_PUBLIC_CONVEX_URL` et déployez Convex pour activer la connexion des plateformes dans
            Oracly.
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
