import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CircleGauge,
  LineChart,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const companies = ["Binance", "Convex", "Clerk", "Vercel", "OpenAI", "Google AI"];

const featureHighlights = [
  {
    icon: <BarChart3 className="h-6 w-6 text-primary" />,
    title: "Portefeuille unifié",
    description:
      "Visualisez la valeur en temps réel, les positions et le P&L agrégé pour chaque actif connecté.",
  },
  {
    icon: <BrainCircuit className="h-6 w-6 text-primary" />,
    title: "Insights IA",
    description:
      "Détectez les anomalies, recevez des scénarios de réallocation et anticipez les risques de drawdown.",
  },
  {
    icon: <ShieldCheck className="h-6 w-6 text-primary" />,
    title: "Stack sécurisée",
    description:
      "Infrastructure Next.js + Convex + Clerk compatible Vercel, chiffrée de bout en bout et prête à scaler.",
  },
];

const workflow = [
  {
    step: "01",
    title: "Connectez vos APIs Binance",
    description:
      "Authentifiez-vous via Clerk, ajoutez vos clés en lecture seule et lancez la synchronisation temps réel.",
  },
  {
    step: "02",
    title: "Obtenez la vision 360°",
    description:
      "Historisez trades, dépôts, retraits et conversions. Suivez votre performance quotidienne sans friction.",
  },
  {
    step: "03",
    title: "Activez l’intelligence Oracly",
    description:
      "Déployez les modules analytiques, ajoutez vos algorithmes IA et livrez des recommandations activables.",
  },
];

const metrics = [
  {
    label: "Données consolidées",
    value: "100%",
    description: "Trades spot, conversions Convert, dépôts et retraits centralisés.",
  },
  {
    label: "Calculs avancés",
    value: "12+",
    description: "Sharpe, Alpha/Beta, drawdown et métriques personnalisables.",
  },
  {
    label: "Mise en production",
    value: "<10 min",
    description: "Stack préconfigurée, prête à déployer sur Vercel ou en self-host.",
  },
];

const testimonials = [
  {
    quote:
      "Oracly pose une base technique solide : en quelques heures nous avons livré un tableau de bord crypto complet avec synchronisation Binance.",
    author: "Alexis, CTO @ QuantFlow",
  },
  {
    quote:
      "La couche IA est un véritable différenciateur : recommandations contextualisées, onboarding client accéléré et ROI mesurable dès les premiers jours.",
    author: "Maya, Product Lead @ Delta Advisory",
  },
];

export default function Home() {
  return (
    <main className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-[-12rem] z-[-1] h-[28rem] bg-gradient-to-b from-primary/20 via-primary/5 to-background blur-3xl" />

      <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-12 px-6 pb-24 pt-28 text-center md:pt-36">
        <Badge
          variant="outline"
          className="border-primary/30 bg-primary/10 text-xs font-medium uppercase tracking-[0.35em] text-primary"
        >
          Predict • Optimize • Master
        </Badge>
        <div className="max-w-4xl space-y-6">
          <h1 className="text-balance text-4xl font-bold leading-tight text-foreground sm:text-5xl md:text-6xl">
            La plateforme IA qui anticipe vos performances crypto avant qu&apos;elles ne se produisent.
          </h1>
          <p className="text-pretty text-lg text-muted-foreground sm:text-xl">
            Oracly ingère vos données Binance, calcule vos métriques quantitatives en temps réel et déploie
            des recommandations IA pour protéger et optimiser votre portefeuille.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button asChild size="lg" className="bg-primary px-8 text-primary-foreground hover:bg-primary/90">
            <Link href="/sign-up">
              Commencer gratuitement
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-border/60 bg-card/60 backdrop-blur hover:bg-card"
          >
            <Link href="/dashboard">Voir le dashboard</Link>
          </Button>
        </div>
        <div className="w-full max-w-4xl rounded-3xl border border-border/60 bg-card/70 p-6 shadow-lg shadow-primary/5 backdrop-blur">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="flex flex-col items-start gap-3 text-left">
              <CircleGauge className="h-8 w-8 text-primary" />
              <p className="text-lg font-semibold text-foreground">Pilotage temps réel</p>
              <p className="text-sm text-muted-foreground">
                Agrégation instantanée des trades, conversions, dépôts et retraits.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3 text-left">
              <Activity className="h-8 w-8 text-primary" />
              <p className="text-lg font-semibold text-foreground">Surveillance proactive</p>
              <p className="text-sm text-muted-foreground">
                Alertes sur les drawdowns, expositions et métriques critiques.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3 text-left">
              <Sparkles className="h-8 w-8 text-primary" />
              <p className="text-lg font-semibold text-foreground">IA embarquée</p>
              <p className="text-sm text-muted-foreground">
                Suggestions de réallocation, gestion du risque et scénarios d&apos;optimisation.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-6 pb-16">
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm uppercase tracking-[0.3em] text-muted-foreground">
          {companies.map((company) => (
            <span key={company} className="text-muted-foreground/70">
              {company}
            </span>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-24">
        <div className="grid gap-8 md:grid-cols-3">
          {featureHighlights.map((feature) => (
            <div
              key={feature.title}
              className="group relative flex h-full flex-col gap-6 rounded-3xl border border-border/60 bg-card/70 p-8 transition hover:-translate-y-1 hover:border-primary/40 hover:bg-card/90"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                {feature.icon}
              </div>
              <div>
                <h3 className="text-xl font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-3 text-sm text-muted-foreground">{feature.description}</p>
              </div>
              <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/0 via-primary/0 to-primary/5 opacity-0 transition group-hover:opacity-100" />
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 pb-24 md:flex-row md:items-center">
        <div className="relative flex-1 overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-8 backdrop-blur">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-background opacity-70" />
          <div className="relative flex flex-col gap-6">
            <Badge variant="secondary" className="w-fit bg-primary/20 text-primary">
              Aperçu produit
            </Badge>
            <h2 className="text-3xl font-semibold text-foreground md:text-4xl">
              Dashboard stratégique pour surveiller et décider.
            </h2>
            <p className="text-sm text-muted-foreground">
              Les composants Shadcn/UI et Convex alimentent une interface responsive, avec sections dédiées aux
              performances, allocations et transactions.
            </p>
            <div className="grid gap-4 text-sm text-muted-foreground">
              <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/30 p-4">
                <LineChart className="mt-1 h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-base font-medium text-foreground">Analyse temporelle</h3>
                  <p>Courbes P&amp;L, drawdown, performance vs benchmark générées à la volée.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/30 p-4">
                <CircleGauge className="mt-1 h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-base font-medium text-foreground">Allocation instantanée</h3>
                  <p>Vue allocation par actif, expositions fiat/crypto et répartition des risques.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/30 p-4">
                <BrainCircuit className="mt-1 h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-base font-medium text-foreground">Copilote IA</h3>
                  <p>Résumé automatique, recommandations Oracly et plan d&apos;action priorisé.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-10">
          <div className="space-y-4">
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              Workflow Oracly
            </Badge>
            <h2 className="text-pretty text-3xl font-semibold text-foreground md:text-4xl">
              Une méthodologie d&apos;onboarding pensée pour gagner du temps.
            </h2>
            <p className="text-sm text-muted-foreground">
              Convex gère l&apos;ingestion temps réel, Next.js sert l&apos;expérience, et vos modèles IA se branchent
              en quelques endpoints.
            </p>
          </div>
          <div className="space-y-6">
            {workflow.map((item) => (
              <div key={item.step} className="flex gap-5 rounded-2xl border border-border/40 bg-card/60 p-6">
                <span className="text-3xl font-semibold text-primary">{item.step}</span>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-24">
        <div className="grid gap-8 rounded-3xl border border-border/60 bg-card/60 p-10 backdrop-blur md:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="flex flex-col gap-3">
              <span className="text-sm font-medium uppercase tracking-wide text-primary">{metric.label}</span>
              <span className="text-4xl font-semibold text-foreground">{metric.value}</span>
              <p className="text-sm text-muted-foreground">{metric.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-6 pb-24">
        <div className="grid gap-6 md:grid-cols-2">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.author}
              className="flex h-full flex-col gap-4 rounded-3xl border border-border/60 bg-card/70 p-8"
            >
              <p className="text-lg text-foreground">&ldquo;{testimonial.quote}&rdquo;</p>
              <span className="text-sm font-medium text-muted-foreground">{testimonial.author}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-6 pb-28">
        <div className="relative overflow-hidden rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 p-10 text-center backdrop-blur">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(201,166,70,0.25),_transparent_60%)]" />
          <div className="relative space-y-6">
            <h2 className="text-3xl font-semibold text-foreground">
              Déployez Oracly, maîtrisez votre portefeuille.
            </h2>
            <p className="text-lg text-muted-foreground">
              Créez votre compte, synchronisez Binance et activez votre copilote IA en moins d&apos;une heure.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Button asChild size="lg" className="bg-primary px-8 text-primary-foreground hover:bg-primary/90">
                <Link href="/sign-up">Créer mon espace</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-primary/40 bg-background/60 text-primary hover:bg-background"
              >
                <Link href="/dashboard">Explorer le demo dashboard</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
