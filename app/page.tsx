import Link from "next/link";
import { ArrowRight, BarChart3, Brain, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: <BarChart3 className="h-6 w-6 text-primary" />,
    title: "Vision 360",
    description:
      "Suivez la valeur temps reel de vos portefeuilles Binance et detectez les mouvements critiques instantanement.",
  },
  {
    icon: <Brain className="h-6 w-6 text-primary" />,
    title: "Intelligence Convex",
    description:
      "Historisez vos positions et vos trades, et preparez le terrain pour des analyses quantitatives avancees.",
  },
  {
    icon: <Sparkles className="h-6 w-6 text-primary" />,
    title: "IA Personnalisee",
    description:
      "Generez des recommandations sur la performance, la reallocation d'actifs et la gestion du risque.",
  },
];

export default function Home() {
  return (
    <main className="flex min-h-[90vh] flex-col items-center justify-center gap-16 bg-gradient-to-b from-background via-background/80 to-background px-6 py-24">
      <section className="max-w-4xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm uppercase tracking-[0.3em] text-muted-foreground">
          Oracly
          <span className="mx-1 h-1 w-1 rounded-full bg-primary" />
          Predict. Optimize. Master.
        </span>
        <h1 className="mt-8 text-4xl font-bold leading-tight text-foreground sm:text-5xl md:text-6xl">
          Votre copilote IA pour piloter la performance de vos actifs crypto.
        </h1>
        <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
          Une base Next.js + Convex + Clerk solide pour connecter Binance, visualiser vos metriques cles
          et activer une intelligence financiere proactive.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Button asChild size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href="/dashboard">
              Acceder au tableau de bord
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-border text-foreground hover:bg-secondary">
            <Link href="/sign-up">Creer un compte</Link>
          </Button>
        </div>
      </section>

      <section className="grid w-full max-w-5xl grid-cols-1 gap-8 md:grid-cols-3">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card/80 p-8 text-left shadow-sm backdrop-blur-md transition hover:-translate-y-1 hover:bg-card"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent">
              {feature.icon}
            </div>
            <h3 className="text-xl font-semibold text-foreground">{feature.title}</h3>
            <p className="text-base text-muted-foreground">{feature.description}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
