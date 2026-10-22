import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { GlowCard, NumberTicker, Reveal, WordReveal } from "@/components/motion";
import { FlowDiagram } from "@/components/landing/flow-diagram";
import { HeroPreview } from "@/components/landing/hero-preview";
import { PlatformMarquee } from "@/components/landing/platform-marquee";
import { SiteFooter } from "@/components/site-footer";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/lib/site";

const comparison = [
  {
    before: "Vos actifs dispersés sur plusieurs exchanges et wallets",
    after: "Une vue unifiée : exchanges, wallets on-chain et imports CSV",
  },
  {
    before: "Un P&L recalculé à la main dans un tableur",
    after: "Un P&L automatique, historisé et décomposé par actif",
  },
  {
    before: "Aucune idée de votre exposition réelle",
    after: "Répartition et valeur du portefeuille, à jour en continu",
  },
  {
    before: "Des heures à consolider des exports incompatibles",
    after: "Une synchronisation continue, sans aucune ressaisie",
  },
  {
    before: "Une déclaration fiscale reconstituée dans l'urgence",
    after: "Les plus-values calculées selon l'article 150 VH bis du CGI",
  },
];

/** `tone` : violet pour ce qui se lit, jade pour ce qui se calcule. */
const capabilities = [
  {
    tag: "Agrégation",
    tone: "violet",
    title: "Exchanges et wallets unifiés",
    description:
      "Binance, Kraken et KuCoin par API, vos adresses Bitcoin, Ethereum, Solana, Kaspa et Bittensor par clé publique. Une seule interface pour l'ensemble.",
  },
  {
    tag: "Performance",
    tone: "jade",
    title: "Performance réelle",
    description:
      "P&L par actif, par période et par plateforme. Prix de revient moyen, répartition, historique complet — calculés, pas saisis.",
  },
  {
    tag: "Synchronisation",
    tone: "jade",
    title: "Synchronisation continue",
    description:
      "Trades, conversions, dépôts, retraits, soldes et poussière. Vos données se mettent à jour sans que vous y pensiez.",
  },
  {
    tag: "Fiscalité",
    tone: "violet",
    title: "Déclaration fiscale française",
    description:
      "Plus-values imposables selon l'article 150 VH bis du CGI, avec le détail cession par cession, prêt à reporter.",
  },
  {
    tag: "Cycles",
    tone: "violet",
    title: "Saisonnalité et cycles",
    description:
      "Le comportement de vos actifs mois par mois, pour situer votre performance dans le cycle de marché.",
  },
  {
    tag: "Sécurité",
    tone: "jade",
    title: "Vos clés, votre crédit",
    description:
      "Vos wallets sont lus avec vos propres clés d'API, chiffrées au repos : c'est votre crédit qui est consommé, et vous pouvez les révoquer à tout moment. Aucun accès à vos fonds, jamais.",
  },
] as const;

const workflow = [
  {
    step: "01",
    title: "Vous connectez",
    description:
      "Une clé API en lecture seule, ou simplement l'adresse publique d'un wallet. Pas de clé sous la main ? Un export CSV suffit.",
  },
  {
    step: "02",
    title: "Hashory reconstitue",
    description:
      "L'intégralité de votre historique est récupérée, dédupliquée et rejouée pour reconstruire votre portefeuille depuis son premier achat.",
  },
  {
    step: "03",
    title: "Vous lisez, vous déclarez",
    description:
      "Performance, répartition, saisonnalité et déclaration fiscale sortent des mêmes données. Une seule source, aucune ressaisie.",
  },
];

const metrics = [
  {
    label: "Sources connectables",
    value: 10,
    suffix: "",
    description: "Exchanges, blockchains et imports de fichiers.",
  },
  {
    label: "Historique reconstitué",
    value: 100,
    suffix: " %",
    description: "Trades, conversions, dépôts, retraits, poussière.",
  },
  {
    label: "Avant la première vue",
    value: 2,
    suffix: " min",
    description: "De la connexion au portefeuille complet.",
  },
];

const transparency = [
  {
    title: "Code auditable",
    description:
      "L'intégralité du code est publique sous licence MIT. Vous confiez à Hashory la lecture de vos comptes : vous pouvez vérifier exactement ce qu'il en fait.",
  },
  {
    title: "Auto-hébergeable",
    description:
      "Déployez votre propre instance avec votre base Convex et vos clés. Aucune donnée ne transite alors par nos serveurs.",
  },
  {
    title: "Développement public",
    description:
      "Chaque version est documentée dans un changelog public, généré directement à partir des commits du dépôt.",
  },
  {
    title: "Feuille de route ouverte",
    description:
      "Les prochaines intégrations sont priorisées selon les demandes remontées publiquement dans les issues GitHub.",
  },
];

const faqItems = [
  {
    question: "Comment mes clés API sont-elles protégées ?",
    answer:
      "Hashory ne demande que des accès en lecture seule. Vos clés sont chiffrées avant d'être stockées et ne transitent jamais en clair. Vos wallets on-chain sont suivis via leur adresse publique uniquement : il n'existe aucun chemin technique permettant de déplacer vos fonds.",
  },
  {
    question: "Quelles plateformes sont réellement supportées ?",
    answer:
      "Aujourd'hui : Binance, Kraken et KuCoin via API, et les wallets Bitcoin, Ethereum, Solana, Kaspa et Bittensor via adresse publique. Les exports Bitstack et Finary sont importables en CSV. Les autres exchanges sont intégrés au fil des demandes de la communauté.",
  },
  {
    question: "La déclaration fiscale couvre-t-elle mon cas ?",
    answer:
      "Hashory calcule les plus-values de cession d'actifs numériques selon l'article 150 VH bis du CGI, avec le détail de chaque cession et la valeur globale du portefeuille au moment de celle-ci. C'est une aide au remplissage, pas un conseil fiscal : faites valider votre situation par un professionnel.",
  },
  {
    question: "Pourquoi fournir mes propres clés d'API ?",
    answer:
      "Pour lire l'historique d'un wallet Solana, Ethereum ou Bittensor, Hashory interroge un service spécialisé (Helius, Etherscan, TaoStats). Chacun y utilise sa propre clé : c'est votre crédit qui est consommé, personne d'autre n'y touche, et vous gardez le contrôle — vous voyez l'usage chez le fournisseur et révoquez la clé quand vous voulez. Les offres gratuites suffisent largement pour un portefeuille personnel.",
  },
  {
    question: "Hashory est-il vraiment open source ?",
    answer:
      "Oui. Le code est disponible sur GitHub sous licence MIT : vous pouvez l'auditer, le forker, y contribuer ou déployer votre propre instance. La transparence est la raison d'être du projet.",
  },
  {
    question: "Puis-je héberger ma propre instance ?",
    answer:
      "Absolument. Suivez le guide de déploiement du README pour lancer votre instance sur Vercel en quelques minutes, avec votre propre base Convex et vos clés Clerk.",
  },
];

const container = "mx-auto w-full max-w-7xl px-4 sm:px-8";
const sectionTitle = "title max-w-3xl text-4xl text-foreground sm:text-5xl";

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <>
      <main>
        {/* ─── HERO ─── */}
        <section className="relative overflow-hidden pb-16 pt-24 sm:pt-32">
          <div className="grid-paper pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className={cn(container, "relative grid items-center gap-16 lg:grid-cols-12")}>
            <div className="lg:col-span-6">
              <Reveal>
                <p className="eyebrow">Hashory · Agrégateur crypto open source</p>
              </Reveal>

              <WordReveal
                as="h1"
                delay={120}
                className="mt-6 text-5xl font-bold leading-[1] tracking-[-0.035em] text-foreground sm:text-6xl lg:text-7xl"
                segments={[
                  { text: "Tous vos actifs crypto," },
                  { text: "réunis", tone: "violet" },
                  { text: "et" },
                  { text: "déclarés.", tone: "jade" },
                ]}
              />

              <Reveal delay={240}>
                <p className="mt-8 max-w-xl text-lg leading-relaxed text-slate">
                  Hashory agrège vos exchanges, vos wallets on-chain et vos imports de fichiers,
                  reconstitue votre historique complet, et va jusqu&apos;à votre déclaration fiscale.
                </p>
              </Reveal>

              <Reveal delay={320}>
                <div className="mt-10 flex flex-wrap items-center gap-3">
                  <Button asChild size="lg" className="px-7">
                    <Link href="/sign-up">
                      Créer un compte gratuit
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="px-7">
                    <a href="#apercu">Voir l&apos;aperçu</a>
                  </Button>
                </div>
              </Reveal>

              <Reveal delay={400}>
                <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                  {["Lecture seule", "Vos propres clés d'API", "Licence MIT"].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-jade" />
                      {item}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>

            <Reveal delay={260} className="hidden md:block lg:col-span-6">
              <div className="ml-auto h-[440px] max-w-xl pt-8 lg:h-[480px]">
                <FlowDiagram />
              </div>
            </Reveal>
          </div>
        </section>

        {/* ─── SOURCES ─── */}
        <section className="border-y border-line bg-surface/60 py-6">
          <PlatformMarquee />
        </section>

        {/* ─── LE PROBLÈME ─── */}
        <section className={cn(container, "py-24 sm:py-32")}>
          <Reveal>
            <p className="eyebrow mb-5">Le problème</p>
          </Reveal>
          <WordReveal
            className={sectionTitle}
            segments={[
              { text: "Un portefeuille éclaté sur six plateformes" },
              { text: "n'est pas", tone: "violet" },
              { text: "un portefeuille." },
            ]}
          />

          <Reveal delay={120}>
            <div className="mt-14 overflow-hidden rounded-3xl border border-line">
              <div className="grid grid-cols-1 gap-4 border-b border-line bg-surface/60 px-6 py-4 sm:grid-cols-2 sm:gap-10 sm:px-8">
                <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-faint">
                  Aujourd&apos;hui
                </span>
                <span className="hidden text-[11px] font-bold uppercase tracking-[0.22em] text-jade sm:block">
                  Avec Hashory
                </span>
              </div>
              {comparison.map((row) => (
                <div
                  key={row.before}
                  className="grid grid-cols-1 gap-2 border-b border-line px-6 py-5 last:border-b-0 sm:grid-cols-2 sm:gap-10 sm:px-8"
                >
                  <p className="text-[15px] leading-relaxed text-faint line-through decoration-faint/50">
                    {row.before}
                  </p>
                  <p className="flex items-start gap-3 text-[15px] leading-relaxed text-foreground">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-jade" />
                    {row.after}
                  </p>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ─── L'APERÇU ─── */}
        <section id="apercu" className="scroll-mt-16 bg-surface py-24 sm:py-32">
          <div className={cn(container, "grid items-center gap-14 lg:grid-cols-12")}>
            <div className="lg:col-span-5">
              <Reveal>
                <p className="eyebrow mb-5">L&apos;aperçu</p>
              </Reveal>
              <WordReveal
                className="title text-4xl text-foreground sm:text-5xl"
                segments={[
                  { text: "Une" },
                  { text: "lecture,", tone: "violet" },
                  { text: "pas un tableau de bord de plus." },
                ]}
              />
              <Reveal delay={120}>
                <p className="mt-6 max-w-md text-[17px] leading-relaxed text-slate">
                  Valeur totale, P&amp;L de la période, ratio de Sharpe, répartition. Les mêmes
                  chiffres que vous calculiez à la main, tenus à jour tout seuls.
                </p>
                <div className="mt-8 flex flex-wrap gap-2">
                  {[
                    "Performance historique",
                    "Répartition consolidée",
                    "Historique filtrable",
                    "Export complet",
                  ].map((item, index) => (
                    <span key={item} className={cn("chip", index % 2 ? "chip-jade" : "chip-violet")}>
                      {item}
                    </span>
                  ))}
                </div>
              </Reveal>
            </div>

            <Reveal delay={160} className="lg:col-span-7">
              <HeroPreview />
            </Reveal>
          </div>
        </section>

        {/* ─── CE QUE ÇA FAIT ─── */}
        <section id="features" className={cn(container, "scroll-mt-16 py-24 sm:py-32")}>
          <Reveal>
            <p className="eyebrow mb-5">Ce que ça fait</p>
          </Reveal>
          <WordReveal
            className={sectionTitle}
            segments={[
              { text: "De la" },
              { text: "collecte", tone: "violet" },
              { text: "à la" },
              { text: "déclaration,", tone: "jade" },
              { text: "un seul outil." },
            ]}
          />

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((capability, index) => (
              <Reveal key={capability.title} delay={index * 60}>
                <GlowCard className="h-full rounded-2xl border border-line bg-card">
                  <article className="flex h-full flex-col p-7">
                    <span
                      className={cn(
                        "chip w-fit",
                        capability.tone === "violet" ? "chip-violet" : "chip-jade"
                      )}
                    >
                      {capability.tag}
                    </span>
                    <h3 className="mt-5 text-xl font-bold tracking-[-0.01em] text-foreground">
                      {capability.title}
                    </h3>
                    <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                      {capability.description}
                    </p>
                  </article>
                </GlowCard>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ─── COMMENT ÇA MARCHE ─── */}
        <section id="workflow" className="scroll-mt-16 bg-surface py-24 sm:py-32">
          <div className={container}>
            <Reveal>
              <p className="eyebrow mb-5">Comment ça marche</p>
            </Reveal>
            <WordReveal
              className={sectionTitle}
              segments={[
                { text: "Trois étapes," },
                { text: "deux minutes.", tone: "violet" },
              ]}
            />

            <div className="relative mt-16">
              {/* Le fil qui relie les étapes, du violet au jade */}
              <div
                className="scroll-progress absolute left-0 right-0 top-[11px] hidden h-px md:block"
                aria-hidden="true"
              />
              <ol className="grid gap-10 md:grid-cols-3 md:gap-8">
                {workflow.map((item, index) => (
                  <Reveal as="li" key={item.step} delay={index * 100}>
                    <span
                      className={cn(
                        "relative flex size-6 items-center justify-center rounded-full ring-4 ring-surface",
                        index === 0 && "bg-violet",
                        index === 1 && "bg-[color-mix(in_srgb,var(--violet),var(--jade))]",
                        index === 2 && "bg-jade"
                      )}
                    >
                      <span className="size-2 rounded-full bg-background" />
                    </span>
                    <p className="num mt-6 text-sm text-faint">{item.step}</p>
                    <h3 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-foreground">
                      {item.title}
                    </h3>
                    <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </Reveal>
                ))}
              </ol>
            </div>

            <div className="mt-20 grid gap-5 sm:grid-cols-3">
              {metrics.map((metric, index) => (
                <Reveal key={metric.label} delay={index * 70}>
                  <div className="h-full rounded-2xl border border-line bg-card px-7 py-8">
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-faint">
                      {metric.label}
                    </p>
                    <p className="mt-4 text-6xl font-bold tracking-[-0.04em] text-foreground">
                      <NumberTicker value={metric.value} suffix={metric.suffix} className="font-sans" />
                    </p>
                    <p className="mt-3 text-[15px] text-muted-foreground">{metric.description}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ─── TRANSPARENCE ─── */}
        <section id="transparence" className={cn(container, "scroll-mt-16 py-24 sm:py-32")}>
          <div className="grid gap-14 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Reveal>
                <p className="eyebrow mb-5">Transparence</p>
              </Reveal>
              <WordReveal
                className="title text-4xl text-foreground sm:text-5xl"
                segments={[
                  { text: "Un outil financier mérite d'être" },
                  { text: "vérifiable.", tone: "jade" },
                ]}
              />
              <Reveal delay={120}>
                <Button asChild variant="outline" size="lg" className="mt-10 px-6">
                  <a href={siteConfig.github} target="_blank" rel="noopener noreferrer">
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                    </svg>
                    Voir le code
                  </a>
                </Button>
              </Reveal>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:col-span-7">
              {transparency.map((item, index) => (
                <Reveal key={item.title} delay={index * 60}>
                  <div className="h-full rounded-2xl bg-surface p-7">
                    <h3 className="text-lg font-bold text-foreground">{item.title}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ─── QUESTIONS ─── */}
        <section className="bg-surface py-24 sm:py-32">
          <div className={cn(container, "grid gap-12 lg:grid-cols-12")}>
            <div className="lg:col-span-4">
              <Reveal>
                <p className="eyebrow mb-5">Questions</p>
              </Reveal>
              <WordReveal
                className="title text-4xl text-foreground"
                segments={[
                  { text: "Ce qu'on nous demande" },
                  { text: "le plus.", tone: "violet" },
                ]}
              />
            </div>

            <Reveal delay={120} className="lg:col-span-8">
              <Accordion type="single" collapsible className="w-full space-y-3">
                {faqItems.map((item, index) => (
                  <AccordionItem
                    key={item.question}
                    value={`item-${index + 1}`}
                    className="rounded-2xl border border-line bg-card px-6 last:border-b"
                  >
                    <AccordionTrigger className="py-5 text-left text-base font-bold hover:no-underline">
                      {item.question}
                    </AccordionTrigger>
                    <AccordionContent className="max-w-2xl pb-6 text-[15px] leading-relaxed text-muted-foreground">
                      {item.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Reveal>
          </div>
        </section>

        {/* ─── APPEL FINAL ─── */}
        <section className={cn(container, "py-24 sm:py-32")}>
          <Reveal>
            <div className="float-card relative overflow-hidden px-8 py-16 sm:px-14 sm:py-20">
              <div className="grid-paper pointer-events-none absolute inset-0" aria-hidden="true" />
              <div className="relative grid items-end gap-10 lg:grid-cols-12">
                <div className="lg:col-span-8">
                  <p className="eyebrow mb-5">Commencer</p>
                  <h2 className="title text-5xl text-foreground sm:text-6xl">
                    Voyez enfin <span className="text-violet">l&apos;ensemble</span>.
                  </h2>
                  <p className="mt-6 max-w-md text-[17px] leading-relaxed text-slate">
                    Connectez une première plateforme en deux minutes. Gratuit, open source, sans
                    carte bancaire.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 lg:col-span-4 lg:justify-end">
                  <Button asChild size="lg" className="px-7">
                    <Link href="/sign-up">
                      Créer un compte
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="px-6">
                    <Link href="/sign-in">J&apos;ai déjà un compte</Link>
                  </Button>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
