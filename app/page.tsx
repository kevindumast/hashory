import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CircleGauge,
  LineChart,
  ShieldCheck,
  GitFork,
  Globe,
  Layers,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Code2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const techStack = ["Binance", "Bybit", "Ethereum", "Vercel", "Clerk", "Convex"];

const problems = [
  "Vos actifs dispersés sur 5 exchanges et wallets différents",
  "P&L calculé manuellement dans des tableaux Excel",
  "Impossible de voir votre exposition globale en un coup d'œil",
  "Heures perdues à consolider des données incompatibles",
];

const solutions = [
  "Vue unifiée : CEX, DEX et wallets on-chain en un seul endroit",
  "P&L automatique, historisé et décomposé par actif",
  "Exposition globale et répartition de portefeuille en temps réel",
  "Synchronisation automatique, zéro saisie manuelle",
];

const featureHighlights = [
  {
    icon: <Layers className="h-6 w-6" />,
    title: "CEX, DEX et wallets unifiés",
    description:
      "Connectez Binance, Bybit, vos wallets Ethereum, Solana, Bitcoin — et visualisez l'intégralité de vos actifs dans une interface unique et cohérente.",
  },
  {
    icon: <BarChart3 className="h-6 w-6" />,
    title: "Performance réelle, en temps réel",
    description:
      "P&L par actif, par période, ratio de Sharpe, Max Drawdown — les indicateurs qui comptent pour les traders sérieux, calculés automatiquement.",
  },
  {
    icon: <RefreshCw className="h-6 w-6" />,
    title: "Synchronisation continue, sans effort",
    description:
      "Vos données se mettent à jour automatiquement. Fini la saisie manuelle et les tableurs obsolètes — Termenva reste toujours à jour.",
  },
];

const workflow = [
  {
    step: "01",
    icon: <ShieldCheck className="h-5 w-5 text-primary" />,
    title: "Connexion sécurisée en lecture seule",
    description:
      "Connectez vos exchanges (Binance, Bybit…) via clés API en lecture seule, et vos wallets on-chain via adresse publique. Aucun accès à vos fonds.",
  },
  {
    step: "02",
    icon: <RefreshCw className="h-5 w-5 text-primary" />,
    title: "Synchronisation automatique",
    description:
      "Termenva agrège et historise l'ensemble de vos trades, dépôts, retraits et positions pour vous offrir une vue 360° complète et à jour.",
  },
  {
    step: "03",
    icon: <CircleGauge className="h-5 w-5 text-primary" />,
    title: "Visualisez et analysez",
    description:
      "Explorez votre performance globale avec des graphiques interactifs, des métriques pro et des vues par actif, par exchange ou par stratégie.",
  },
];

const metrics = [
  {
    label: "Données consolidées",
    value: "100%",
    description: "CEX, DEX et wallets on-chain — toutes vos sources en un seul endroit.",
  },
  {
    label: "Indicateurs pro",
    value: "12+",
    description: "Sharpe, Drawdown, Calmar, Win Rate… les métriques qui comptent vraiment.",
  },
  {
    label: "Pour démarrer",
    value: "<10 min",
    description: "De la connexion de votre premier exchange à votre vue portefeuille complète.",
  },
];

const testimonials = [
  {
    quote:
      "Termenva pose une base technique solide : en quelques heures nous avons livré un tableau de bord crypto complet avec synchronisation Binance.",
    author: "Alexis",
    role: "CTO",
    company: "QuantFlow",
    initials: "AL",
    color: "bg-chart-1/20 text-chart-1",
  },
  {
    quote:
      "Enfin un outil qui centralise vraiment tout — mes comptes Binance, mes wallets ETH et mes positions DeFi. La vue globale change tout.",
    author: "Maya",
    role: "Trader DeFi",
    company: "Indépendante",
    initials: "MA",
    color: "bg-chart-5/20 text-chart-5",
  },
  {
    quote:
      "J'avais l'habitude de passer des heures sur Excel chaque semaine. Maintenant j'ouvre Termenva et tout est là, en temps réel. C'est une autre époque.",
    author: "Romain",
    role: "Trader indépendant",
    company: "Freelance",
    initials: "RO",
    color: "bg-chart-2/20 text-chart-2",
  },
];

const faqItems = [
  {
    question: "Comment Termenva garantit-il la sécurité de mes données ?",
    answer:
      "Termenva ne demande que des accès en lecture seule à vos comptes d'échange. Vos clés API sont chiffrées au repos et en transit avec des protocoles de sécurité de niveau bancaire. Vos wallets on-chain sont connectés uniquement via adresse publique. Nous n'avons jamais accès à vos fonds.",
  },
  {
    question: "Quels exchanges et wallets sont supportés ?",
    answer:
      "Nous supportons actuellement Binance et Bybit côté CEX, ainsi que les wallets Ethereum, Solana et Bitcoin (adresse publique). D'autres exchanges — Coinbase, Kraken, OKX — et protocoles DeFi sont en cours d'intégration selon les retours de la communauté.",
  },
  {
    question: "Termenva est-il vraiment open source ?",
    answer:
      "Oui, totalement. Le code source de Termenva est disponible sur GitHub sous licence MIT. Vous pouvez l'auditer, le forker, contribuer ou déployer votre propre instance. La transparence est au cœur du projet.",
  },
  {
    question: "Puis-je déployer ma propre instance de Termenva ?",
    answer:
      "Absolument. Termenva est conçu pour être auto-hébergeable. Suivez le guide de déploiement dans le README pour lancer votre propre instance sur Vercel en quelques minutes, avec votre propre base Convex et vos clés Clerk.",
  },
];

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <main className="relative overflow-hidden">
      {/* Dot grid background */}
      <div
        className="pointer-events-none absolute inset-0 z-[-2] opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      {/* Top glow */}
      <div className="pointer-events-none absolute inset-x-0 top-[-8rem] z-[-1] h-[36rem] bg-gradient-to-b from-primary/20 via-primary/8 to-transparent blur-3xl" />

      {/* ─── HERO ─── */}
      <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-8 px-4 pb-20 pt-28 text-center sm:gap-10 sm:px-6 md:pt-36">
        <Badge
          variant="outline"
          className="border-primary/40 bg-primary/10 px-4 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-primary sm:text-xs"
        >
          Open source · Accès anticipé
        </Badge>

        <div className="max-w-4xl space-y-5">
          <h1 className="text-balance text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
            Tous vos actifs crypto,{" "}
            <span className="text-primary">enfin réunis en un seul terminal.</span>
          </h1>
          <p className="text-pretty text-base text-muted-foreground sm:text-xl">
            Termenva agrège vos exchanges CEX, vos wallets DEX et vos positions on-chain pour vous donner
            une vue claire, complète et en temps réel de votre portefeuille.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          <Button asChild size="lg" className="bg-primary px-8 text-primary-foreground hover:bg-primary/90">
            <Link href="/sign-up">
              Créer un compte gratuit
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="cursor-pointer border-border/60 bg-card/60 backdrop-blur hover:bg-card/90"
          >
            <Link href="/dashboard">Voir la démo</Link>
          </Button>
        </div>

        {/* Mock dashboard preview */}
        <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-2xl shadow-primary/10 backdrop-blur">
          {/* Dashboard header */}
          <div className="flex items-center justify-between border-b border-border/40 bg-background/40 px-5 py-3">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
            </div>
            <span className="text-xs text-muted-foreground/60">Termenva — Portefeuille global</span>
            <div className="w-16" />
          </div>
          {/* Source badges */}
          <div className="flex items-center gap-2 border-b border-border/30 bg-background/20 px-5 py-2.5">
            {["Binance", "Bybit", "0x7f…3a2c", "sol:9K…mR"].map((src) => (
              <span
                key={src}
                className="rounded-md border border-border/40 bg-card/60 px-2 py-0.5 text-[10px] font-mono text-muted-foreground/70"
              >
                {src}
              </span>
            ))}
            <span className="ml-auto text-[10px] text-positive">● Synchronisé</span>
          </div>
          {/* Metrics row */}
          <div className="grid grid-cols-3 gap-px bg-border/30">
            {[
              { label: "Valeur totale", value: "€48 290", delta: "+12.4%", pos: true },
              { label: "P&L du mois", value: "+€5 320", delta: "+11.0%", pos: true },
              { label: "Sharpe Ratio", value: "1.82", delta: "Excellent", pos: true },
            ].map((m) => (
              <div key={m.label} className="flex flex-col gap-1 bg-card/60 px-4 py-4">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
                  {m.label}
                </span>
                <span className="tabular-nums text-lg font-semibold text-foreground sm:text-xl">
                  {m.value}
                </span>
                <span className={`text-[11px] font-medium ${m.pos ? "text-positive" : "text-negative"}`}>
                  {m.delta}
                </span>
              </div>
            ))}
          </div>
          {/* Sparkline */}
          <div className="px-5 py-4 text-primary">
            <svg viewBox="0 0 600 80" className="w-full" aria-label="Graphique de performance du portefeuille">
              <defs>
                <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0,65 L50,58 L100,52 L150,60 L200,45 L250,38 L300,42 L350,30 L400,25 L450,18 L500,22 L550,12 L600,8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M0,65 L50,58 L100,52 L150,60 L200,45 L250,38 L300,42 L350,30 L400,25 L450,18 L500,22 L550,12 L600,8 L600,80 L0,80 Z"
                fill="url(#sparkGrad)"
              />
            </svg>
          </div>
          {/* Allocation preview */}
          <div className="mx-5 mb-5 grid grid-cols-3 gap-2">
            {[
              { asset: "BTC", pct: "42%", val: "€20 281" },
              { asset: "ETH", pct: "31%", val: "€14 969" },
              { asset: "Autres", pct: "27%", val: "€13 038" },
            ].map((a) => (
              <div key={a.asset} className="rounded-xl border border-border/40 bg-background/30 px-3 py-2.5 text-left">
                <p className="text-[10px] text-muted-foreground/70">{a.asset}</p>
                <p className="tabular-nums text-sm font-semibold text-foreground">{a.pct}</p>
                <p className="tabular-nums text-[10px] text-muted-foreground/60">{a.val}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TRUST BAR ─── */}
      <section className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6">
        <div className="flex flex-col items-center gap-5 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground/60">
            Compatible avec les plateformes que vous utilisez déjà
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-[0.7rem] font-semibold uppercase tracking-[0.25em] text-muted-foreground/50">
            {techStack.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PROBLÈME vs SOLUTION ─── */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 lg:pb-24">
        <div className="mb-12 text-center">
          <Badge variant="outline" className="mb-4 border-primary/30 bg-primary/10 text-primary">
            Pourquoi Termenva ?
          </Badge>
          <h2 className="text-balance text-3xl font-semibold text-foreground md:text-4xl">
            Arrêtez de naviguer à l&apos;aveugle.
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-negative/20 bg-negative/5 p-6 sm:p-8">
            <p className="mb-5 text-sm font-semibold uppercase tracking-widest text-negative">
              Sans Termenva
            </p>
            <ul className="space-y-4">
              {problems.map((p) => (
                <li key={p} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-negative" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 sm:p-8">
            <p className="mb-5 text-sm font-semibold uppercase tracking-widest text-primary">
              Avec Termenva
            </p>
            <ul className="space-y-4">
              {solutions.map((s) => (
                <li key={s} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section id="features" className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 lg:pb-24">
        <div className="mb-12 text-center">
          <Badge variant="outline" className="mb-4 border-primary/30 bg-primary/10 text-primary">
            Fonctionnalités
          </Badge>
          <h2 className="text-balance text-3xl font-semibold text-foreground md:text-4xl">
            Tout ce dont vous avez besoin, rien de superflu.
          </h2>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {featureHighlights.map((feature) => (
            <div
              key={feature.title}
              className="group relative flex h-full cursor-pointer flex-col gap-5 rounded-2xl border border-border/60 bg-card/70 p-6 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:bg-card/90 hover:shadow-lg hover:shadow-primary/10 sm:p-8"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 transition-colors group-hover:bg-primary/20">
                {feature.icon}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
              </div>
              <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/0 via-primary/0 to-primary/8 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            </div>
          ))}
        </div>
      </section>

      {/* ─── WORKFLOW ─── */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 lg:pb-24">
        <div className="mb-12 text-center">
          <Badge variant="outline" className="mb-4 border-primary/30 bg-primary/10 text-primary">
            Comment ça marche
          </Badge>
          <h2 className="text-balance text-3xl font-semibold text-foreground md:text-4xl">
            Connecté en 3 étapes.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground">
            Nous gérons la complexité de l&apos;agrégation pour que vous vous concentriez sur votre portefeuille.
          </p>
        </div>
        <div className="relative">
          <div className="absolute left-[2.75rem] top-12 hidden h-[calc(100%-6rem)] w-px border-l-2 border-dashed border-border/40 md:block" />
          <div className="space-y-6">
            {workflow.map((item) => (
              <div
                key={item.step}
                className="relative flex gap-6 rounded-2xl border border-border/40 bg-card/60 p-6 backdrop-blur transition-colors hover:border-primary/30"
              >
                <div className="flex shrink-0 flex-col items-center gap-2">
                  <span className="tabular-nums text-3xl font-bold text-primary">{item.step}</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                    {item.icon}
                  </div>
                </div>
                <div className="pt-1">
                  <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── METRICS ─── */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 lg:pb-24">
        <div className="grid gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/20 shadow-lg shadow-primary/5 sm:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="flex flex-col gap-3 bg-card/70 p-8 backdrop-blur">
              <span className="text-xs font-semibold uppercase tracking-widest text-primary">
                {metric.label}
              </span>
              <span className="tabular-nums text-5xl font-bold text-foreground">{metric.value}</span>
              <p className="text-sm leading-relaxed text-muted-foreground">{metric.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── OPEN SOURCE ─── */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 lg:pb-24">
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-8 backdrop-blur sm:p-10">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />
          <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground/10">
                  <Code2 className="h-5 w-5 text-foreground" />
                </div>
                <Badge variant="outline" className="border-border/60 text-muted-foreground">
                  Open Source · MIT
                </Badge>
              </div>
              <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
                Termenva est entièrement open source.
              </h2>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                Auditez le code, déployez votre propre instance, proposez des intégrations d&apos;exchanges
                ou contribuez aux fonctionnalités. Le projet avance avec la communauté.
              </p>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <GitFork className="h-4 w-4 text-primary" />
                  <span>Forkable &amp; auto-hébergeable</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span>Contributions bienvenues</span>
                </div>
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  <span>Transparence totale</span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-3">
              <Button
                asChild
                size="lg"
                variant="outline"
                className="cursor-pointer gap-2 border-border/60 bg-background/60 hover:bg-background/80"
              >
                <a
                  href="https://github.com/kevin-dumast/termenva"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  Voir sur GitHub
                </a>
              </Button>
              <p className="text-center text-xs text-muted-foreground/60">
                Lien disponible dès la mise en ligne
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIALS ─── */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 sm:pb-24">
        <div className="mb-12 text-center">
          <Badge variant="outline" className="mb-4 border-primary/30 bg-primary/10 text-primary">
            Témoignages
          </Badge>
          <h2 className="text-balance text-3xl font-semibold text-foreground md:text-4xl">
            Ils ont arrêté de jongler entre les plateformes.
          </h2>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {testimonials.map((t) => (
            <article
              key={t.author}
              className="flex h-full flex-col gap-5 rounded-2xl border border-border/60 bg-card/70 p-7"
            >
              <div className="flex gap-0.5" aria-label="5 étoiles sur 5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg key={i} viewBox="0 0 24 24" className="h-4 w-4 fill-yellow-400" aria-hidden="true">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                ))}
              </div>
              <blockquote className="flex-1 text-sm leading-relaxed text-foreground/90">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <footer className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${t.color}`}
                >
                  {t.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{t.author}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.role} · {t.company}
                  </p>
                </div>
              </footer>
            </article>
          ))}
        </div>
      </section>

      {/* ─── PRODUCT OVERVIEW ─── */}
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 pb-20 sm:px-6 md:flex-row md:items-center lg:gap-16 lg:pb-24">
        <div className="relative flex-1 overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-6 shadow-lg backdrop-blur sm:p-8">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-background opacity-60" />
          <div className="relative flex flex-col gap-6">
            <Badge variant="secondary" className="w-fit bg-primary/20 text-primary">
              Aperçu produit
            </Badge>
            <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
              Un dashboard pensé pour avoir une vision globale, pas partielle.
            </h2>
            <p className="text-sm text-muted-foreground">
              Chaque composant est conçu pour vous donner une lecture instantanée de votre portefeuille
              complet — sur tous vos exchanges et wallets.
            </p>
            <div className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
              {[
                {
                  icon: <LineChart className="mt-0.5 h-4 w-4 text-primary" />,
                  title: "Performance historique",
                  desc: "Graphiques interactifs sur vos performances dans le temps.",
                },
                {
                  icon: <CircleGauge className="mt-0.5 h-4 w-4 text-primary" />,
                  title: "Allocation globale",
                  desc: "Répartition de vos actifs sur tous vos comptes agrégés.",
                },
                {
                  icon: <Layers className="mt-0.5 h-4 w-4 text-primary" />,
                  title: "Multi-sources",
                  desc: "CEX, wallets EVM, Solana, Bitcoin — tout dans une vue.",
                },
                {
                  icon: <Activity className="mt-0.5 h-4 w-4 text-primary" />,
                  title: "Historique complet",
                  desc: "Trades, dépôts et retraits centralisés et consultables.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/40 p-4"
                >
                  {item.icon}
                  <div>
                    <h3 className="text-sm font-medium text-foreground">{item.title}</h3>
                    <p className="mt-0.5 text-xs">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-6">
          <h2 className="text-pretty text-2xl font-semibold text-foreground md:text-3xl">
            Connectez une fois. Suivez partout.
          </h2>
          <p className="text-sm text-muted-foreground">
            Nous avons simplifié l&apos;agrégation multi-sources pour que vous puissiez vous concentrer sur
            votre portefeuille, pas sur la plomberie technique.
          </p>
          <ul className="space-y-3">
            {[
              "Synchronisation automatique de vos trades",
              "Calcul P&L par actif, par période, par source",
              "Vue consolidée CEX + wallets on-chain",
              "Export CSV de votre historique complet",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm text-muted-foreground">
                <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>
          <Button asChild variant="outline" className="cursor-pointer border-border/60">
            <Link href="/dashboard">
              Explorer le dashboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="mx-auto w-full max-w-4xl px-4 pb-20 sm:px-6 sm:pb-24">
        <div className="space-y-8 text-center">
          <div>
            <Badge variant="outline" className="mb-4 border-primary/30 bg-primary/10 text-primary">
              Questions fréquentes
            </Badge>
            <h2 className="text-3xl font-semibold text-foreground">Tout ce que vous voulez savoir.</h2>
          </div>
          <Accordion type="single" collapsible className="w-full text-left">
            {faqItems.map((item, index) => (
              <AccordionItem key={index} value={`item-${index + 1}`}>
                <AccordionTrigger className="text-base font-semibold hover:no-underline">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section className="mx-auto w-full max-w-4xl px-4 pb-24 sm:px-6 sm:pb-32">
        <div className="relative overflow-hidden rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 p-8 text-center backdrop-blur sm:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.25),_transparent_60%)]" />
          <div className="relative space-y-6">
            <h2 className="text-3xl font-semibold text-foreground sm:text-4xl">
              Prêt à voir l&apos;ensemble de votre portefeuille ?
            </h2>
            <p className="mx-auto max-w-lg text-base text-muted-foreground">
              Connectez vos exchanges et wallets en quelques minutes.{" "}
              <strong className="text-foreground">
                Gratuit · Open source · Aucune carte bancaire requise.
              </strong>
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              <Button
                asChild
                size="lg"
                className="cursor-pointer bg-primary px-8 text-primary-foreground hover:bg-primary/90"
              >
                <Link href="/sign-up">
                  Créer un compte gratuit
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="cursor-pointer border-primary/40 bg-background/60 text-primary hover:bg-background/80"
              >
                <Link href="/dashboard">Voir la démo</Link>
              </Button>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <span>Accès lecture seule · Aucun accès à vos fonds · Chiffrement bancaire</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
