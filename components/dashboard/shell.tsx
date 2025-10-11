"use client";

import { ReactNode, useState } from "react";
import { DashboardSidebar } from "./sidebar";
import { DashboardTopbar } from "./topbar";
import { ScrollArea } from "@/components/ui/scroll-area";

type DashboardShellProps = {
  children: ReactNode;
};

export function DashboardShell({ children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-muted/20">
      <DashboardSidebar isOpen={sidebarOpen} onOpenChange={setSidebarOpen} />
      <div className="flex flex-1 flex-col">
        <DashboardTopbar onOpenSidebar={() => setSidebarOpen(true)} />
        <ScrollArea className="flex-1">
          <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-8">{children}</div>
        </ScrollArea>
      </div>
    </div>
  );
}
