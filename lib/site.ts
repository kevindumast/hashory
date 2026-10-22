/**
 * Configuration centrale du site — utilisée par les métadonnées, le sitemap,
 * les cartes Open Graph et les liens externes.
 */
export const siteConfig = {
  name: "Hashory",
  title: "Hashory — Tous vos actifs crypto, réunis et déclarés",
  description:
    "Exchanges, wallets on-chain et imports CSV réunis dans un seul portefeuille : performance réelle, et plus-values calculées selon l'article 150 VH bis. Open source, en lecture seule.",
  tagline: "Agrégateur crypto open source",
  locale: "fr_FR",
  github: "https://github.com/kevindumast/hashory",
  contactEmail: "contact@hashory.app",
  keywords: [
    "portefeuille crypto",
    "agrégateur crypto",
    "suivi portefeuille bitcoin",
    "P&L crypto",
    "déclaration fiscale crypto",
    "Binance",
    "KuCoin",
    "open source",
  ],
} as const;

/** URL publique du site, dérivée de l'environnement de déploiement. */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  // En production, l'adresse publique du projet. L'URL propre à chaque
  // déploiement est protégée par Vercel : LinkedIn ou X qui y cherchaient
  // l'image de partage tombaient sur une page de connexion, sans vignette.
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (process.env.VERCEL_ENV === "production" && production) {
    return `https://${production.replace(/\/$/, "")}`;
  }

  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return "https://hashory.app";
}
