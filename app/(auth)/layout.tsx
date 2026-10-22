import type { ReactNode } from "react";
import Link from "next/link";
import { HashoryLogo } from "@/components/hashory-logo";
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
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-surface px-10 py-12 lg:flex lg:w-[46%]">
        <div className="grid-paper pointer-events-none absolute inset-0" aria-hidden="true" />

        <Link href="/" className="relative flex items-center gap-2.5">
          <HashoryLogo size={28} />
          <span className="text-sm font-bold uppercase tracking-[0.28em] text-foreground">
            {siteConfig.name}
          </span>
        </Link>

        <div className="relative space-y-10">
          <div className="space-y-6">
            <p className="eyebrow">{siteConfig.tagline}
            </p>
            <h2 className="title text-4xl leading-[1.02] text-foreground">
              Tous vos actifs, <span className="text-violet">réunis</span> et{" "}
              <span className="text-jade">déclarés</span>.
            </h2>
          </div>

          <ul className="space-y-2.5">
            {perks.map((perk) => (
              <li key={perk} className="flex items-start gap-3 text-[15px] text-slate">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-jade" />
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
