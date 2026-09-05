import type { ReactNode } from "react";
import Link from "next/link";
import { HashoryLogo } from "@/components/hashory-logo";
import { DecoderField } from "@/components/landing/decoder-field";
import { siteConfig } from "@/lib/site";

const perks = [
  "Exchanges, wallets on-chain et imports CSV réunis",
  "P&L automatique par actif et par période",
  "Plus-values calculées selon l'article 150 VH bis",
  "Accès en lecture seule, clés chiffrées au repos",
];

type AuthLayoutProps = {
  children: ReactNode;
};

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen">
      {/* Colonne éditoriale — reprend le vocabulaire de la page d'accueil */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-border/60 bg-[var(--surface-low)] px-10 py-12 lg:flex lg:w-[46%]">
        {/* Champ de caractères, très en retrait : la signature reste lisible
            sans jamais concurrencer le formulaire. */}
        <div className="pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,transparent,#000_30%,#000_70%,transparent)]">
          <DecoderField />
        </div>

        <Link href="/" className="relative flex items-center gap-2.5">
          <HashoryLogo size={28} />
          <span className="text-base font-semibold tracking-tight text-foreground">
            {siteConfig.name}
          </span>
        </Link>

        <div className="relative space-y-10">
          <div className="space-y-6">
            <p className="num flex items-center gap-3 text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
              <span className="h-px w-6 bg-primary" />
              {siteConfig.tagline}
            </p>
            <h2 className="text-balance font-serif text-4xl font-normal leading-[1.02] text-foreground">
              Tous vos actifs,
              <br />
              <span className="text-primary">un seul terminal.</span>
            </h2>
          </div>

          <ul className="border-t border-border/60">
            {perks.map((perk) => (
              <li
                key={perk}
                className="flex items-start gap-3 border-b border-border/60 py-3 text-sm text-muted-foreground"
              >
                <span className="num mt-0.5 text-[10px] text-primary">→</span>
                {perk}
              </li>
            ))}
          </ul>
        </div>

        <p className="num relative text-[10px] uppercase tracking-[0.22em] text-muted-foreground/60">
          Open source · Licence MIT · Aucun accès à vos fonds
        </p>
      </div>

      {/* Colonne formulaire */}
      <div className="relative flex flex-1 flex-col items-center justify-center bg-background px-4 py-12 sm:px-8">
        <Link href="/" className="mb-10 flex items-center gap-2 lg:hidden">
          <HashoryLogo size={26} />
          <span className="text-base font-semibold text-foreground">{siteConfig.name}</span>
        </Link>

        <div className="relative w-full max-w-sm">{children}</div>

        <p className="num mt-10 text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50">
          Lecture seule · Clés chiffrées
        </p>
      </div>
    </div>
  );
}
