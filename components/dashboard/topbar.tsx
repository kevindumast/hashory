"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TrendingUp, Bell, Menu, Sparkles, HelpCircle, Plug } from "lucide-react";
import { ClerkLoaded, ClerkLoading, SignedOut, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isConvexConfigured } from "@/convex/client";

type DashboardTopbarProps = {
  onOpenSidebar: () => void;
  onConnectProvider: () => void;
};

export function DashboardTopbar({ onOpenSidebar, onConnectProvider }: DashboardTopbarProps) {
  const [query, setQuery] = useState("");
  const isIntegrationEnabled = useMemo(() => isConvexConfigured, []);

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-label="Open navigation"
            onClick={onOpenSidebar}
          >
            <Menu className="size-4" />
          </Button>
          <div className="hidden lg:flex">
            <Badge variant="outline" className="gap-2 rounded-full border-primary/30 bg-primary/10 px-3 py-1 text-xs">
              <TrendingUp className="size-3" />
              <span>NAV +4.2%</span>
            </Badge>
          </div>
        </div>
        <div className="flex flex-1 min-w-0 items-center gap-2">
          <Input
            placeholder="Search assets, clients, or mandates..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full min-w-0"
          />
          <Button variant="outline" size="icon" className="hidden sm:inline-flex">
            <Sparkles className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden"
            onClick={onConnectProvider}
            disabled={!isIntegrationEnabled}
            title={!isIntegrationEnabled ? "Configure Convex to activer les intégrations" : undefined}
          >
            <Plug className="size-4" />
          </Button>
          <Button
            className="hidden items-center gap-2 sm:inline-flex"
            onClick={onConnectProvider}
            disabled={!isIntegrationEnabled}
          >
            <Plug className="size-4" />
            Connecter une plateforme
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="size-5" />
                <span className="absolute right-1 top-1 size-2 rounded-full bg-emerald-500" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Notifications</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon">
                <HelpCircle className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Support</TooltipContent>
          </Tooltip>

          <div className="relative flex min-w-[96px] items-center justify-end">
            <ClerkLoading>
              <span className="h-9 w-9 animate-pulse rounded-full bg-muted/40" />
            </ClerkLoading>
            <ClerkLoaded>
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "size-9 border border-border",
                  },
                }}
                afterSignOutUrl="/"
              />
            </ClerkLoaded>
            <SignedOut>
              <Link
                href="/sign-in"
                className="hidden"
                aria-label="Vous devez être connecté pour accéder au tableau de bord"
              />
            </SignedOut>
          </div>
        </div>
      </div>
    </header>
  );
}
