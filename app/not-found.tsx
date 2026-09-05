import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page introuvable",
  description: "Cette page n'existe pas ou a été déplacée.",
};

/**
 * 404 rendue côté serveur pour toute route inconnue.
 * Volontairement sobre : un repère chiffré, une explication, une sortie.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-6xl items-center px-4 py-24 sm:px-6">
      <div className="w-full max-w-xl">
        <p className="num flex items-center gap-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          <span className="h-px w-6 bg-primary" />
          Erreur 404
        </p>

        <h1 className="mt-6 font-serif text-4xl font-normal leading-[1.05] text-foreground sm:text-5xl">
          Cette page n&apos;existe pas
        </h1>

        <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
          Le lien que vous avez suivi est peut-être obsolète, ou la page a été
          déplacée depuis. Rien n&apos;est perdu : reprenez depuis l&apos;accueil.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <Link href="/">Retour à l&apos;accueil</Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/changelog">Voir le changelog</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
