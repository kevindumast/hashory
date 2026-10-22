"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowUpRight, Check, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";
import {
  DATA_PROVIDERS,
  dataProviderForSource,
  type DataProviderDefinition,
} from "@/lib/data-providers";
import { withToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Réglages des clés d'API de données de chaîne.
 *
 * Chaque utilisateur apporte ses propres clés : la lecture de ses wallets
 * consomme son crédit chez le fournisseur, et il peut la révoquer à tout
 * moment de son côté. Une clé enregistrée ne réapparaît jamais en clair —
 * on n'en montre que les derniers caractères.
 */
export function ApiKeysView() {
  const keys = useQuery(api.dataProviderKeys.list);
  const { integrations } = useDashboardData();

  // Combien de wallets de l'utilisateur dépendent de chaque fournisseur.
  const usage = new Map<string, number>();
  for (const integration of integrations) {
    const provider = dataProviderForSource(integration.provider);
    if (provider) usage.set(provider, (usage.get(provider) ?? 0) + 1);
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 md:px-9 md:py-12">
      <p className="eyebrow">Réglages</p>
      <h1 className="title mt-3 text-3xl text-foreground sm:text-4xl">Clés d&apos;API</h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
        Pour lire l&apos;historique d&apos;un wallet, Hashory interroge un service tiers. Vous
        utilisez <span className="font-bold text-foreground">votre propre clé</span> : c&apos;est
        votre crédit qui est consommé, jamais celui d&apos;un autre, et vous pouvez la révoquer à
        tout moment chez le fournisseur. Les offres gratuites suffisent pour un portefeuille
        personnel.
      </p>

      <div className="mt-6 flex items-start gap-3 rounded-2xl bg-jade-soft px-5 py-4 text-sm text-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-jade" />
        <p>
          Vos clés sont chiffrées avant d&apos;être enregistrées et ne sont jamais réaffichées.
          Elles ne servent qu&apos;à la synchronisation de vos propres wallets.
        </p>
      </div>

      <div className="mt-10 space-y-4">
        {DATA_PROVIDERS.map((provider) => (
          <ProviderKeyCard
            key={provider.id}
            provider={provider}
            saved={keys?.find((key) => key.provider === provider.id) ?? null}
            isLoading={keys === undefined}
            walletCount={usage.get(provider.id) ?? 0}
          />
        ))}
      </div>
    </div>
  );
}

type SavedKey = { provider: string; hint: string; updatedAt: number };

function ProviderKeyCard({
  provider,
  saved,
  isLoading,
  walletCount,
}: {
  provider: DataProviderDefinition;
  saved: SavedKey | null;
  isLoading: boolean;
  walletCount: number;
}) {
  const saveKey = useMutation(api.dataProviderKeys.save);
  const removeKey = useMutation(api.dataProviderKeys.remove);
  const [value, setValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Une clé manquante bloque réellement quelque chose : on le dit.
  const isBlocking = !saved && walletCount > 0;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim()) return;
    setIsSaving(true);
    const result = await withToast(() => saveKey({ provider: provider.id, key: value }), {
      loading: `Enregistrement de la clé ${provider.label}…`,
      success: `Clé ${provider.label} enregistrée`,
    });
    setIsSaving(false);
    if (result) setValue("");
  };

  const handleRemove = () =>
    withToast(() => removeKey({ provider: provider.id }), {
      loading: `Suppression de la clé ${provider.label}…`,
      success: `Clé ${provider.label} supprimée`,
    });

  return (
    <section
      className={cn(
        "rounded-2xl border bg-card p-6",
        isBlocking ? "border-violet/40" : "border-line"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">{provider.label}</h2>
            {provider.serves.map((source) => (
              <span key={source} className="chip py-0.5 text-[11px]">
                {source}
              </span>
            ))}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{provider.purpose}</p>
        </div>

        {isLoading ? null : saved ? (
          <span className="chip chip-jade">
            <Check className="h-3.5 w-3.5" />
            Configurée · <span className="num">{saved.hint}</span>
          </span>
        ) : isBlocking ? (
          <span className="chip chip-violet">
            <KeyRound className="h-3.5 w-3.5" />
            Requise pour {walletCount} wallet{walletCount > 1 ? "s" : ""}
          </span>
        ) : (
          <span className="chip">Non configurée</span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={saved ? "Remplacer par une nouvelle clé" : provider.placeholder}
          aria-label={`Clé d'API ${provider.label}`}
          className="num h-10 flex-1 rounded-full px-4"
        />
        <Button type="submit" disabled={!value.trim() || isSaving} className="h-10 px-5">
          {saved ? "Remplacer" : "Enregistrer"}
        </Button>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <a
          href={provider.signupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-bold text-violet hover:opacity-80"
        >
          Obtenir une clé gratuite
          <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
        {saved && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            className="text-muted-foreground hover:text-negative"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Supprimer la clé
          </Button>
        )}
      </div>
    </section>
  );
}
