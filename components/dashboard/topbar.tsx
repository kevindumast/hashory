"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Bell, HelpCircle, Plug, Sun, Moon, Search, PanelLeft } from "lucide-react";
import { ClerkLoaded, ClerkLoading, SignedOut, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isConvexConfigured } from "@/convex/client";
import { useTheme } from "next-themes";

type DashboardTopbarProps = {
  onToggleSidebar: () => void;
  onConnectProvider: () => void;
};

export function DashboardTopbar({ onToggleSidebar, onConnectProvider }: DashboardTopbarProps) {
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const isIntegrationEnabled = useMemo(() => isConvexConfigured, []);
  const { resolvedTheme, setTheme } = useTheme();
  const theme = resolvedTheme ?? "dark";

  useEffect(() => { setMounted(true); }, []);

  // ⌘K focus search
  const searchRef = useCallback((node: HTMLInputElement | null) => {
    if (!node) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        node.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <header className="sticky top-0 z-30 h-[57px] flex items-center gap-3 border-b border-sidebar-border bg-sidebar/95 backdrop-blur-md px-4">
      {/* Sidebar toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            className="h-8 w-8 text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent shrink-0"
          >
            <PanelLeft className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Basculer le menu</TooltipContent>
      </Tooltip>

      {/* Search — centré */}
      <div className="flex-1 flex justify-center">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-16 rounded-md border border-sidebar-border bg-sidebar-accent/40 text-sm text-sidebar-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-sidebar-primary/40"
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pointer-events-none">
            <kbd className="inline-flex h-5 items-center gap-0.5 rounded border border-sidebar-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
              ⌘K
            </kbd>
          </div>
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Get Pro / Connecter */}
        <Button
          size="sm"
          variant="ghost"
          className="hidden sm:inline-flex h-8 px-3 text-xs font-semibold text-sidebar-primary hover:bg-sidebar-accent cursor-pointer"
          onClick={onConnectProvider}
          disabled={!isIntegrationEnabled}
        >
          <Plug className="size-3.5 mr-1.5" />
          Connecter
        </Button>

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
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {mounted && (theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />)}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{mounted && (theme === "dark" ? "Mode clair" : "Mode sombre")}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer">
              <HelpCircle className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Support</TooltipContent>
        </Tooltip>

        <div className="flex items-center pl-1">
          <ClerkLoading>
            <span className="h-7 w-7 animate-pulse rounded-full bg-muted" />
          </ClerkLoading>
          <ClerkLoaded>
            <UserButton
              appearance={{ elements: { avatarBox: "size-7 border border-sidebar-border" } }}
              afterSignOutUrl="/"
            />
          </ClerkLoaded>
          <SignedOut>
            <Link href="/sign-in" className="hidden" />
          </SignedOut>
        </div>
      </div>
    </header>
  );
}
