"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar, MobileNav } from "./sidebar";
import { DashboardTopbar } from "./topbar";
import { ConnectProviderDialog } from "./connect-provider-dialog";
import { ProviderDialogProvider } from "./provider-dialog-context";
import { DashboardDataProvider } from "./dashboard-data-context";
import { CommandPalette } from "./command-palette";
import { useAutoSync } from "@/hooks/dashboard/useAutoSync";
import { cn } from "@/lib/utils";

interface DashboardShellProps {
  children: React.ReactNode;
}

const SIDEBAR_STORAGE_KEY = "hashory:sidebar-open";

/**
 * Déclencheur de la mise à jour automatique. Sans rendu : il existe
 * uniquement pour être monté à l'intérieur du fournisseur de données.
 */
function AutoSync() {
  useAutoSync();
  return null;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // L'état replié de la sidebar est une préférence : on la retient.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (stored !== null) setSidebarOpen(stored === "true");
    } catch {
      /* stockage indisponible (navigation privée) : on garde la valeur par défaut */
    }
  }, []);

  // Raccourci global d'ouverture de la palette de commandes.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <ProviderDialogProvider
      value={{
        open: connectDialogOpen,
        setOpen: setConnectDialogOpen,
        openDialog: () => setConnectDialogOpen(true),
        closeDialog: () => setConnectDialogOpen(false),
      }}
    >
      <DashboardDataProvider>
        <AutoSync />
        <div className="flex h-screen overflow-hidden bg-background">
          {/* Sidebar — scroll indépendant */}
          <div
            className={cn(
              "hidden md:block transition-all duration-300 ease-in-out shrink-0 overflow-hidden",
              sidebarOpen ? "w-[220px]" : "w-0"
            )}
          >
            <div className="w-[220px] h-full overflow-y-auto scrollbar-none">
              <Sidebar />
            </div>
          </div>

          {/* Colonne principale — l'unique container scrollable */}
          <div className="flex flex-col flex-1 min-w-0 overflow-y-auto scrollbar-subtle">
            <MobileNav />

            <div className="hidden md:block sticky top-0 z-30">
              <DashboardTopbar
                onToggleSidebar={toggleSidebar}
                onConnectProvider={() => setConnectDialogOpen(true)}
                onOpenCommandPalette={() => setPaletteOpen(true)}
              />
            </div>

            <main className="flex-1">{children}</main>
          </div>
        </div>

        <ConnectProviderDialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen} />
        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          onConnectProvider={() => setConnectDialogOpen(true)}
        />
      </DashboardDataProvider>
    </ProviderDialogProvider>
  );
}
