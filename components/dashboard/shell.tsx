"use client";

import { useState } from "react";
import { Sidebar, MobileNav } from "./sidebar";
import { DashboardTopbar } from "./topbar";
import { ConnectProviderDialog } from "./connect-provider-dialog";
import { ProviderDialogProvider } from "./provider-dialog-context";
import { cn } from "@/lib/utils";

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <ProviderDialogProvider
      value={{
        open: connectDialogOpen,
        setOpen: setConnectDialogOpen,
        openDialog: () => setConnectDialogOpen(true),
        closeDialog: () => setConnectDialogOpen(false),
      }}
    >
      <div className="flex h-screen overflow-hidden bg-background">

        {/* Sidebar — scroll indépendant */}
        <div className={cn(
          "hidden md:block transition-all duration-300 ease-in-out shrink-0 overflow-hidden",
          sidebarOpen ? "w-[220px]" : "w-0"
        )}>
          <div className="w-[220px] h-full overflow-y-auto scrollbar-none">
            <Sidebar />
          </div>
        </div>

        {/* Main column — l'unique container scrollable */}
        <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">

          {/* Mobile nav sticky dans ce scroll container */}
          <MobileNav />

          {/* Topbar sticky — le contenu passe DESSOUS avec l'effet blur */}
          <div className="hidden md:block sticky top-0 z-30">
            <DashboardTopbar
              onToggleSidebar={() => setSidebarOpen((v) => !v)}
              onConnectProvider={() => setConnectDialogOpen(true)}
            />
          </div>

          <main className="flex-1">
            {children}
          </main>
        </div>
      </div>

      <ConnectProviderDialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen} />
    </ProviderDialogProvider>
  );
}
