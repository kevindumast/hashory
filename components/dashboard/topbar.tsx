"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { Bell, Menu, Sparkles, HelpCircle, Plug, Sun, Moon } from "lucide-react";
import { ClerkLoaded, ClerkLoading, SignedOut, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isConvexConfigured } from "@/convex/client";
import { useTheme } from "next-themes";

type DashboardTopbarProps = {
  onOpenSidebar: () => void;
  onConnectProvider: () => void;
};

const ticker = [
  { symbol: "BTC", price: "$64,210", change: "+2.4%", up: true },
  { symbol: "ETH", price: "$3,450", change: "-0.8%", up: false },
  { symbol: "Gas", price: "18 Gwei", change: null, up: null },
];

export function DashboardTopbar({ onOpenSidebar, onConnectProvider }: DashboardTopbarProps) {
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const isIntegrationEnabled = useMemo(() => isConvexConfigured, []);
  const { resolvedTheme, setTheme } = useTheme();
  const theme = resolvedTheme ?? "dark";

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#040914]/95 backdrop-blur-md">
      <div className="flex w-full items-center justify-between gap-4 px-4 py-3">
        {/* Left: Mobile menu + Ticker */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden text-slate-400 hover:text-white hover:bg-white/[0.06]"
            aria-label="Open navigation"
            onClick={onOpenSidebar}
          >
            <Menu className="size-4" />
          </Button>

          {/* Crypto Ticker */}
          <div className="hidden lg:flex items-center gap-5 text-[11px] font-bold tabular-nums">
            {ticker.map((t) => (
              <span key={t.symbol} className={t.up === true ? "text-[#9bffce]" : t.up === false ? "text-slate-400" : "text-slate-400"}>
                <span className="text-slate-500 mr-1">{t.symbol}:</span>
                {t.price}
                {t.change && (
                  <span className="ml-1.5 opacity-70">
                    {t.up ? "▲" : "▼"} {t.change}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Center: Search */}
        <div className="flex flex-1 min-w-0 max-w-xs items-center gap-2">
          <div className="relative w-full">
            <Input
              placeholder="Rechercher un actif..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-white/[0.04] border-white/[0.07] text-[#dfe4ff] placeholder:text-slate-500 text-xs focus-visible:ring-[#b4c5ff]/30 h-8"
            />
          </div>
          <Button variant="ghost" size="icon" className="hidden sm:inline-flex h-8 w-8 text-slate-500 hover:text-[#b4c5ff] hover:bg-white/[0.06]">
            <Sparkles className="size-3.5" />
          </Button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <div className="hidden lg:block h-4 w-px bg-white/10" />

          <Button
            className="hidden sm:inline-flex items-center gap-2 h-8 text-xs bg-[#003ea8] hover:bg-[#0050d4] text-[#b4c5ff] border-0 font-bold tracking-tight uppercase"
            onClick={onConnectProvider}
            disabled={!isIntegrationEnabled}
          >
            <Plug className="size-3.5" />
            Connecter
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden h-8 w-8 text-slate-400 hover:text-white hover:bg-white/[0.06]"
            onClick={onConnectProvider}
            disabled={!isIntegrationEnabled}
          >
            <Plug className="size-4" />
          </Button>

          {/* Dark / Light toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-foreground hover:bg-accent"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label="Basculer le thème"
              >
                {mounted && (theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />)}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {mounted && (theme === "dark" ? "Mode clair" : "Mode sombre")}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-8 w-8 text-slate-400 hover:text-foreground hover:bg-accent">
                <Bell className="size-4" />
                <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#9bffce]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Notifications</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white hover:bg-white/[0.06]">
                <HelpCircle className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-[#09122b] border-white/10 text-[#dfe4ff]">Support</TooltipContent>
          </Tooltip>

          <div className="relative flex min-w-[36px] items-center justify-end">
            <ClerkLoading>
              <span className="h-8 w-8 animate-pulse rounded-full bg-white/[0.06]" />
            </ClerkLoading>
            <ClerkLoaded>
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "size-8 border border-white/10",
                  },
                }}
                afterSignOutUrl="/"
              />
            </ClerkLoaded>
            <SignedOut>
              <Link href="/sign-in" className="hidden" aria-label="Connexion requise" />
            </SignedOut>
          </div>
        </div>
      </div>
    </header>
  );
}
