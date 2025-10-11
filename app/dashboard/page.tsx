import { ShieldCheck, TrendingUp, Wallet } from "lucide-react";
import { PortfolioCard } from "./components/PortfolioCard";
import { MetricChart } from "./components/MetricChart";
import { Button } from "@/components/ui/button";

const mockPortfolios = [
  {
    title: "Valeur totale",
    value: "$124,560",
    description: "Actualisee toutes les 60 secondes",
    accent: <TrendingUp className="h-5 w-5 text-primary" />,
  },
  {
    title: "P&L 30 jours",
    value: "+12.4%",
    description: "Base sur les donnees Binance",
    accent: <Wallet className="h-5 w-5 text-primary" />,
  },
  {
    title: "Indice de risque",
    value: "Modere",
    description: "Calcule a partir du drawdown max",
    accent: <ShieldCheck className="h-5 w-5 text-primary" />,
  },
];

const mockChart = [
  { label: "Lun", value: 64 },
  { label: "Mar", value: 72 },
  { label: "Mer", value: 80 },
  { label: "Jeu", value: 78 },
  { label: "Ven", value: 88 },
];

const mockRecommendations = [
  {
    label: "Reallocation",
    description:
      "Reduire l'exposition BTC de 5% et renforcer ETH pour equilibrer la volatilite.",
  },
  {
    label: "Stop loss",
    description: "Placer un stop loss sur SOL a -8% pour limiter le drawdown potentiel.",
  },
  {
    label: "Gestion du risque",
    description: "Augmenter le buffer stablecoins de 10% afin de securiser les gains recents.",
  },
];

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-12 px-6 pb-24 pt-12 lg:px-12">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Tableau de bord</p>
          <h1 className="mt-2 text-3xl font-semibold text-foreground lg:text-4xl">
            Synthese de votre portefeuille Binance
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Connectez vos cles API Binance pour alimenter les cartes ci-dessous. Les metriques sont stockees dans Convex
            et securisees par Clerk.
          </p>
        </div>
        <div className="flex gap-3">
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90">Connecter Binance</Button>
          <Button variant="outline" className="border-border text-foreground hover:bg-secondary">
            Rafraichir les donnees
          </Button>
        </div>
      </header>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {mockPortfolios.map((portfolio) => (
          <PortfolioCard key={portfolio.title} {...portfolio} />
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <MetricChart
          title="Performance hebdomadaire"
          description="Variation quotidienne du portefeuille principal"
          points={mockChart}
          footer={
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Sharpe ratio (30j) : 1.12</span>
              <span>Drawdown max : -6.4%</span>
            </div>
          }
        />

        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card/80 p-6 shadow-sm backdrop-blur">
          <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Suggestions IA</p>
          <h2 className="text-xl font-semibold text-foreground">Mesures recommandees</h2>
          <div className="flex flex-col gap-4">
            {mockRecommendations.map((item) => (
              <div key={item.label} className="rounded-xl border border-dashed border-border/60 bg-background/40 p-4">
                <p className="text-sm font-semibold text-foreground">{item.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
          <Button variant="outline" className="mt-auto border-border text-foreground hover:bg-secondary">
            Generer un nouveau rapport
          </Button>
        </div>
      </section>
    </div>
  );
}
