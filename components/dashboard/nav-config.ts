import {
  Activity, ArrowLeftRight, CalendarDays, FileText, KeyRound, LayoutDashboard,
  Sparkles, Wallet, type LucideIcon,
} from "lucide-react"

export type NavItem = {
  href: string
  label: string
  /** Libellé court pour la barre d'onglets mobile. */
  shortLabel?: string
  icon: LucideIcon
}

export type NavSection = { title: string; links: NavItem[] }

/**
 * Source unique de la navigation du tableau de bord : la sidebar (bureau),
 * la barre d'onglets (mobile) et le titre de la barre du haut s'en servent.
 */
export const navSections: NavSection[] = [
  {
    title: "Portefeuille",
    links: [
      { href: "/dashboard", label: "Synthèse", icon: LayoutDashboard },
      { href: "/dashboard/accounts", label: "Mes comptes", shortLabel: "Comptes", icon: Wallet },
      { href: "/dashboard/performance", label: "Performance", shortLabel: "Analyse", icon: Activity },
      { href: "/dashboard/seasonal", label: "Saisonnalité", icon: CalendarDays },
    ],
  },
  {
    title: "Fiscalité",
    links: [
      { href: "/dashboard/tax-report", label: "Déclaration fiscale", shortLabel: "Fiscalité", icon: FileText },
      { href: "/dashboard/transactions", label: "Transactions", icon: ArrowLeftRight },
    ],
  },
  {
    title: "Réglages",
    links: [
      { href: "/dashboard/settings/api-keys", label: "Clés d'API", icon: KeyRound },
      { href: "/dashboard/settings/claude", label: "Connecter Claude", icon: Sparkles },
    ],
  },
]

const allLinks = navSections.flatMap((section) => section.links)

function link(href: string): NavItem {
  const item = allLinks.find((l) => l.href === href)
  if (!item) throw new Error(`Lien de navigation inconnu : ${href}`)
  return item
}

/** Onglets toujours visibles sur mobile. */
export const mobileTabs: NavItem[] = [
  "/dashboard",
  "/dashboard/accounts",
  "/dashboard/performance",
  "/dashboard/tax-report",
].map(link)

/** Pages rangées derrière l'onglet « Plus » sur mobile. */
export const mobileMore: NavItem[] = allLinks.filter((l) => !mobileTabs.includes(l))

export function isActivePath(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href))
}

/** Lien actif le plus précis pour une URL donnée. */
export function findActiveLink(pathname: string): NavItem | undefined {
  return allLinks
    .filter((l) => isActivePath(pathname, l.href))
    .sort((a, b) => b.href.length - a.href.length)[0]
}
