"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Wallet, LayoutDashboard, FileText, ArrowLeftRight, CalendarDays,
  ChevronDown, User, Settings, LogOut, Menu, MoreHorizontal,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"

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
      { href: "/dashboard/transactions", label: "Transactions", badge: "208", icon: ArrowLeftRight },
    ],
  },
]

export function Sidebar() {
  return (
    <aside className="hidden md:flex flex-col w-[220px] h-screen bg-sidebar border-r border-sidebar-border tracking-tight antialiased shrink-0">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 h-[57px] border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="size-5 rounded bg-sidebar-primary/20 flex items-center justify-center">
            <div className="size-2.5 rounded-sm bg-sidebar-primary" />
          </div>
          <span className="text-sm font-semibold text-sidebar-foreground tracking-tight">Termenva</span>
        </div>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-5">
        {navSections.map((section) => (
          <div key={section.title}>
            <p className="px-2 mb-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {section.title}
            </p>
            <div className="flex flex-col gap-0.5">
              {section.links.map((link) => (
                <SidebarLink key={link.href} {...link} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-sidebar-border px-3 py-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2.5 w-full rounded-md px-2 py-1.5 hover:bg-sidebar-accent transition-colors cursor-pointer">
              <Avatar className="h-7 w-7 border border-sidebar-border shrink-0">
                <AvatarImage src="https://github.com/shadcn.png" alt="user" />
                <AvatarFallback className="bg-muted text-sidebar-primary text-[10px] font-bold">KD</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[12px] font-medium text-sidebar-foreground truncate leading-tight">Toby Belhome</p>
                <p className="text-[10px] text-muted-foreground truncate leading-tight">kevin.dumast@gmail.com</p>
              </div>
              <MoreHorizontal className="size-3.5 text-muted-foreground shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[200px]" align="end" side="top">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Mon Compte</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer text-sm">
              <User className="mr-2 h-3.5 w-3.5" /> Profil
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer text-sm">
              <Settings className="mr-2 h-3.5 w-3.5" /> Paramètres
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer text-sm text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-3.5 w-3.5" /> Déconnexion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}

function SidebarLink({ href, label, badge, icon: Icon }: { href: string; label: string; badge: string | null; icon: React.ElementType }) {
  const pathname = usePathname()
  const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href))

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-foreground font-medium"
          : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1">{label}</span>
      {badge && (
        <span className="text-[11px] font-medium text-muted-foreground">{badge}</span>
      )}
    </Link>
  )
}

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  return (
    <div className="flex md:hidden sticky top-0 z-40 h-[57px] items-center justify-between border-b border-sidebar-border bg-sidebar px-4">
      <div className="flex items-center gap-2">
        <div className="size-5 rounded bg-sidebar-primary/20 flex items-center justify-center">
          <div className="size-2.5 rounded-sm bg-sidebar-primary" />
        </div>
        <span className="text-sm font-semibold text-sidebar-foreground">Termenva</span>
      </div>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-sidebar-foreground">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex w-[220px] flex-col gap-0 bg-sidebar border-r border-sidebar-border p-0">
          <div className="flex items-center gap-2 px-4 h-[57px] border-b border-sidebar-border">
            <div className="size-5 rounded bg-sidebar-primary/20 flex items-center justify-center">
              <div className="size-2.5 rounded-sm bg-sidebar-primary" />
            </div>
            <span className="text-sm font-semibold text-sidebar-foreground">Termenva</span>
          </div>
          <nav className="flex-1 px-3 py-3 flex flex-col gap-5">
            {navSections.map((section) => (
              <div key={section.title}>
                <p className="px-2 mb-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {section.title}
                </p>
                <div className="flex flex-col gap-0.5">
                  {section.links.map((link) => {
                    const Icon = link.icon
                    const isActive = pathname === link.href || (link.href !== "/dashboard" && pathname.startsWith(link.href))
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setIsOpen(false)}
                        className={cn(
                          "flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                            : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="flex-1">{link.label}</span>
                        {link.badge && <span className="text-[11px] text-muted-foreground">{link.badge}</span>}
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
  )
}
