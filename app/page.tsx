import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const companies = ["Binance", "Convex", "Clerk", "Vercel", "OpenAI", "Google AI"];

const featureHighlights = [
  {
    icon: <BarChart3 className="h-6 w-6 text-primary" />,
    title: "Votre QG Crypto unifié",
    description:
      "Cessez de jongler entre les plateformes. Visualisez toute votre performance — actifs, P&L, et transactions — en un seul endroit clair et intuitif.",
  },
  {
    icon: <BrainCircuit className="h-6 w-6 text-primary" />,
    title: "L'IA comme copilote stratégique",
    description:
      "Transformez les données brutes en décisions éclairées. Notre IA détecte les risques, propose des réallocations et maximise votre potentiel de rendement.",
  },
  {
    icon: <ShieldCheck className="h-6 w-6 text-primary" />,
    title: "Déploiement en quelques minutes, pas en mois",
    description:
      "Notre stack pré-configurée (Next.js, Convex, Clerk) se déploie sur Vercel en un clic. Concentrez-vous sur la valeur, pas sur l'infrastructure.",
  },
];

const workflow = [
  {
    step: "01",
    title: "Connexion sécurisée en 2 clics",
    description:
      "Authentifiez-vous et connectez vos clés d'API Binance en lecture seule. Vos données sont chiffrées et votre sécurité est notre priorité.",
  },
  {
    step: "02",
    title: "Le miroir de votre portefeuille",
    description:
      "Oracly synchronise et historise l'ensemble de vos opérations pour vous offrir une vue 360° de votre performance, sans effort.",
  },
  {
    step: "03",
    title: "L'intelligence prend le relais",
    description:
      "Nos modèles IA analysent votre portefeuille pour vous livrer des recommandations claires et des scénarios d'optimisation prêts à être activés.",
  },
];

const metrics = [
  {
    label: "Clarté Totale",
    value: "100%",
    description: "Toutes vos données de trading, dépôts et retraits sont consolidées et standardisées.",
  },
  {
    label: "Indicateurs de performance",
    value: "12+",
    description: "Du ratio de Sharpe au Max Drawdown, les métriques qui comptent pour les pros.",
  },
  {
    label: "Prêt à l'emploi",
    value: "<10 min",
    description: "Déployez votre propre instance d'Oracly sur Vercel et commencez à analyser en quelques minutes.",
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

const faqItems = [
  {
    question: "Comment Oracly garantit-il la sécurité de mes données ?",
    answer:
      "La sécurité est notre priorité absolue. Oracly ne demande que des accès en lecture seule à vos comptes d'échange. Vos clés API sont chiffrées au repos et en transit en utilisant des protocoles de sécurité de niveau bancaire. Nous n'avons jamais accès à vos fonds.",
  },
  {
    question: "Quels sont les exchanges supportés ?",
    answer:
      "Pour notre lancement initial, nous nous concentrons sur une intégration profonde et robuste avec Binance, le leader mondial. Nous prévoyons d'ajouter d'autres exchanges majeurs comme Coinbase, Kraken et Bybit dans les mois à venir en fonction des retours de nos utilisateurs.",
  },
  {
    question: "Les recommandations de l'IA sont-elles des conseils financiers ?",
    answer:
      "Non. Les insights générés par l'IA d'Oracly sont des outils d'aide à la décision et ne doivent pas être considérés comme des conseils financiers. Ils sont conçus pour vous aider à analyser les risques et les opportunités sur la base de vos données, mais vous restez le seul décisionnaire.",
  },
  {
    question: "Puis-je personnaliser ou ajouter mes propres modèles d'IA ?",
    answer:
      "Absolument. Oracly est conçu comme une plateforme ouverte. Bien que nous fournissions une suite de modèles puissants prêts à l'emploi, vous pouvez facilement intégrer vos propres algorithmes d'analyse et de recommandation via notre architecture modulaire.",
  },
];

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <main className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-[-12rem] z-[-1] h-[28rem] bg-gradient-to-b from-primary/25 via-primary/10 to-transparent blur-3xl" />

      <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-10 px-4 pb-20 pt-24 text-center sm:gap-12 sm:px-6 md:pt-32">
        <Badge
          variant="outline"
          className="border-primary/30 bg-primary/10 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-primary sm:text-xs"
        >
          Votre copilote crypto stratégique
        </Badge>
        <div className="max-w-4xl space-y-6">
          <h1 className="text-balance text-3xl font-bold leading-tight text-foreground sm:text-5xl md:text-6xl">
            Passez de la réaction à l&apos;anticipation. Pilotez votre portefeuille crypto avec l&apos;IA.
          </h1>
          <p className="text-pretty text-base text-muted-foreground sm:text-xl">
            Arrêtez de deviner, commencez à optimiser. Oracly vous donne la clarté pour protéger et faire
            croître votre portefeuille grâce à des analyses prédictives.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          <Button asChild size="lg" className="bg-primary px-8 text-primary-foreground hover:bg-primary/90">
            <Link href="/sign-up">
              Démarrez votre analyse gratuite
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-border/60 bg-card/60 backdrop-blur hover:bg-card"
          >
            <Link href="/dashboard">Explorer le dashboard</Link>
          </Button>
        </div>
        <div className="w-full max-w-4xl rounded-3xl border border-border/60 bg-card/70 p-6 shadow-lg shadow-primary/5 backdrop-blur sm:p-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col items-start gap-3 text-left">
              <CircleGauge className="h-8 w-8 text-primary" />
              <p className="text-lg font-semibold text-foreground">Clarté instantanée</p>
              <p className="text-sm text-muted-foreground">
                Toute votre activité de trading consolidée en une vue unique et actionnable.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3 text-left">
              <Activity className="h-8 w-8 text-primary" />
              <p className="text-lg font-semibold text-foreground">Surveillance Intelligente</p>
              <p className="text-sm text-muted-foreground">
                Recevez des alertes pertinentes sur les risques et opportunités cachés.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3 text-left">
              <Sparkles className="h-8 w-8 text-primary" />
              <p className="text-lg font-semibold text-foreground">Optimisation Continue</p>
              <p className="text-sm text-muted-foreground">
                L&apos;IA vous aide à améliorer la performance et à protéger vos actifs.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 pb-14 sm:px-6 sm:pb-16">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-muted-foreground">
            Déployé par des traders et des ingénieurs chez
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[0.7rem] uppercase tracking-[0.3em] text-muted-foreground/80">
            {companies.map((company) => (
              <span key={company} className="text-muted-foreground/70">
                {company}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 lg:pb-24">
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {featureHighlights.map((feature) => (
            <div
              key={feature.title}
              className="group relative flex h-full flex-col gap-5 rounded-3xl border border-border/60 bg-card/70 p-6 transition hover:-translate-y-1 hover:border-primary/40 hover:bg-card/90 sm:p-8"
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

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 pb-20 sm:px-6 md:flex-row md:items-center lg:gap-16 lg:pb-24">
        <div className="relative flex-1 overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-6 shadow-lg backdrop-blur sm:p-8">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-background opacity-70" />
          <div className="relative flex flex-col gap-6">
            <Badge variant="secondary" className="w-fit bg-primary/20 text-primary">
              Aperçu produit
            </Badge>
            <h2 className="text-3xl font-semibold text-foreground md:text-4xl">
              Un dashboard pensé pour l&apos;action, pas juste pour la contemplation.
            </h2>
            <p className="text-sm text-muted-foreground">
              Chaque composant est conçu pour vous mener de l&apos;analyse à la décision en un minimum de clics,
              le tout dans une interface ultra-réactive.
            </p>
            <div className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
              <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/40 p-4">
                <LineChart className="mt-1 h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-base font-medium text-foreground">Analyse Visuelle</h3>
                  <p>Explorez vos performances avec des graphiques interactifs et des métriques claires.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/40 p-4">
                <CircleGauge className="mt-1 h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-base font-medium text-foreground">Allocation en temps réel</h3>
                  <p>Comprenez instantanément votre exposition et la répartition de vos actifs.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/40 p-4">
                <BrainCircuit className="mt-1 h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-base font-medium text-foreground">Copilote IA</h3>
                  <p>Recevez des résumés automatiques et des plans d&apos;action priorisés.</p>
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
              Intégrez, analysez, optimisez. En trois étapes simples.
            </h2>
            <p className="text-sm text-muted-foreground">
              Nous avons simplifié l&apos;ingestion de données et l&apos;analyse pour que vous puissiez vous concentrer
              sur la stratégie, pas sur la plomberie.
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

      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 lg:pb-24">
        <div className="grid gap-6 rounded-3xl border border-border/60 bg-card/60 p-6 backdrop-blur sm:grid-cols-2 sm:p-8 xl:grid-cols-3 xl:p-10">
          {metrics.map((metric) => (
            <div key={metric.label} className="flex flex-col gap-3">
              <span className="text-sm font-medium uppercase tracking-wide text-primary">{metric.label}</span>
              <span className="text-4xl font-semibold text-foreground">{metric.value}</span>
              <p className="text-sm text-muted-foreground">{metric.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 pb-20 sm:px-6 sm:pb-24">
        <h2 className="mb-8 text-center text-3xl font-semibold text-foreground">
          Ils construisent le futur de la finance avec Oracly
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
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

      <section className="mx-auto w-full max-w-4xl px-4 pb-20 sm:px-6 sm:pb-24">
        <div className="space-y-8 text-center">
          <h2 className="text-3xl font-semibold text-foreground">Questions fréquentes</h2>
          <Accordion type="single" collapsible className="w-full text-left">
            {faqItems.map((item, index) => (
              <AccordionItem key={index} value={`item-${index + 1}`}>
                <AccordionTrigger className="text-base font-medium">{item.question}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 pb-24 sm:px-6 sm:pb-28">
        <div className="relative overflow-hidden rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 p-6 text-center backdrop-blur sm:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.25),_transparent_60%)]" />
          <div className="relative space-y-6">
            <h2 className="text-3xl font-semibold text-foreground">
              Prêt à prendre une longueur d&apos;avance ?
            </h2>
            <p className="text-lg text-muted-foreground">
              Créez votre compte, synchronisez vos données et recevez vos premières analyses IA en moins
              d&apos;une heure.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              <Button asChild size="lg" className="bg-primary px-8 text-primary-foreground hover:bg-primary/90">
                <Link href="/sign-up">Commencer l&apos;optimisation</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-primary/40 bg-background/60 text-primary hover:bg-background"
              >
                <Link href="/dashboard">Explorer le dashboard de démo</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
