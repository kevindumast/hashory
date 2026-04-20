import type { ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

const perks = [
  "CEX, DEX et wallets on-chain unifiés",
  "P&L automatique par actif et par période",
  "Synchronisation continue, zéro saisie manuelle",
  "Open source · Accès lecture seule · Chiffrement bancaire",
];

type AuthLayoutProps = {
  children: ReactNode;
};

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen">
      {/* Left panel — always dark, branding */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#070d1f] px-10 py-12 lg:flex lg:w-[45%]">
        {/* Dot grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "radial-gradient(circle, #b4c5ff 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        {/* Glow */}
        <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-[#b4c5ff]/10 blur-3xl" />

        {/* Logo */}
        <Link href="/" className="relative flex items-center gap-2.5 text-[#dfe4ff]">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#b4c5ff]/30 bg-[#b4c5ff]/10 text-sm font-bold text-[#b4c5ff]">
            T
          </span>
          <span className="text-lg font-semibold tracking-tight">Termenva</span>
        </Link>

        {/* Center content */}
        <div className="relative space-y-8">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#b4c5ff]/60">
              Terminal crypto open source
            </p>
            <h2 className="text-balance text-3xl font-bold leading-tight text-[#dfe4ff]">
              Tous vos actifs,<br />un seul terminal.
            </h2>
            <p className="text-sm leading-relaxed text-[#dfe4ff]/50">
              Connectez vos exchanges et wallets en quelques minutes
              et visualisez l&apos;intégralité de votre portefeuille crypto.
            </p>
          </div>
          <ul className="space-y-3">
            {perks.map((p) => (
              <li key={p} className="flex items-start gap-3 text-sm text-[#dfe4ff]/70">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#9bffce]" />
                {p}
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom quote */}
        <div className="relative rounded-xl border border-[#b4c5ff]/10 bg-[#b4c5ff]/5 p-4">
          <p className="text-sm italic text-[#dfe4ff]/60">
            &ldquo;Enfin un outil qui centralise vraiment tout — Binance, wallets ETH et positions DeFi.&rdquo;
          </p>
          <p className="mt-2 text-xs text-[#dfe4ff]/40">Maya · Trader DeFi indépendante</p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-8">
        {/* Background effect */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-primary/5 to-transparent" />

        {/* Mobile logo */}
        <Link href="/" className="mb-8 flex items-center gap-2 lg:hidden">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-sm font-bold text-primary">
            T
          </span>
          <span className="text-base font-semibold text-foreground">Termenva</span>
        </Link>

        <div className="relative w-full max-w-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
