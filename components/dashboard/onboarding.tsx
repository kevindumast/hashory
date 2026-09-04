"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check, FileText, Plug, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlowCard, Magnetic, Reveal } from "@/components/motion";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";
import { useProviderDialog } from "@/components/dashboard/provider-dialog-context";
import { cn } from "@/lib/utils";

const QUICK_PROVIDERS = [
  { id: "binance", label: "Binance", kind: "API", icon: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/270.png" },
  { id: "kucoin", label: "KuCoin", kind: "API", icon: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/311.png" },
  { id: "bitcoin", label: "Bitcoin", kind: "Wallet", icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/1.png" },
  { id: "ethereum", label: "Ethereum", kind: "Wallet", icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png" },
  { id: "solana", label: "Solana", kind: "Wallet", icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png" },
  { id: "kaspa", label: "Kaspa", kind: "Wallet", icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/20396.png" },
];

const TAX_VISITED_KEY = "hashory:onboarding:tax-seen";

/** Étapes d'activation, déduites des données réelles du compte. */
export function useOnboardingSteps() {
  const { integrationsCount, transactions, portfolioTokens } = useDashboardData();
  const [taxSeen, setTaxSeen] = useState(false);

  useEffect(() => {
    try {
      setTaxSeen(window.localStorage.getItem(TAX_VISITED_KEY) === "true");
    } catch {
      /* ignore */
    }
  }, []);

  const steps = [
    {
      id: "connect",
      index: "01",
      label: "Connecter une plateforme",
      description: "Un exchange en lecture seule ou l'adresse publique d'un wallet.",
      done: integrationsCount > 0,
      href: null,
      icon: Plug,
    },
    {
      id: "sync",
      index: "02",
      label: "Lancer la première synchronisation",
      description: "Hashory récupère vos trades, dépôts et retraits historiques.",
      done: transactions.length > 0,
      href: "/dashboard/accounts",
      icon: RefreshCw,
    },
    {
      id: "explore",
      index: "03",
      label: "Explorer votre performance",
      description: "P&L par actif, répartition et historique de votre portefeuille.",
      done: portfolioTokens.length > 0,
      href: "/dashboard",
      icon: Sparkles,
    },
    {
      id: "tax",
      index: "04",
      label: "Générer votre déclaration fiscale",
      description: "Plus-values calculées selon l'article 150 VH bis du CGI.",
      done: taxSeen,
      href: "/dashboard/tax-report",
      icon: FileText,
    },
  ];

  const completed = steps.filter((step) => step.done).length;
  return { steps, completed, total: steps.length, isComplete: completed === steps.length };
}

/** Marque l'étape « déclaration fiscale » comme vue. */
export function markTaxStepSeen() {
  try {
    window.localStorage.setItem(TAX_VISITED_KEY, "true");
  } catch {
    /* ignore */
  }
}

/**
 * Marqueur invisible : monté sur la page de déclaration fiscale, il valide
 * la dernière étape d'activation dès la première visite.
 */
export function TaxStepTracker() {
  useEffect(() => {
    markTaxStepSeen();
  }, []);
  return null;
}

/**
 * Écran de premier lancement — remplace le dashboard vide par une seule
 * action claire tant qu'aucune plateforme n'est connectée.
 */
export function OnboardingHero() {
  const { openDialog } = useProviderDialog();

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-16 md:py-24">
      <Reveal>
        <p className="num flex items-center gap-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          <span className="h-px w-6 bg-primary" />
          Première étape
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h1 className="mt-6 max-w-2xl text-balance font-serif text-4xl font-normal leading-[1.02] text-foreground sm:text-5xl">
          Connectez votre première plateforme.
        </h1>
        <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Dès la première connexion, Hashory reconstitue votre historique complet et calcule
          votre performance réelle. Comptez moins de deux minutes.
        </p>
      </Reveal>

      <Reveal delay={160} className="mt-12">
        <p className="num border-b border-border/60 pb-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground/60">
          Sources disponibles
        </p>
        <div className="grid border-b border-border/60 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_PROVIDERS.map((provider) => (
            <GlowCard key={provider.id} className="border-b border-border/60 last:border-b-0 sm:last:border-b">
              <button
                type="button"
                onClick={openDialog}
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/20"
              >
                <Image
                  src={provider.icon}
                  alt=""
                  width={24}
                  height={24}
                  className="size-6 shrink-0 rounded-full"
                  unoptimized
                />
                <span className="flex-1 text-sm text-foreground">{provider.label}</span>
                <span className="num text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
                  {provider.kind}
                </span>
              </button>
            </GlowCard>
          ))}
        </div>
      </Reveal>

      <Reveal delay={240} className="mt-10 flex flex-wrap items-center gap-4">
        <Magnetic strength={8}>
          <Button size="lg" onClick={openDialog} className="cursor-pointer px-7">
            <Plug className="mr-2 size-4" />
            Connecter une plateforme
          </Button>
        </Magnetic>
        <p className="num text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
          Lecture seule · Clés chiffrées · Aucun accès à vos fonds
        </p>
      </Reveal>

      <Reveal delay={320} className="mt-14 border-t border-border/60 pt-6">
        <p className="num text-[10px] uppercase tracking-[0.24em] text-muted-foreground/60">
          Pas de clé API sous la main ?
        </p>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Importez un export CSV depuis Bitstack, Finary ou KuCoin — l&apos;historique est
          reconstruit à l&apos;identique, transaction par transaction.
        </p>
        <Button asChild variant="link" size="sm" className="mt-2 h-auto p-0">
          <Link href="/dashboard/accounts">
            Importer un fichier
            <ArrowRight className="ml-1 size-3.5" />
          </Link>
        </Button>
      </Reveal>
    </div>
  );
}

/**
 * Checklist de progression affichée tant que l'activation n'est pas terminée.
 * Elle disparaît d'elle-même une fois les quatre étapes franchies.
 */
export function OnboardingChecklist({ className }: { className?: string }) {
  const { steps, completed, total, isComplete } = useOnboardingSteps();
  const { openDialog } = useProviderDialog();
  const [dismissed, setDismissed] = useState(false);

  if (isComplete || dismissed) return null;

  return (
    <section
      className={cn("border-y border-border/60 py-5", className)}
      aria-label="Progression de la configuration"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="num text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          Configuration ·{" "}
          <span className="text-primary">
            {completed}/{total}
          </span>{" "}
          terminé
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="num cursor-pointer text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          Masquer
        </button>
      </div>

      {/* Jauge en filet : une règle pleine sur une règle vide. */}
      <div className="mt-3 h-px w-full bg-border" role="presentation">
        <div
          className="h-px bg-primary transition-[width] duration-500"
          style={{ width: `${(completed / total) * 100}%` }}
        />
      </div>

      <ul className="mt-4 grid gap-x-8 sm:grid-cols-2">
        {steps.map((step) => {
          const Icon = step.icon;
          const content = (
            <>
              <span
                className={cn(
                  "num shrink-0 text-[10px]",
                  step.done ? "text-positive" : "text-muted-foreground/50"
                )}
              >
                {step.done ? <Check className="size-3.5" /> : step.index}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-xs",
                    step.done ? "text-muted-foreground/60 line-through" : "text-foreground"
                  )}
                >
                  {step.label}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground/70">
                  {step.description}
                </span>
              </span>
              {!step.done && (
                <Icon className="size-3.5 shrink-0 text-muted-foreground/40" aria-hidden="true" />
              )}
            </>
          );

          const rowClasses =
            "flex items-start gap-3 border-b border-border/40 py-3 text-left transition-colors";

          if (step.done) {
            return (
              <li key={step.id} className={rowClasses}>
                {content}
              </li>
            );
          }

          return (
            <li key={step.id}>
              {step.href ? (
                <Link href={step.href} className={cn(rowClasses, "w-full hover:bg-muted/20")}>
                  {content}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={openDialog}
                  className={cn(rowClasses, "w-full cursor-pointer hover:bg-muted/20")}
                >
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
