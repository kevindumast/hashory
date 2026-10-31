"use client";

import { useMemo } from "react";
import { useEffect, useState } from "react";
import { AlertCircle, Bell, CheckCircle2, HelpCircle, PanelLeft, RefreshCw, Search, Sparkles, Sun, Moon } from "lucide-react";
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
import { useTheme } from "next-themes";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";
import { SignalItem, useSignals } from "@/components/dashboard/signals-panel";
import { ClaudeAccessPanel } from "@/components/dashboard/claude-access-panel";
import { ClaudeConnectorGuide } from "@/components/dashboard/claude-connector-guide";
import { PrivacyToggle } from "@/components/dashboard/privacy-mode";
import { siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format-relative";
import { usePathname } from "next/navigation";
import { findActiveLink } from "@/components/dashboard/nav-config";

type DashboardTopbarProps = {
  onToggleSidebar: () => void;
  onConnectProvider: () => void;
  onOpenCommandPalette: () => void;
};

export function DashboardTopbar({
  onToggleSidebar,
  onConnectProvider,
  onOpenCommandPalette,
}: DashboardTopbarProps) {
  const [mounted, setMounted] = useState(false);
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

  const pathname = usePathname();
  const pageTitle = findActiveLink(pathname)?.label ?? "Tableau de bord";
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
            className="size-8 rounded-full text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent shrink-0"
          >
            <PanelLeft className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Basculer le menu</TooltipContent>
      </Tooltip>

      <p className="min-w-0 shrink-0 truncate text-[15px] font-bold tracking-tight text-sidebar-foreground lg:w-48">
        {pageTitle}
      </p>

      {/* Déclencheur de la palette de commandes */}
      <div className="flex-1 flex justify-center">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="group relative flex h-9 w-full max-w-md cursor-pointer items-center gap-2.5 rounded-full bg-surface px-4 text-sm text-muted-foreground transition-colors hover:bg-muted"
        >
          <Search className="size-4 shrink-0" />
          <span className="flex-1 text-left">Rechercher une page, une action…</span>
          <kbd className="num inline-flex h-5 items-center rounded-md border border-line bg-background px-1.5 text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <PrivacyToggle />

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
              className="relative size-8 rounded-full text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer"
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
              className="size-8 rounded-full text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer"
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
              className="size-8 rounded-full text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer"
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
                  <ClaudeAccessPanel />
                  <div className="mt-6">
                    <ClaudeConnectorGuide compact />
                  </div>
                </div>
              </UserButton.UserProfilePage>
            </UserButton>
          </ClerkLoaded>
        </div>
      </div>
    </header>
  );
}
