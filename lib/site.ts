/**
 * Configuration centrale du site — utilisée par les métadonnées, le sitemap,
 * les cartes Open Graph et les liens externes.
 */
export const siteConfig = {
  name: "Hashory",
  title: "Hashory — Tous vos actifs crypto dans un seul terminal",
  description:
    "Hashory agrège vos exchanges CEX, vos wallets DEX et vos positions on-chain pour vous donner une vue claire, complète et en temps réel de votre portefeuille crypto.",
  tagline: "Terminal crypto open source",
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

  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return "https://hashory.app";
}
