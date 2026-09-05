"use client";

import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Dernier filet de sécurité : cette boundary remplace le layout racine,
 * donc ni `globals.css` ni les composants UI ne sont montés. Tout est
 * volontairement autonome et inline — les valeurs reprennent simplement
 * les jetons du thème sombre (`--background` / `--foreground`).
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("[app] Erreur racine :", error);
  }, [error]);

  const isDevelopment = process.env.NODE_ENV === "development";

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1rem",
          colorScheme: "dark",
          backgroundColor: "#070d1f",
          color: "#dfe4ff",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div style={{ maxWidth: "32rem", textAlign: "center" }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.75rem",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              opacity: 0.7,
            }}
          >
            Erreur critique
          </p>

          <h1
            style={{
              margin: "1rem 0 0",
              fontSize: "1.5rem",
              fontWeight: 600,
              lineHeight: 1.25,
            }}
          >
            L&apos;application n&apos;a pas pu démarrer
          </h1>

          <p
            style={{
              margin: "0.75rem 0 0",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              opacity: 0.75,
            }}
          >
            Une erreur inattendue a interrompu le chargement. Réessayez, puis
            rechargez la page si le problème persiste.
          </p>

          {isDevelopment && error.message ? (
            <pre
              style={{
                margin: "1.5rem 0 0",
                maxHeight: "14rem",
                overflow: "auto",
                borderRadius: "0.5rem",
                border: "1px solid rgba(223, 228, 255, 0.16)",
                background: "rgba(255, 255, 255, 0.04)",
                padding: "1rem",
                textAlign: "left",
                fontSize: "0.75rem",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}
            >
              {error.message}
            </pre>
          ) : null}

          {error.digest ? (
            <p
              style={{
                margin: "1rem 0 0",
                fontSize: "0.75rem",
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                opacity: 0.6,
              }}
            >
              Référence : {error.digest}
            </p>
          ) : null}

          <div
            style={{
              marginTop: "2rem",
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "0.75rem",
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                cursor: "pointer",
                borderRadius: "0.5rem",
                border: "none",
                padding: "0.625rem 1.25rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                fontFamily: "inherit",
                backgroundColor: "#b4c5ff",
                color: "#00389a",
              }}
            >
              Réessayer
            </button>

            {/* Navigation « dure » assumée : next/link réutiliserait le routeur
                client, celui-là même qui vient d'échouer. Un rechargement
                complet repart d'un état sain. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                borderRadius: "0.5rem",
                border: "1px solid rgba(223, 228, 255, 0.24)",
                padding: "0.625rem 1.25rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              Retour à l&apos;accueil
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
