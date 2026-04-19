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
    <header className="sticky top-0 z-30 border-b border-sidebar-border bg-sidebar/95 backdrop-blur-md">
      <div className="flex w-full items-center justify-between gap-4 px-4 py-3">
        {/* Left: Mobile menu + Ticker */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
            aria-label="Open navigation"
            onClick={onOpenSidebar}
          >
            <Menu className="size-4" />
          </Button>

          {/* Crypto Ticker */}
          <div className="hidden lg:flex items-center gap-5 text-[11px] font-bold tabular-nums">
            {ticker.map((t) => (
              <span key={t.symbol} className={t.up === true ? "text-positive" : "text-muted-foreground"}>
                <span className="text-muted-foreground mr-1">{t.symbol}:</span>
                {t.price}
                {t.change && (
                  <span className="ml-1.5 opacity-80">
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
              className="w-full bg-sidebar-accent/50 border-sidebar-border text-sidebar-foreground placeholder:text-muted-foreground text-xs focus-visible:ring-sidebar-primary/30 h-8"
            />
          </div>
          <Button variant="ghost" size="icon" className="hidden sm:inline-flex h-8 w-8 text-muted-foreground hover:text-sidebar-primary hover:bg-sidebar-accent">
            <Sparkles className="size-3.5" />
          </Button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <div className="hidden lg:block h-4 w-px bg-sidebar-border" />

          <Button
            className="hidden sm:inline-flex items-center gap-2 h-8 text-xs font-bold tracking-tight uppercase cursor-pointer"
            onClick={onConnectProvider}
            disabled={!isIntegrationEnabled}
          >
            <Plug className="size-3.5" />
            Connecter
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden h-8 w-8 text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer"
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
                className="h-8 w-8 text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer"
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
              <Button variant="ghost" size="icon" className="relative h-8 w-8 text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer">
                <Bell className="size-4" />
                <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-positive" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Notifications</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer">
                <HelpCircle className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Support</TooltipContent>
          </Tooltip>

          <div className="relative flex min-w-[36px] items-center justify-end">
            <ClerkLoading>
              <span className="h-8 w-8 animate-pulse rounded-full bg-muted" />
            </ClerkLoading>
            <ClerkLoaded>
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "size-8 border border-sidebar-border",
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
