"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Wallet, LayoutDashboard, FileText, ArrowLeftRight, ChevronDown, User, Settings, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
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
    <aside className="hidden md:flex flex-col w-[260px] h-screen bg-[#f8f9fc] border-r border-[#d4d8e1] justify-between text-[#1e2029]">
      <div>
        <div className="p-4 pt-6 h-[85px] flex items-center">
          <Link href="/dashboard" className="font-bold text-2xl text-primary pl-2">
            Oracly
          </Link>
        </div>
        
        <nav className="flex flex-col gap-6 px-3.5">
          {navSections.map((section) => (
            <div key={section.title}>
              <h2 className="px-2.5 mb-3 text-xs font-bold text-[#808594] uppercase tracking-wider">{section.title}</h2>
              <div className="flex flex-col gap-1">
                {section.links.map((link) => (
                  <SidebarLink key={link.href} {...link} />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="flex flex-col gap-3 p-3.5">
        {/* Plan Status */}
        <div className="p-3 border border-[#d4d8e1] rounded-md">
            <div className="flex justify-between items-center mb-2.5">
                <p className="text-xs font-medium text-[#808594]">FORMULE FREE</p>
                <div className="bg-[#e6e8ed] rounded-full px-1.5 py-0.5">
                    <p className="text-xs font-medium text-[#3b414f]">2025</p>
                </div>
            </div>
            <p className="text-xs font-medium">208 transactions sur 50</p>
            <Progress value={100} className="h-[5px] mt-1.5 mb-2 bg-[#d4d8e0] [&>div]:bg-gradient-to-r [&>div]:from-[#8677ff] [&>div]:to-[#ff5151]" />
        </div>

        {/* Profile */}
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className="w-full p-4 border-t border-[#d4d8e1] -mx-3.5 -mb-3.5 hover:bg-[#eff0f3] transition-colors">
                    <div className="flex items-center gap-2.5 text-left">
                        <Avatar className="h-9 w-9">
                            <AvatarImage src="https://github.com/shadcn.png" alt="user" />
                            <AvatarFallback>KD</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 overflow-hidden">
                            <p className="text-sm font-medium text-[#1e2029] truncate">kevin.dumast@gmail.com</p>
                            <p className="text-sm text-[#808594]">Mon profil</p>
                        </div>
                        <ChevronDown className="w-5 h-5 text-[#808594]" />
                    </div>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[240px]" align="end" side="top">
                <DropdownMenuLabel>Mon Compte</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem><User className="mr-2 h-4 w-4" /><span>Profil</span></DropdownMenuItem>
                <DropdownMenuItem><Settings className="mr-2 h-4 w-4" /><span>Paramètres</span></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10"><LogOut className="mr-2 h-4 w-4" /><span>Déconnexion</span></DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}

function SidebarLink({ href, label, icon: Icon }: { href: string, label: string, icon: React.ElementType }) {
    const pathname = usePathname()
    const isActive = pathname === href || (href === "/dashboard/accounts" && pathname.startsWith("/dashboard/accounts"))

    return (
        <Link
            href={href}
            className={cn(
                "flex items-center gap-3 px-2.5 py-2 h-[34px] rounded-md text-sm font-medium transition-colors",
                isActive
                ? "bg-[#503bff]/10 text-[#503bff]"
                : "text-[#3b414f] hover:bg-[#eff0f3]",
            )}
        >
            <Icon className="w-5 h-5" />
            <span>{label}</span>
        </Link>
    )
}