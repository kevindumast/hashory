import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GlowCard } from "@/components/motion";
import { SiteFooter } from "@/components/site-footer";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Check } from "lucide-react";
import Link from "next/link";

const tiers = [
  {
    name: "Hobby",
    price: "€0",
    priceFrequency: "pour toujours",
    description: "Pour les individus qui veulent suivre leur portefeuille et obtenir des insights de base.",
    features: [
      "1 connexion Binance",
      "Synchronisation quotidienne",
      "Dashboard de performance standard",
      "Alertes de base",
    ],
    cta: "Commencer gratuitement",
    ctaHref: "/sign-up",
    recommended: false,
  },
  {
    name: "Pro",
    price: "€79",
    priceFrequency: "/mois",
    description: "Pour les traders actifs et les professionnels qui exigent des analyses avancées et du temps réel.",
    features: [
      "Toutes les fonctionnalités Hobby",
      "Jusqu'à 5 connexions d'exchange",
      "Synchronisation temps réel",
      "Analyses IA avancées (scénarios, backtesting)",
      "Alertes intelligentes et personnalisables",
      "Support prioritaire par email",
    ],
    cta: "Choisir Pro",
    ctaHref: "/sign-up",
    recommended: true,
  },
  {
    name: "Entreprise",
    price: "Custom",
    priceFrequency: "",
    description: "Pour les fonds, les family offices et les équipes qui ont besoin de solutions sur-mesure.",
    features: [
      "Toutes les fonctionnalités Pro",
      "Connexions d'exchange illimitées",
      "Accès API complet",
      "Intégration de modèles IA personnalisés",
      "Déploiement self-hosted ou cloud privé",
      "Support dédié et SLA",
      "SSO et audit logs",
    ],
    cta: "Nous contacter",
    ctaHref: "mailto:contact@hashory.app",
    recommended: false,
  },
];

const faqItems = [
  {
    question: "Puis-je changer de plan plus tard ?",
    answer:
      "Oui, absolument. Vous pouvez passer d'un plan à l'autre à tout moment depuis votre espace client. La facturation sera ajustée au prorata.",
  },
  {
    question: "Proposez-vous une réduction pour un paiement annuel ?",
    answer:
      "Oui, nous offrons 2 mois gratuits si vous optez pour un paiement annuel, ce qui correspond à une réduction d'environ 17%. Vous pouvez sélectionner cette option lors du paiement.",
  },
  {
    question: "Quelles sont les méthodes de paiement acceptées ?",
    answer:
      "Nous acceptons toutes les principales cartes de crédit (Visa, MasterCard, American Express) via notre partenaire de paiement sécurisé Stripe. Pour les plans Entreprise, nous proposons également le virement bancaire.",
  },
  {
    question: "Existe-t-il une période d'essai pour le plan Pro ?",
    answer:
      "Nous proposons un plan Hobby entièrement gratuit qui vous permet de tester les fonctionnalités de base. Si vous souhaitez essayer le plan Pro, nous offrons une garantie de remboursement de 14 jours « satisfait ou remboursé ».",
  },
];

export default function PricingPage() {
  // Pricing hidden during beta — uncomment return below when ready
  notFound();

  return (
    <>
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-24 sm:px-6 lg:pb-32 lg:pt-32">
        <header>
          <p className="num flex items-center gap-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            <span className="h-px w-6 bg-primary" />
            Tarifs
          </p>
          <h1 className="mt-6 max-w-2xl text-balance font-serif text-5xl font-normal leading-[1.02] text-foreground sm:text-6xl">
            Un plan pour chaque ambition.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground">
            De la simple surveillance à l&apos;optimisation avancée, choisissez le plan qui
            correspond à votre stratégie.
          </p>
        </header>

        {/* Colonnes séparées par des filets : pas de carte surlignée en couleur. */}
        <div className="mt-16 grid border-t border-border/60 lg:grid-cols-3">
          {tiers.map((tier) => (
            <GlowCard
              key={tier.name}
              className={cn(
                "flex h-full flex-col border-b border-border/60 lg:border-r lg:last:border-r-0",
                tier.recommended && "border-t-2 border-t-primary"
              )}
            >
              <div className="flex h-full flex-col p-8">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-serif text-2xl font-normal text-foreground">{tier.name}</h2>
                  {tier.recommended && (
                    <span className="num text-[10px] uppercase tracking-[0.2em] text-primary">
                      Recommandé
                    </span>
                  )}
                </div>

                <p className="mt-6 flex items-baseline gap-x-2">
                  <span className="num text-5xl font-normal tracking-tight text-foreground">
                    {tier.price}
                  </span>
                  {tier.priceFrequency && (
                    <span className="num text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {tier.priceFrequency}
                    </span>
                  )}
                </p>

                <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
                  {tier.description}
                </p>

                <ul role="list" className="mt-8 border-t border-border/60">
                  {tier.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-3 border-b border-border/60 py-3 text-sm text-muted-foreground"
                    >
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  size="lg"
                  className="mt-8 w-full"
                  variant={tier.recommended ? "default" : "outline"}
                >
                  <Link href={tier.ctaHref}>{tier.cta}</Link>
                </Button>
              </div>
            </GlowCard>
          ))}
        </div>

        <section className="mt-24 grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p className="num flex items-center gap-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              <span className="h-px w-6 bg-primary" />
              Questions
            </p>
            <h2 className="mt-6 font-serif text-4xl font-normal leading-[1.05] text-foreground">
              Sur la facturation.
            </h2>
          </div>

          <div className="lg:col-span-8">
            <Accordion type="single" collapsible className="w-full border-t border-border/60">
              {faqItems.map((item) => (
                <AccordionItem key={item.question} value={item.question}>
                  <AccordionTrigger className="py-5 text-left text-base font-medium hover:no-underline">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="max-w-2xl pb-6 text-sm leading-relaxed text-muted-foreground">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
