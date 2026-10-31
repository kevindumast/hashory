"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { motion, useReducedMotion } from "motion/react"
import { User, Settings, LogOut, MoreHorizontal, Plug, Sparkles } from "lucide-react"
import { useUser, useClerk } from "@clerk/nextjs"
import { cn } from "@/lib/utils"
import { formatRelative } from "@/lib/format-relative"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { HashoryLogo } from "@/components/hashory-logo"
import { useDashboardData } from "@/components/dashboard/dashboard-data-context"
import { useProviderDialog } from "@/components/dashboard/provider-dialog-context"
import { PrivacyToggle } from "@/components/dashboard/privacy-mode"
import { findActiveLink, navSections, type NavItem } from "@/components/dashboard/nav-config"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/** Compteur de transactions affiché en pastille dans la navigation. */
function useTransactionBadge() {
  const { transactions, isLoading } = useDashboardData()
  return isLoading ? null : String(transactions.length)
}

type SidebarProps = {
  /** Replié : un rail d'icônes, les libellés passent en infobulle. */
  collapsed?: boolean
}

/**
 * Navigation bureau. Dépliée, elle montre sections et libellés ; repliée,
 * elle se réduit à un rail d'icônes plutôt que de disparaître.
 */
export function Sidebar({ collapsed = false }: SidebarProps) {
  const pathname = usePathname()
  const activeHref = findActiveLink(pathname)?.href
  const transactionCount = useTransactionBadge()

  return (
    <aside className="hidden md:flex h-full w-full flex-col bg-sidebar border-r border-sidebar-border tracking-tight antialiased">
      {/* Logo */}
      <Link
        href="/dashboard"
        aria-label="Retour à la synthèse"
        className={cn(
          "flex h-[57px] shrink-0 items-center gap-2 border-b border-sidebar-border transition-opacity hover:opacity-80",
          collapsed ? "justify-center" : "px-5"
        )}
      >
        <HashoryLogo size={22} />
        {!collapsed && <span className="text-[15px] font-bold tracking-tight text-sidebar-foreground">Hashory</span>}
      </Link>

      {/* Nav */}
      <nav
        aria-label="Navigation principale"
        className="flex flex-1 flex-col gap-5 overflow-y-auto scrollbar-none px-3 py-4"
      >
        {navSections.map((section, index) => (
          <div key={section.title}>
            {collapsed ? (
              index > 0 && <span aria-hidden className="mx-auto mb-3 block h-px w-6 bg-line" />
            ) : (
              <p className="eyebrow mb-1.5 px-3 text-[10px] text-muted-foreground">{section.title}</p>
            )}
            <div className="flex flex-col gap-0.5">
              {section.links.map((link) => (
                <SidebarLink
                  key={link.href}
                  item={link}
                  active={link.href === activeHref}
                  collapsed={collapsed}
                  badge={link.href === "/dashboard/transactions" ? transactionCount : null}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <SyncFooter collapsed={collapsed} />
    </aside>
  )
}

function SidebarLink({
  item: { href, label, icon: Icon },
  active,
  collapsed,
  badge,
}: {
  item: NavItem
  active: boolean
  collapsed: boolean
  badge: string | null
}) {
  const reduceMotion = useReducedMotion()

  const link = (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(
        "relative isolate flex h-9 items-center gap-3 rounded-xl text-sm transition-colors",
        collapsed ? "justify-center" : "px-3",
        active
          ? "font-bold text-sidebar-foreground"
          : "text-muted-foreground hover:bg-surface/60 hover:text-sidebar-foreground"
      )}
    >
      {active && (
        <motion.span
          layoutId="sidebar-indicator"
          aria-hidden
          className="absolute inset-0 -z-10 rounded-xl bg-surface"
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }}
        />
      )}
      <Icon className={cn("size-[18px] shrink-0", active && "text-violet")} strokeWidth={active ? 2.3 : 2} />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {!collapsed && badge && (
        <span className="num rounded-md bg-background/70 px-1.5 text-[11px] font-medium text-muted-foreground">
          {badge}
        </span>
      )}
    </Link>
  )

  if (!collapsed) return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Pied de sidebar : l'état de synchronisation des sources (comme le
 * bandeau « Mise à jour disponible » d'une appli bancaire), et l'action
 * de connexion.
 */
function SyncFooter({ collapsed }: { collapsed: boolean }) {
  const { integrations, isLoadingIntegrations } = useDashboardData()
  const { openDialog } = useProviderDialog()

  const errors = integrations.filter((i) => i.syncStatus === "error").length
  const syncing = integrations.some((i) => i.syncStatus === "syncing")
  const lastSync = integrations.reduce<number | null>(
    (max, i) => (i.lastSyncedAt && (!max || i.lastSyncedAt > max) ? i.lastSyncedAt : max),
    null
  )

  const dot = errors > 0 ? "bg-negative" : syncing ? "bg-positive animate-pulse" : "bg-positive"
  const status =
    errors > 0
      ? `${errors} source${errors > 1 ? "s" : ""} en erreur`
      : syncing
        ? "Synchronisation…"
        : lastSync
          ? `À jour ${formatRelative(lastSync)}`
          : "Jamais synchronisé"

  const connect = (
    <button
      type="button"
      onClick={openDialog}
      aria-label={collapsed ? "Connecter une source" : undefined}
      className={cn(
        "flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-foreground text-sm font-bold text-background transition-opacity hover:opacity-90",
        collapsed && "mx-auto w-9"
      )}
    >
      <Plug className="size-4 shrink-0" />
      {!collapsed && "Connecter une source"}
    </button>
  )

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-3 border-t border-sidebar-border px-3 py-3">
        {integrations.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/dashboard/accounts" aria-label={status} className="flex size-9 items-center justify-center rounded-xl hover:bg-surface/60">
                <span className={cn("size-2 rounded-full", dot)} />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{status}</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>{connect}</TooltipTrigger>
          <TooltipContent side="right">Connecter une source</TooltipContent>
        </Tooltip>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 border-t border-sidebar-border p-3">
      {!isLoadingIntegrations && integrations.length > 0 && (
        <Link
          href="/dashboard/accounts"
          className="flex items-center gap-3 rounded-2xl bg-surface px-3 py-2.5 transition-colors hover:bg-muted"
        >
          <span className={cn("size-2 shrink-0 rounded-full", dot)} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold text-sidebar-foreground">
              {integrations.length} source{integrations.length > 1 ? "s" : ""}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">{status}</span>
          </span>
        </Link>
      )}
      {connect}
    </div>
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
        <DropdownMenuItem asChild className="cursor-pointer text-sm">
          <Link href="/dashboard/settings/claude">
            <Sparkles className="mr-2 h-3.5 w-3.5" /> Connecter Claude
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

/**
 * En-tête mobile : logo, mode discret et compte. La navigation elle-même
 * vit dans la barre d'onglets du bas (`BottomNav`).
 */
export function MobileNav() {
  return (
    <div className="flex md:hidden sticky top-0 z-40 h-[57px] items-center justify-between border-b border-sidebar-border bg-sidebar/95 backdrop-blur px-4 pt-[env(safe-area-inset-top)] box-content">
      <Link href="/dashboard" aria-label="Retour au portefeuille" className="flex items-center gap-2">
        <HashoryLogo size={22} />
        <span className="text-sm font-semibold text-sidebar-foreground">Hashory</span>
      </Link>
      <div className="flex items-center gap-1">
        <PrivacyToggle />
        <UserMenu compact />
      </div>
    </div>
  )
}
