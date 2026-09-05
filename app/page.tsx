import type { ReactNode } from "react";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { GlowCard, Magnetic, NumberTicker, PointerAmbience, Reveal } from "@/components/motion";
import { DecoderField } from "@/components/landing/decoder-field";
import { HeroPreview } from "@/components/landing/hero-preview";
import { PlatformMarquee } from "@/components/landing/platform-marquee";
import { SiteFooter } from "@/components/site-footer";
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

const capabilities = [
  {
    index: "01",
    title: "Exchanges et wallets unifiés",
    description:
      "Binance, Kraken et KuCoin par API, vos adresses Bitcoin, Ethereum, Solana, Kaspa et Bittensor par clé publique. Une seule interface pour l'ensemble.",
  },
  {
    index: "02",
    title: "Performance réelle",
    description:
      "P&L par actif, par période et par plateforme. Prix de revient moyen, répartition, historique complet — calculés, pas saisis.",
  },
  {
    index: "03",
    title: "Synchronisation continue",
    description:
      "Trades, conversions, dépôts, retraits, soldes et poussière. Vos données se mettent à jour sans que vous y pensiez.",
  },
  {
    index: "04",
    title: "Déclaration fiscale française",
    description:
      "Plus-values imposables selon l'article 150 VH bis du CGI, avec le détail cession par cession, prêt à reporter.",
  },
  {
    index: "05",
    title: "Saisonnalité et cycles",
    description:
      "Le comportement de vos actifs mois par mois, pour situer votre performance dans le cycle de marché.",
  },
  {
    index: "06",
    title: "Lecture seule, par conception",
    description:
      "Clés API en lecture seule et chiffrées au repos, wallets suivis par adresse publique. Aucun accès à vos fonds, jamais.",
  },
];

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

/** En-tête de section : un numéro, un libellé, un filet. Pas de pastille. */
function SectionLabel({ index, children }: { index: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 border-b border-border/60 pb-4">
      <span className="num text-xs text-primary">{index}</span>
      <span className="num text-xs uppercase tracking-[0.28em] text-muted-foreground">
        {children}
      </span>
    </div>
  );
}

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <>
      <main className="relative">
        <PointerAmbience />

        {/* ─── HERO — asymétrique, aligné à gauche ─── */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-24 sm:px-6 md:pt-32">
          <div className="grid items-end gap-12 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-7">
              <Reveal>
                <p className="num flex items-center gap-3 text-xs uppercase tracking-[0.28em] text-muted-foreground">
                  <span className="h-px w-8 bg-primary" />
                  Terminal crypto open source
                </p>
              </Reveal>

              <Reveal delay={80}>
                <h1 className="mt-8 text-balance font-serif text-5xl font-normal leading-[0.95] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
                  Tous vos actifs crypto,
                  <br />
                  <span className="text-primary">dans un seul terminal.</span>
                </h1>
              </Reveal>

              <Reveal delay={140}>
                <p className="mt-7 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
                  Hashory agrège vos exchanges, vos wallets on-chain et vos imports de fichiers,
                  reconstitue votre historique complet, et va jusqu&apos;à votre déclaration fiscale.
                </p>
              </Reveal>

              <Reveal delay={200}>
                <div className="mt-10 flex flex-wrap items-center gap-3">
                  <Magnetic strength={8}>
                    <Button asChild size="lg" className="px-7">
                      <Link href="/sign-up">
                        Créer un compte gratuit
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </Magnetic>
                  <Magnetic strength={6}>
                    <Button
                      asChild
                      size="lg"
                      variant="ghost"
                      className="cursor-pointer px-5 text-muted-foreground hover:text-foreground"
                    >
                      <a href="#apercu">
                        Voir l&apos;aperçu
                        <ArrowUpRight className="ml-1.5 h-4 w-4" />
                      </a>
                    </Button>
                  </Magnetic>
                </div>
              </Reveal>

              <Reveal delay={260}>
                <p className="num mt-10 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/50">
                  Lecture seule · Clés chiffrées · Licence MIT
                </p>
              </Reveal>
            </div>

            {/* Champ de caractères : le curseur y décode des mots cachés. */}
            <Reveal delay={220} className="lg:col-span-5">
              <div className="relative hidden h-[440px] overflow-hidden border border-border/60 bg-[var(--surface-low)] md:block lg:h-[520px]">
                <DecoderField />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-border/50 bg-background/70 px-4 py-2.5 backdrop-blur">
                  <span className="num text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
                    Déplacez le curseur
                  </span>
                  <span className="num text-[10px] uppercase tracking-[0.2em] text-primary/70">
                    des mots s&apos;y cachent
                  </span>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ─── SOURCES ─── */}
        <section className="border-y border-border/60">
          <div className="mx-auto w-full max-w-6xl">
            <PlatformMarquee />
          </div>
        </section>

        {/* ─── 01 · LE PROBLÈME ─── */}
        <section className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
          <Reveal>
            <SectionLabel index="01">Le problème</SectionLabel>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="mt-10 max-w-2xl text-balance font-serif text-4xl font-normal leading-[1.05] text-foreground sm:text-5xl">
              Un portefeuille éclaté sur six plateformes n&apos;est pas un portefeuille.
            </h2>
          </Reveal>

          <div className="mt-14 border-t border-border/60">
            <div className="grid grid-cols-1 gap-4 border-b border-border/60 py-3 sm:grid-cols-2 sm:gap-10">
              <span className="num text-[10px] uppercase tracking-[0.28em] text-muted-foreground/60">
                Aujourd&apos;hui
              </span>
              <span className="num text-[10px] uppercase tracking-[0.28em] text-primary/70">
                Avec Hashory
              </span>
            </div>

            {comparison.map((row, index) => (
              <Reveal key={row.before} delay={index * 50}>
                <div className="grid grid-cols-1 gap-2 border-b border-border/60 py-5 transition-colors hover:bg-muted/20 sm:grid-cols-2 sm:gap-10">
                  <p className="text-sm leading-relaxed text-muted-foreground/70 line-through decoration-negative/40">
                    {row.before}
                  </p>
                  <p className="text-sm leading-relaxed text-foreground">{row.after}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ─── 02 · L'APERÇU ─── */}
        <section
          id="apercu"
          className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 pb-24 sm:px-6 lg:pb-32"
        >
          <Reveal>
            <SectionLabel index="02">L&apos;aperçu</SectionLabel>
          </Reveal>

          <div className="mt-10 grid gap-10 lg:grid-cols-12">
            <Reveal delay={60} className="lg:col-span-4">
              <h2 className="font-serif text-4xl font-normal leading-[1.05] text-foreground">
                Une lecture, pas un tableau de bord de plus.
              </h2>
              <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
                Valeur totale, P&amp;L de la période, ratio de Sharpe, répartition. Les mêmes chiffres
                que vous calculiez à la main, tenus à jour tout seuls.
              </p>
              <ul className="mt-8 border-t border-border/60">
                {[
                  "Performance historique et par actif",
                  "Répartition consolidée toutes sources",
                  "Historique filtrable jusqu'à la transaction",
                  "Export complet de vos données",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 border-b border-border/60 py-3 text-sm text-muted-foreground"
                  >
                    <span className="num mt-0.5 text-[10px] text-primary">→</span>
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={140} className="lg:col-span-8">
              <HeroPreview />
            </Reveal>
          </div>
        </section>

        {/* ─── 03 · CE QUE ÇA FAIT ─── */}
        <section
          id="features"
          className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 pb-24 sm:px-6 lg:pb-32"
        >
          <Reveal>
            <SectionLabel index="03">Ce que ça fait</SectionLabel>
          </Reveal>

          <div className="mt-10 grid border-t border-border/60 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((capability, index) => (
              <Reveal key={capability.index} delay={index * 60} className="border-b border-border/60">
                <GlowCard className="h-full">
                  <article className="flex h-full flex-col gap-4 p-7">
                    <span className="num text-xs text-primary">{capability.index}</span>
                    <h3 className="font-serif text-2xl font-normal leading-tight text-foreground">
                      {capability.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {capability.description}
                    </p>
                  </article>
                </GlowCard>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ─── 04 · COMMENT ÇA MARCHE ─── */}
        <section
          id="workflow"
          className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 pb-24 sm:px-6 lg:pb-32"
        >
          <Reveal>
            <SectionLabel index="04">Comment ça marche</SectionLabel>
          </Reveal>

          <div className="mt-10 border-t border-border/60">
            {workflow.map((item, index) => (
              <Reveal key={item.step} delay={index * 80}>
                <div className="grid grid-cols-1 gap-4 border-b border-border/60 py-10 transition-colors hover:bg-muted/20 md:grid-cols-12 md:gap-10">
                  <span className="num text-sm text-primary md:col-span-1">{item.step}</span>
                  <h3 className="font-serif text-3xl font-normal leading-tight text-foreground md:col-span-5">
                    {item.title}
                  </h3>
                  <p className="max-w-xl text-sm leading-relaxed text-muted-foreground md:col-span-6">
                    {item.description}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ─── CHIFFRES ─── */}
        <section className="border-y border-border/60">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-1 sm:grid-cols-3">
            {metrics.map((metric, index) => (
              <Reveal
                key={metric.label}
                delay={index * 70}
                className="border-b border-border/60 sm:border-b-0 sm:border-r sm:last:border-r-0"
              >
                <div className="h-full px-6 py-10">
                  <p className="num text-[10px] uppercase tracking-[0.24em] text-muted-foreground/60">
                    {metric.label}
                  </p>
                  <p className="mt-4 text-6xl text-foreground">
                    <NumberTicker
                      value={metric.value}
                      suffix={metric.suffix}
                      className="font-serif"
                    />
                  </p>
                  <p className="mt-3 text-sm text-muted-foreground">{metric.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ─── 05 · TRANSPARENCE ─── */}
        <section className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
          <Reveal>
            <SectionLabel index="05">Transparence</SectionLabel>
          </Reveal>

          <div className="mt-10 grid gap-12 lg:grid-cols-12">
            <Reveal delay={60} className="lg:col-span-5">
              <h2 className="font-serif text-4xl font-normal leading-[1.05] text-foreground sm:text-5xl">
                Un outil financier mérite d&apos;être vérifiable.
              </h2>
              <Magnetic strength={6}>
                <Button
                  asChild
                  variant="outline"
                  className="mt-8 cursor-pointer gap-2 border-border/60"
                >
                  <a href={siteConfig.github} target="_blank" rel="noopener noreferrer">
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                    </svg>
                    Voir le code
                  </a>
                </Button>
              </Magnetic>
            </Reveal>

            <div className="border-t border-border/60 lg:col-span-7">
              {transparency.map((item, index) => (
                <Reveal key={item.title} delay={index * 60}>
                  <div className="border-b border-border/60 py-6">
                    <h3 className="text-sm font-medium text-foreground">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ─── 06 · QUESTIONS ─── */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6 lg:pb-32">
          <Reveal>
            <SectionLabel index="06">Questions</SectionLabel>
          </Reveal>

          <div className="mt-10 grid gap-10 lg:grid-cols-12">
            <Reveal delay={60} className="lg:col-span-4">
              <h2 className="font-serif text-4xl font-normal leading-[1.05] text-foreground">
                Ce qu&apos;on nous demande le plus.
              </h2>
            </Reveal>

            <Reveal delay={120} className="lg:col-span-8">
              <Accordion type="single" collapsible className="w-full border-t border-border/60">
                {faqItems.map((item, index) => (
                  <AccordionItem key={item.question} value={`item-${index + 1}`}>
                    <AccordionTrigger className="py-5 text-left text-base font-medium hover:no-underline">
                      {item.question}
                    </AccordionTrigger>
                    <AccordionContent className="max-w-2xl pb-6 text-sm leading-relaxed text-muted-foreground">
                      {item.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Reveal>
          </div>
        </section>

        {/* ─── CTA FINAL ─── */}
        <section className="border-t border-border/60">
          <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
            <Reveal>
              <div className="grid items-end gap-10 lg:grid-cols-12">
                <div className="lg:col-span-7">
                  <h2 className="text-balance font-serif text-5xl font-normal leading-[0.98] text-foreground sm:text-6xl">
                    Voyez enfin l&apos;ensemble.
                  </h2>
                  <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
                    Connectez une première plateforme en deux minutes. Gratuit, open source,
                    sans carte bancaire.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 lg:col-span-5 lg:justify-end">
                  <Magnetic strength={8}>
                    <Button asChild size="lg" className="px-7">
                      <Link href="/sign-up">
                        Créer un compte
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </Magnetic>
                  <Magnetic strength={6}>
                    <Button
                      asChild
                      size="lg"
                      variant="ghost"
                      className="cursor-pointer text-muted-foreground hover:text-foreground"
                    >
                      <Link href="/sign-in">J&apos;ai déjà un compte</Link>
                    </Button>
                  </Magnetic>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
