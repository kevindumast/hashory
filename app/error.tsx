"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Boundary d'erreur de segment : capture tout ce qui casse sous le layout
 * racine. Le détail technique n'est montré qu'en développement — en
 * production l'utilisateur ne voit qu'un message générique et le digest.
 */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("[app] Erreur non gérée :", error);
  }, [error]);

  const isDevelopment = process.env.NODE_ENV === "development";

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-6xl items-center px-4 py-24 sm:px-6">
      <div className="w-full max-w-2xl">
        <p className="num flex items-center gap-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          <span className="h-px w-6 bg-destructive" />
          Erreur inattendue
        </p>

        <h1 className="mt-6 font-serif text-4xl font-normal leading-[1.05] text-foreground sm:text-5xl">
          Quelque chose s&apos;est mal passé
        </h1>

        <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
          Nous n&apos;avons pas pu afficher cette page. Réessayez dans un
          instant, ou revenez à l&apos;accueil.
        </p>

        {isDevelopment && error.message ? (
          <pre className="num scrollbar-subtle mt-8 max-h-56 overflow-auto border-y border-border/60 py-4 text-left text-xs leading-relaxed text-muted-foreground">
            {error.message}
          </pre>
        ) : null}

        {error.digest ? (
          <p className="num mt-4 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
            Référence : {error.digest}
          </p>
        ) : null}

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={reset}>
            Réessayer
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/">Retour à l&apos;accueil</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
