"use client";

import { useState } from "react";
import { Sidebar, MobileNav } from "./sidebar";
import { DashboardTopbar } from "./topbar";
import { ConnectProviderDialog } from "./connect-provider-dialog";
import { ProviderDialogProvider } from "./provider-dialog-context";
import { useTheme } from "next-themes";

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <ProviderDialogProvider
      value={{
        open: connectDialogOpen,
        setOpen: setConnectDialogOpen,
        openDialog: () => setConnectDialogOpen(true),
        closeDialog: () => setConnectDialogOpen(false),
      }}
    >
      <div className={`${isDark ? "dark" : ""} flex min-h-screen bg-background`}>
        <Sidebar />

        <div className="flex flex-col flex-1 min-w-0">
          <MobileNav />

          <div className="hidden md:block">
            <DashboardTopbar
              onOpenSidebar={() => {}}
              onConnectProvider={() => setConnectDialogOpen(true)}
            />
          </div>

          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>

      <ConnectProviderDialog
        open={connectDialogOpen}
        onOpenChange={setConnectDialogOpen}
      />
    </ProviderDialogProvider>
  );
}
