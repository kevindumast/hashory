import Link from "next/link";
import { HashoryLogo } from "@/components/hashory-logo";
import { siteConfig } from "@/lib/site";

const columns = [
  {
    title: "Produit",
    links: [
      { label: "Fonctionnalités", href: "/#features" },
      { label: "Comment ça marche", href: "/#workflow" },
      { label: "Changelog", href: "/changelog" },
    ],
  },
  {
    title: "Commencer",
    links: [
      { label: "Créer un compte", href: "/sign-up" },
      { label: "Se connecter", href: "/sign-in" },
    ],
  },
  {
    title: "Projet",
    links: [
      { label: "Code source", href: siteConfig.github, external: true },
      { label: "Signaler un bug", href: `${siteConfig.github}/issues/new`, external: true },
      { label: "Nous écrire", href: `mailto:${siteConfig.contactEmail}`, external: true },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-xs space-y-3">
            <Link href="/" className="flex items-center gap-2">
              <HashoryLogo size={26} />
              <span className="text-base font-semibold tracking-tight text-foreground">
                {siteConfig.name}
              </span>
            </Link>
            <p className="text-sm leading-relaxed text-muted-foreground">
              L&apos;agrégateur de portefeuille crypto open source : vos exchanges, vos wallets et
              votre fiscalité dans un seul terminal.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {columns.map((column) => (
              <div key={column.title}>
                <p className="num mb-4 border-b border-border/60 pb-2 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                  {column.title}
                </p>
                <ul className="space-y-2">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {"external" in link && link.external ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-border/50 pt-6 sm:flex-row sm:items-center">
          <p className="num text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
            © {new Date().getFullYear()} {siteConfig.name} · Licence MIT
          </p>
          <p className="num text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
            Accès en lecture seule · Aucun accès à vos fonds
          </p>
        </div>
      </div>
    </footer>
  );
}
