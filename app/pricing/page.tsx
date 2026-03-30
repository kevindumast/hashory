import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    ctaHref: "mailto:sales@oracly.xyz",
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
      "Nous proposons un plan Hobby entièrement gratuit qui vous permet de tester les fonctionnalités de base. Si vous souhaitez essayer le plan Pro, nous offrons une garantie de remboursement de 14 jours &apos;satisfait ou remboursé&apos;.",
  },
];

export default function PricingPage() {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-[-12rem] z-[-1] h-[28rem] bg-gradient-to-b from-primary/25 via-primary/10 to-transparent blur-3xl" />
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-24 sm:px-6 lg:pb-32 lg:pt-32">
        <div className="text-center">
          <Badge
            variant="outline"
            className="border-primary/30 bg-primary/10 px-4 py-2 text-sm font-semibold uppercase tracking-widest text-primary"
          >
            Tarifs
          </Badge>
          <h1 className="mt-8 text-balance text-3xl font-bold leading-tight text-foreground sm:text-5xl md:text-6xl">
            Un plan pour chaque ambition.
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-pretty text-lg text-muted-foreground">
            De la simple surveillance à l&apos;optimisation IA avancée, choisissez le plan qui correspond à votre stratégie.
          </p>
        </div>

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`flex flex-col rounded-3xl border ${
                tier.recommended ? "border-primary" : "border-border/60"
              } bg-card/70 p-8 shadow-lg ${
                tier.recommended ? "shadow-primary/20" : "shadow-primary/5"
              }`}
            >
              <div className="flex-grow">
                <div className="flex justify-between items-start">
                  <h2 className="text-xl font-semibold text-foreground">{tier.name}</h2>
                  {tier.recommended && (
                    <Badge variant="secondary" className="bg-primary/20 text-primary">
                      Recommandé
                    </Badge>
                  )}
                </div>
                <p className="mt-4 flex items-baseline gap-x-2">
                  <span className="text-4xl font-bold tracking-tight text-foreground">{tier.price}</span>
                  {tier.priceFrequency && (
                    <span className="text-sm font-medium text-muted-foreground">{tier.priceFrequency}</span>
                  )}
                </p>
                <p className="mt-4 text-sm text-muted-foreground">{tier.description}</p>
                <ul role="list" className="mt-8 space-y-4 text-sm">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="h-5 w-5 flex-shrink-0 text-primary" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Button
                asChild
                size="lg"
                className={`mt-8 w-full ${
                  tier.recommended ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""
                }`}
                variant={tier.recommended ? "default" : "outline"}
              >
                <Link href={tier.ctaHref}>{tier.cta}</Link>
              </Button>
            </div>
          ))}
        </div>

        <section className="mx-auto w-full max-w-4xl pt-24 sm:pt-32">
          <div className="space-y-8 text-center">
            <h2 className="text-3xl font-semibold text-foreground">Questions fréquentes sur les tarifs</h2>
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
      </main>
    </div>
  );
}
