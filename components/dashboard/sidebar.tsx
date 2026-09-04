"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Wallet, LayoutDashboard, FileText, ArrowLeftRight, CalendarDays,
  User, Settings, LogOut, Menu, MoreHorizontal, Plug,
} from "lucide-react"
import { useUser, useClerk } from "@clerk/nextjs"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { useState } from "react"
import { HashoryLogo } from "@/components/hashory-logo"
import { useDashboardData } from "@/components/dashboard/dashboard-data-context"
import { useProviderDialog } from "@/components/dashboard/provider-dialog-context"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const navSections = [
  {
    title: "Portefeuille",
    links: [
      { href: "/dashboard/accounts", label: "Mes comptes", badge: null, icon: Wallet },
      { href: "/dashboard", label: "Portefeuille", badge: null, icon: LayoutDashboard },
      { href: "/dashboard/seasonal", label: "Saisonnalité", badge: null, icon: CalendarDays },
    ],
  },
  {
    title: "Fiscalité",
    links: [
      { href: "/dashboard/tax-report", label: "Déclaration fiscale", badge: null, icon: FileText },
      { href: "/dashboard/transactions", label: "Transactions", badge: null, icon: ArrowLeftRight },
    ],
  },
]

/** Compteur de transactions affiché en pastille dans la navigation. */
function useTransactionBadge() {
  const { transactions, isLoading } = useDashboardData()
  return isLoading ? null : String(transactions.length)
}

export function Sidebar() {
  const transactionCount = useTransactionBadge()
  const { integrationsCount } = useDashboardData()
  const { openDialog } = useProviderDialog()

  return (
    <aside className="hidden md:flex flex-col w-[220px] h-screen bg-sidebar border-r border-sidebar-border tracking-tight antialiased shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-[57px] border-b border-sidebar-border">
        <HashoryLogo size={22} />
        <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">Hashory</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-subtle px-3 py-3 flex flex-col gap-5">
        {navSections.map((section) => (
          <div key={section.title}>
            <p className="num px-2 mb-2 text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">
              {section.title}
            </p>
            <div className="flex flex-col gap-0.5">
              {section.links.map((link) => (
                <SidebarLink
                  key={link.href}
                  {...link}
                  badge={link.href === "/dashboard/transactions" ? transactionCount : link.badge}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Raccourci de connexion — l'action principale tant que rien n'est branché */}
        <button
          type="button"
          onClick={openDialog}
          className={cn(
            "mt-auto flex cursor-pointer items-center gap-2.5 border-t border-border/60 px-2 py-3 text-sm transition-colors",
            "text-sidebar-primary hover:bg-muted/20",
            integrationsCount === 0 && "text-primary"
          )}
        >
          <Plug className="size-4 shrink-0" />
          <span className="num flex-1 text-left text-[11px] uppercase tracking-[0.18em]">Connecter</span>
        </button>
      </nav>

      {/* Utilisateur */}
      <div className="border-t border-sidebar-border px-3 py-2.5">
        <UserMenu />
      </div>
    </aside>
  )
}

/** Menu compte branché sur Clerk : profil, paramètres et déconnexion réels. */
function UserMenu({ compact = false }: { compact?: boolean }) {
  const { user, isLoaded } = useUser()
  const { signOut, openUserProfile } = useClerk()
  const router = useRouter()

  if (!isLoaded) {
    return (
      <div className="flex items-center gap-2.5 px-2 py-1.5">
        <span className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-muted" />
        <div className="flex-1 space-y-1">
          <span className="block h-2.5 w-24 animate-pulse rounded bg-muted" />
          <span className="block h-2 w-32 animate-pulse rounded bg-muted" />
        </div>
      </div>
    )
  }

  const displayName =
    user?.fullName ?? user?.firstName ?? user?.username ?? "Mon compte"
  const email = user?.primaryEmailAddress?.emailAddress ?? ""
  const initials = (user?.firstName?.[0] ?? displayName[0] ?? "H").toUpperCase() +
    (user?.lastName?.[0] ?? "").toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full cursor-pointer items-center gap-2.5 px-2 py-2 transition-colors hover:bg-muted/20">
          <Avatar className="h-7 w-7 border border-sidebar-border shrink-0">
            {user?.imageUrl ? <AvatarImage src={user.imageUrl} alt={displayName} /> : null}
            <AvatarFallback className="bg-muted text-sidebar-primary text-[10px] font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!compact && (
            <>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[12px] font-medium text-sidebar-foreground truncate leading-tight">
                  {displayName}
                </p>
                <p className="text-[10px] text-muted-foreground truncate leading-tight">{email}</p>
              </div>
              <MoreHorizontal className="size-3.5 text-muted-foreground shrink-0" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[220px]" align="end" side="top">
        <DropdownMenuLabel className="text-xs text-muted-foreground truncate">
          {email || "Mon compte"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer text-sm" onSelect={() => openUserProfile()}>
          <User className="mr-2 h-3.5 w-3.5" /> Profil
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer text-sm">
          <Link href="/dashboard/accounts">
            <Settings className="mr-2 h-3.5 w-3.5" /> Comptes connectés
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-sm text-destructive focus:text-destructive"
          onSelect={() => {
            void signOut(() => router.push("/"))
          }}
        >
          <LogOut className="mr-2 h-3.5 w-3.5" /> Déconnexion
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SidebarLink({ href, label, badge, icon: Icon }: { href: string; label: string; badge: string | null; icon: React.ElementType }) {
  const pathname = usePathname()
  const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href))

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 border-l-2 py-2 pl-3 pr-2 text-sm transition-colors",
        isActive
          ? "border-primary bg-muted/30 text-sidebar-foreground"
          : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/20 hover:text-sidebar-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1">{label}</span>
      {badge && (
        <span className="num text-[11px] font-medium text-muted-foreground">{badge}</span>
      )}
    </Link>
  )
}

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()
  const transactionCount = useTransactionBadge()

  return (
    <div className="flex md:hidden sticky top-0 z-40 h-[57px] items-center justify-between border-b border-sidebar-border bg-sidebar/95 backdrop-blur px-4">
      <div className="flex items-center gap-2">
        <HashoryLogo size={22} />
        <span className="text-sm font-semibold text-sidebar-foreground">Hashory</span>
      </div>
      <div className="flex items-center gap-1">
        <UserMenu compact />
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-sidebar-foreground" aria-label="Ouvrir la navigation">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex w-[240px] flex-col gap-0 bg-sidebar border-r border-sidebar-border p-0">
            <div className="flex items-center gap-2 px-4 h-[57px] border-b border-sidebar-border">
              <HashoryLogo size={22} />
              <span className="text-sm font-semibold text-sidebar-foreground">Hashory</span>
            </div>
            <nav className="flex-1 px-3 py-3 flex flex-col gap-5">
              {navSections.map((section) => (
                <div key={section.title}>
                  <p className="num px-2 mb-2 text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">
                    {section.title}
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {section.links.map((link) => {
                      const Icon = link.icon
                      const isActive = pathname === link.href || (link.href !== "/dashboard" && pathname.startsWith(link.href))
                      const badge = link.href === "/dashboard/transactions" ? transactionCount : link.badge
                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          onClick={() => setIsOpen(false)}
                          aria-current={isActive ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-2.5 border-l-2 py-2 pl-3 pr-2 text-sm transition-colors",
                            isActive
                              ? "border-primary bg-muted/30 text-sidebar-foreground"
                              : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/20 hover:text-sidebar-foreground"
                          )}
                        >
                          <Icon className="size-4 shrink-0" />
                          <span className="flex-1">{link.label}</span>
                          {badge && <span className="num text-[11px] text-muted-foreground">{badge}</span>}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  )
}
