import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Sora } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/site-header";

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

const body = Sora({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Oracly",
  description:
    "Predict. Optimize. Master your crypto portfolio with Oracly's real-time intelligence.",
  applicationName: "Oracly",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/oracly-icon.svg", type: "image/svg+xml" },
    ],
    apple: "/icons/oracly-icon-maskable.svg",
    shortcut: "/icons/oracly-icon.svg",
    other: [
      { rel: "mask-icon", url: "/icons/oracly-icon-maskable.svg", color: "#2563eb" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Oracly",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fb" },
    { media: "(prefers-color-scheme: dark)", color: "#050506" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        suppressHydrationWarning
        className={`${display.variable} ${body.variable} min-h-screen bg-background font-sans`}
      >
        <Providers>
          <SiteHeader />
          {children}
        </Providers>
      </body>
    </html>
  );
}
