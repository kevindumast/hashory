import type { Metadata, Viewport } from "next";
import { Carlito, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/site-header";
import { RootLayoutClient } from "./layout-client";
import { getSiteUrl, siteConfig } from "@/lib/site";

// Calibri d'abord (installée sur Windows et macOS avec Office), Carlito
// ensuite : métriquement identique, elle garantit le même rendu ailleurs.
const sans = Carlito({
  variable: "--font-carlito",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

// Police tabulaire dédiée aux valeurs chiffrées (P&L, prix, quantités).
const mono = JetBrains_Mono({
  variable: "--font-numeric",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteConfig.title,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  keywords: [...siteConfig.keywords],
  authors: [{ name: siteConfig.name, url: siteUrl }],
  creator: siteConfig.name,
  publisher: siteConfig.name,
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: siteConfig.locale,
    url: siteUrl,
    siteName: siteConfig.name,
    title: siteConfig.title,
    description: siteConfig.description,
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.title,
    description: siteConfig.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [{ url: "/icons/hashory-icon.svg", type: "image/svg+xml" }],
    apple: "/icons/hashory-icon-maskable.svg",
    shortcut: "/icons/hashory-icon.svg",
    other: [
      { rel: "mask-icon", url: "/icons/hashory-icon-maskable.svg", color: "#151b23" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: siteConfig.name,
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${sans.variable} ${mono.variable} min-h-screen bg-background font-sans antialiased`}
      >
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
        >
          Aller au contenu principal
        </a>
        <RootLayoutClient>
          <Providers>
            <SiteHeader />
            <div id="contenu">{children}</div>
          </Providers>
        </RootLayoutClient>
        <Analytics />
      </body>
    </html>
  );
}
