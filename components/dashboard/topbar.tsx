"use client";

import { useMemo } from "react";
import { useEffect, useState } from "react";
import { AlertCircle, Bell, CheckCircle2, HelpCircle, PanelLeft, Plug, RefreshCw, Search, Sparkles, Sun, Moon } from "lucide-react";
import { ClerkLoaded, ClerkLoading, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isConvexConfigured } from "@/convex/client";
import { useTheme } from "next-themes";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";
import { SignalItem, useSignals } from "@/components/dashboard/signals-panel";
import { ClaudeConnectorGuide } from "@/components/dashboard/claude-connector-guide";
import { siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

type DashboardTopbarProps = {
  onToggleSidebar: () => void;
  onConnectProvider: () => void;
  onOpenCommandPalette: () => void;
};

const relativeTime = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });

function formatRelative(timestamp: number): string {
  const diff = timestamp - Date.now();
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 60) return relativeTime.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relativeTime.format(hours, "hour");
  return relativeTime.format(Math.round(hours / 24), "day");
}

export function DashboardTopbar({
  onToggleSidebar,
  onConnectProvider,
  onOpenCommandPalette,
}: DashboardTopbarProps) {
  const [mounted, setMounted] = useState(false);
  const isIntegrationEnabled = useMemo(() => isConvexConfigured, []);
  const { resolvedTheme, setTheme } = useTheme();
  const theme = resolvedTheme ?? "dark";
  const { integrations, isLoadingIntegrations } = useDashboardData();

  useEffect(() => {
    setMounted(true);
  }, []);

  // L'état de synchronisation réel remplace la pastille décorative d'origine.
  const activity = useMemo(() => {
    return [...integrations]
      .sort((a, b) => (b.lastSyncedAt ?? b.updatedAt) - (a.lastSyncedAt ?? a.updatedAt))
      .slice(0, 6);
  }, [integrations]);

  const signals = useSignals();
  const [isBellOpen, setIsBellOpen] = useState(false);

  const errorCount = activity.filter((item) => item.syncStatus === "error").length;
  const syncingCount = activity.filter((item) => item.syncStatus === "syncing").length;
  const hasCritical = errorCount > 0 || signals.some((signal) => signal.severity === "critical");
  const hasWarning = signals.some((signal) => signal.severity === "warning");
  // La pastille prend la couleur de ce qu'il y a de plus urgent.
  const dotColor = hasCritical
    ? "bg-negative"
    : hasWarning
      ? "bg-chart-4"
      : syncingCount > 0
        ? "bg-positive"
        : null;

  return (
    <header className="sticky top-0 z-30 h-[57px] flex items-center gap-3 border-b border-sidebar-border bg-sidebar/95 backdrop-blur-md px-4">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            aria-label="Basculer le menu latéral"
            className="h-8 w-8 text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent shrink-0"
          >
            <PanelLeft className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Basculer le menu</TooltipContent>
      </Tooltip>

      {/* Déclencheur de la palette de commandes */}
      <div className="flex-1 flex justify-center">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="group relative flex h-9 w-full max-w-sm cursor-pointer items-center gap-2.5 border border-border/60 bg-background/40 px-3 text-sm text-muted-foreground transition-colors hover:border-border hover:bg-muted/20"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="num flex-1 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70">Rechercher…</span>
          <kbd className="num inline-flex h-5 items-center border border-border/60 px-1.5 text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="num hidden h-8 cursor-pointer px-3 text-[11px] uppercase tracking-[0.14em] text-sidebar-primary hover:bg-muted/20 sm:inline-flex"
          onClick={onConnectProvider}
          disabled={!isIntegrationEnabled}
        >
          <Plug className="size-3.5 mr-1.5" />
          Connecter
        </Button>

        {/* Notifications : points d'attention, puis activité de synchronisation */}
        <DropdownMenu open={isBellOpen} onOpenChange={setIsBellOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={
                signals.length > 0
                  ? `Notifications : ${signals.length} point${signals.length > 1 ? "s" : ""} d'attention`
                  : "Notifications"
              }
              className="relative h-8 w-8 text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer"
            >
              <Bell className="size-4" />
              {dotColor && (
                <span className={cn("absolute right-1.5 top-1.5 size-1.5 rounded-full", dotColor)} />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="max-h-[min(36rem,calc(100vh-5rem))] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto scrollbar-subtle rounded-2xl p-2"
          >
            <DropdownMenuLabel className="eyebrow px-3 pt-2 text-[11px]">
              Points d&apos;attention{signals.length > 0 ? ` · ${signals.length}` : ""}
            </DropdownMenuLabel>
            {signals.length === 0 ? (
              <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-positive" />
                Rien à signaler.
              </p>
            ) : (
              <ul className="py-1">
                {signals.map((signal) => (
                  <li key={signal.id}>
                    <SignalItem signal={signal} onNavigate={() => setIsBellOpen(false)} />
                  </li>
                ))}
              </ul>
            )}
            <DropdownMenuSeparator className="my-2" />
            <DropdownMenuLabel className="eyebrow px-3 text-[11px] text-muted-foreground">
              Synchronisation
            </DropdownMenuLabel>
            {isLoadingIntegrations ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">Chargement…</p>
            ) : activity.length === 0 ? (
              <div className="px-2 py-4 text-center">
                <p className="text-xs text-muted-foreground">Aucune plateforme connectée.</p>
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onConnectProvider}>
                  En connecter une
                </Button>
              </div>
            ) : (
              <ul className="py-1">
                {activity.map((item) => {
                  const label = item.displayName ?? item.provider;
                  const at = item.lastSyncedAt ?? item.updatedAt;
                  const Icon =
                    item.syncStatus === "error"
                      ? AlertCircle
                      : item.syncStatus === "syncing"
                        ? RefreshCw
                        : CheckCircle2;
                  return (
                    <li key={item._id} className="flex items-start gap-2.5 px-3 py-2">
                      <Icon
                        className={cn(
                          "mt-0.5 size-3.5 shrink-0",
                          item.syncStatus === "error"
                            ? "text-destructive"
                            : item.syncStatus === "syncing"
                              ? "animate-spin text-muted-foreground"
                              : "text-positive"
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">{label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {item.syncStatus === "error"
                            ? "Échec de la dernière synchronisation"
                            : item.syncStatus === "syncing"
                              ? "Synchronisation en cours…"
                              : at
                                ? `Synchronisé ${formatRelative(at)}`
                                : "Jamais synchronisé"}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              // Le thème résolu n'existe qu'après le montage : le serveur rend
              // toujours la valeur par défaut. Décrire la destination avant
              // d'en connaître l'origine produisait une divergence
              // d'hydratation, l'icône et l'infobulle étant déjà protégées.
              aria-label={
                mounted
                  ? theme === "dark"
                    ? "Passer en mode clair"
                    : "Passer en mode sombre"
                  : "Changer de thème"
              }
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
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer"
            >
              <a
                href={`${siteConfig.github}/issues/new`}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Signaler un problème"
              >
                <HelpCircle className="size-4" />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Support &amp; retours</TooltipContent>
        </Tooltip>

        <div className="flex items-center pl-1">
          <ClerkLoading>
            <span className="h-7 w-7 animate-pulse rounded-full bg-muted" />
          </ClerkLoading>
          <ClerkLoaded>
            <UserButton
              appearance={{ elements: { avatarBox: "size-7 border border-sidebar-border" } }}
              afterSignOutUrl="/"
            >
              <UserButton.MenuItems>
                <UserButton.Link
                  label="Connecter Claude"
                  labelIcon={<Sparkles className="size-4" />}
                  href="/dashboard/settings/claude"
                />
              </UserButton.MenuItems>
              {/* Le même guide, directement dans la fenêtre du profil. */}
              <UserButton.UserProfilePage label="Claude" url="claude" labelIcon={<Sparkles className="size-4" />}>
                <div className="pb-4">
                  <h1 className="title text-2xl text-foreground">Connecter Claude</h1>
                  <p className="mt-2 mb-6 text-sm text-muted-foreground">
                    Interrogez votre portefeuille depuis Claude, en lecture seule.
                  </p>
                  <ClaudeConnectorGuide compact />
                </div>
              </UserButton.UserProfilePage>
            </UserButton>
          </ClerkLoaded>
        </div>
      </div>
    </header>
  );
}
