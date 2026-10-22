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
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-8">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-xs space-y-3">
            <Link href="/" className="flex items-center gap-2.5">
              <HashoryLogo size={24} />
              <span className="text-sm font-bold uppercase tracking-[0.28em] text-foreground">
                {siteConfig.name}
              </span>
            </Link>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              L&apos;agrégateur de portefeuille crypto open source : vos exchanges, vos wallets et
              votre fiscalité dans un seul terminal.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {columns.map((column) => (
              <div key={column.title}>
                <p className="eyebrow mb-4 text-[11px]">
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
                          className="text-[15px] text-slate transition-colors hover:text-foreground"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-[15px] text-slate transition-colors hover:text-foreground"
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

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-border pt-6 sm:flex-row sm:items-center">
          <p className="text-sm text-faint">
            © {new Date().getFullYear()} {siteConfig.name} · Licence MIT
          </p>
          <p className="text-sm text-faint">
            Accès en lecture seule · Aucun accès à vos fonds
          </p>
        </div>
      </div>
    </footer>
  );
}
