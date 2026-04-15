"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Wallet, LayoutDashboard, FileText, ArrowLeftRight, ChevronDown, User, Settings, LogOut, Menu, TrendingUp, Shield, BarChart2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
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

const navSections = [
  {
    title: "Gestionnaire de portefeuille",
    links: [
      { href: "/dashboard/accounts", label: "Mes comptes", icon: Wallet },
      { href: "/dashboard", label: "Portefeuille", icon: LayoutDashboard },
    ],
  },
  {
    title: "Fiscalité",
    links: [
      { href: "/dashboard/tax-report", label: "Déclaration fiscale", icon: FileText },
      { href: "/dashboard/transactions", label: "Transactions", icon: ArrowLeftRight },
    ],
  },
]

export function Sidebar() {
  return (
    <aside className="hidden md:flex flex-col w-[260px] h-screen bg-[#0b1222] border-r border-white/[0.07] justify-between text-[#dfe4ff] font-['Inter'] tracking-tight antialiased">
      {/* Logo */}
      <div>
        <div className="px-6 py-5 border-b border-white/[0.07]">
          <div className="text-base font-bold tracking-tighter text-[#b4c5ff] mb-0.5">Oracly</div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Intelligence Crypto</div>
        </div>

        <nav className="flex flex-col gap-5 px-3 pt-4">
          {navSections.map((section) => (
            <div key={section.title}>
              <h2 className="px-3 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">{section.title}</h2>
              <div className="flex flex-col gap-0.5">
                {section.links.map((link) => (
                  <SidebarLink key={link.href} {...link} />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="flex flex-col gap-3 p-3">
        {/* Plan Status */}
        <div className="p-3 border border-white/[0.07] rounded-lg bg-slate-800/30">
          <div className="flex justify-between items-center mb-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Formule Free</p>
            <div className="bg-slate-800 rounded-full px-1.5 py-0.5">
              <p className="text-[10px] font-bold text-slate-400">2025</p>
            </div>
          </div>
          <p className="text-xs font-medium text-slate-300">208 transactions sur 50</p>
          <Progress value={100} className="h-[4px] mt-1.5 mb-1.5 bg-slate-700/50 [&>div]:bg-gradient-to-r [&>div]:from-[#b4c5ff] [&>div]:to-[#9bffce]" />
          <p className="text-[10px] text-slate-500">Limite atteinte</p>
        </div>

        {/* Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full px-3 py-2.5 border-t border-white/[0.07] -mx-3 -mb-3 hover:bg-white/[0.04] transition-colors duration-150 cursor-pointer">
              <div className="flex items-center gap-2.5 text-left">
                <Avatar className="h-8 w-8 border border-white/10">
                  <AvatarImage src="https://github.com/shadcn.png" alt="user" />
                  <AvatarFallback className="bg-slate-800 text-[#b4c5ff] text-xs font-bold">KD</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#dfe4ff] truncate">kevin.dumast@gmail.com</p>
                  <p className="text-[10px] text-slate-500">Mon profil</p>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[240px] bg-[#09122b] border-white/10" align="end" side="top">
            <DropdownMenuLabel className="text-slate-400">Mon Compte</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-white/[0.07]" />
            <DropdownMenuItem className="text-slate-300 focus:bg-white/[0.06] focus:text-white">
              <User className="mr-2 h-4 w-4" /><span>Profil</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="text-slate-300 focus:bg-white/[0.06] focus:text-white">
              <Settings className="mr-2 h-4 w-4" /><span>Paramètres</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/[0.07]" />
            <DropdownMenuItem className="text-[#ee7d77] focus:text-[#ee7d77] focus:bg-red-900/20">
              <LogOut className="mr-2 h-4 w-4" /><span>Déconnexion</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <MobileHeader isOpen={isOpen} setIsOpen={setIsOpen} />
  )
}

function MobileHeader({ isOpen, setIsOpen }: { isOpen: boolean; setIsOpen: (open: boolean) => void }) {
  const pathname = usePathname()

  return (
    <div className="flex md:hidden flex-col w-full">
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-white/[0.07] bg-[#070d1f] px-4">
        <div>
          <div className="text-sm font-bold tracking-tighter text-[#b4c5ff]">Oracly</div>
        </div>
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Ouvrir le menu de navigation"
              className="text-slate-400 hover:text-white hover:bg-white/[0.06]"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex w-full max-w-xs flex-col gap-0 bg-[#0b1222] border-r border-white/[0.07] p-0 overscroll-contain">
            <div className="px-6 py-5 border-b border-white/[0.07]">
              <div className="text-base font-bold tracking-tighter text-[#b4c5ff] mb-0.5">Oracly</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Intelligence Crypto</div>
            </div>

            <nav className="flex flex-col gap-5 px-3 pt-4">
              {navSections.map((section) => (
                <div key={section.title}>
                  <h2 className="px-3 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">{section.title}</h2>
                  <div className="flex flex-col gap-0.5">
                    {section.links.map((link) => {
                      const Icon = link.icon
                      const isActive = pathname === link.href || (link.href === "/dashboard/accounts" && pathname.startsWith("/dashboard/accounts"))
                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          onClick={() => setIsOpen(false)}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150",
                            isActive
                              ? "bg-blue-900/40 text-[#b4c5ff] border-r-2 border-[#b4c5ff]/60"
                              : "text-slate-400 hover:text-slate-200 hover:bg-blue-900/20",
                          )}
                        >
                          <Icon className="w-4 h-4" />
                          <span>{link.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <div className="mt-auto p-3">
              <div className="p-3 border border-white/[0.07] rounded-lg bg-slate-800/30">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Formule Free</p>
                  <div className="bg-slate-800 rounded-full px-1.5 py-0.5">
                    <p className="text-[10px] font-bold text-slate-400">2025</p>
                  </div>
                </div>
                <p className="text-xs font-medium text-slate-300">208 transactions sur 50</p>
                <Progress value={100} className="h-[4px] mt-1.5 bg-slate-700/50 [&>div]:bg-gradient-to-r [&>div]:from-[#b4c5ff] [&>div]:to-[#9bffce]" />
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  )
}

function SidebarLink({ href, label, icon: Icon }: { href: string, label: string, icon: React.ElementType }) {
  const pathname = usePathname()
  const isActive = pathname === href || (href === "/dashboard/accounts" && pathname.startsWith("/dashboard/accounts"))

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150",
        isActive
          ? "bg-blue-900/40 text-[#b4c5ff] border-r-2 border-[#b4c5ff]/60"
          : "text-slate-400 hover:text-slate-200 hover:bg-blue-900/20",
      )}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </Link>
  )
}
