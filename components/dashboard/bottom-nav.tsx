"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { MoreHorizontal, Plug } from "lucide-react"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { useProviderDialog } from "@/components/dashboard/provider-dialog-context"
import { useDashboardData } from "@/components/dashboard/dashboard-data-context"
import { isActivePath, mobileMore as moreItems, mobileTabs as primaryTabs } from "@/components/dashboard/nav-config"

const tabClass =
  "pressable relative flex h-14 flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-full text-[11px] font-bold"

/**
 * Barre d'onglets flottante, mobile uniquement. Une pilule posée en bas de
 * l'écran ; l'onglet actif se détache sur une pilule intérieure.
 *
 * La pilule ne glisse pas d'un onglet à l'autre : le changement d'onglet
 * coïncide avec le chargement de la page, moment où une animation pilotée
 * en JS (layout de Motion) perd des images. Le retour vient de l'appui
 * (`pressable`), immédiat.
 */
export function BottomNav() {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)
  const { openDialog } = useProviderDialog()
  const { transactions, isLoading } = useDashboardData()

  const moreActive = moreItems.some((item) => isActivePath(pathname, item.href))
  const activeKey =
    primaryTabs.find((tab) => isActivePath(pathname, tab.href))?.href ?? (moreActive ? "more" : null)

  const indicator = <span aria-hidden className="absolute inset-0 -z-10 rounded-full bg-surface" />

  return (
    <>
      {/* Réserve la hauteur de la barre pour que la fin du contenu reste lisible. */}
      <div aria-hidden className="h-[calc(6rem+env(safe-area-inset-bottom))] md:hidden" />

      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-40 pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] md:hidden"
      >
        <div className="isolate mx-auto flex max-w-md items-center gap-1 rounded-full border border-line bg-card p-1.5 shadow-[var(--shadow-float)]">
          {primaryTabs.map(({ href, label, shortLabel, icon: Icon }) => {
            const active = activeKey === href
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(tabClass, active ? "text-foreground" : "text-muted-foreground")}
              >
                {active && indicator}
                <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
                <span>{shortLabel ?? label}</span>
              </Link>
            )
          })}

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={cn(tabClass, activeKey === "more" ? "text-foreground" : "text-muted-foreground")}
          >
            {activeKey === "more" && indicator}
            <MoreHorizontal className="size-5" />
            <span>Plus</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="gap-0 rounded-t-3xl border-line bg-card px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3"
        >
          {/* Poignée : signale que la feuille se ferme d'un glisser vers le bas. */}
          <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-border" />
          <SheetTitle className="eyebrow px-2">Plus</SheetTitle>
          <SheetDescription className="sr-only">Autres pages du tableau de bord</SheetDescription>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {moreItems.map(({ href, label, icon: Icon }) => {
              const active = isActivePath(pathname, href)
              const badge =
                href === "/dashboard/transactions" && !isLoading ? String(transactions.length) : null
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "pressable flex flex-col gap-3 rounded-2xl p-4 text-sm font-bold",
                    active ? "bg-violet-soft text-foreground" : "bg-surface text-foreground hover:bg-muted"
                  )}
                >
                  <span className="flex items-center justify-between">
                    <Icon className={cn("size-5", active ? "text-violet" : "text-muted-foreground")} />
                    {badge && <span className="num text-xs font-medium text-muted-foreground">{badge}</span>}
                  </span>
                  {label}
                </Link>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              setMoreOpen(false)
              openDialog()
            }}
            className="pressable mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-foreground px-4 py-3 text-sm font-bold text-background hover:opacity-90"
          >
            <Plug className="size-4" />
            Connecter une source
          </button>
        </SheetContent>
      </Sheet>
    </>
  )
}
