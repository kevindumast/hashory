import { Sidebar, MobileNav } from "./sidebar";

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <div className="flex flex-col min-h-screen bg-[#f8f9fc]">
      {/* Mobile Navigation */}
      <MobileNav />

      {/* Desktop + Content Layout */}
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}