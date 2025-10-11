"use client";

import { ReactNode, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  Briefcase,
  Cog,
  FileText,
  Flame,
  LayoutDashboard,
  LineChart,
  Settings2,
  ShieldCheck,
  Users2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type SidebarNavItem = {
  title: string;
  href: string;
  icon: ReactNode;
  badge?: string;
  disabled?: boolean;
};

const mainNavigation: SidebarNavItem[] = [
  {
    title: "Overview",
    href: "/dashboard",
    icon: <LayoutDashboard className="size-4" />,
  },
  {
    title: "Analytics",
    href: "/dashboard#analytics",
    icon: <LineChart className="size-4" />,
  },
  {
    title: "Automation",
    href: "/dashboard#automation",
    icon: <Settings2 className="size-4" />,
    badge: "Soon",
    disabled: true,
  },
  {
    title: "Compliance",
    href: "/dashboard#compliance",
    icon: <ShieldCheck className="size-4" />,
    badge: "Soon",
    disabled: true,
  },
  {
    title: "Documents",
    href: "/dashboard#documents",
    icon: <FileText className="size-4" />,
    disabled: true,
  },
];

const secondaryNavigation: SidebarNavItem[] = [
  {
    title: "Alerts",
    href: "/dashboard#alerts",
    icon: <Bell className="size-4" />,
  },
  {
    title: "Clients",
    href: "/dashboard#clients",
    icon: <Users2 className="size-4" />,
    disabled: true,
  },
  {
    title: "Strategies",
    href: "/dashboard#strategies",
    icon: <Flame className="size-4" />,
    disabled: true,
  },
  {
    title: "Integrations",
    href: "/dashboard#integrations",
    icon: <Cog className="size-4" />,
    badge: "New",
  },
];

const workspaceQuickActions: SidebarNavItem[] = [
  {
    title: "Create Report",
    href: "/dashboard#reports",
    icon: <BarChart3 className="size-4" />,
  },
  {
    title: "New Mandate",
    href: "/dashboard#mandates",
    icon: <Briefcase className="size-4" />,
  },
];

type DashboardSidebarProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DashboardSidebar({ isOpen, onOpenChange }: DashboardSidebarProps) {
  const content = useMemo(() => <SidebarContent />, []);

  return (
    <>
      <aside className="hidden h-screen flex-col border-r border-border/60 bg-card/70 backdrop-blur-lg lg:flex lg:w-64 xl:w-72">
        {content}
      </aside>
      <Sheet open={isOpen} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="w-64 border-border/60 bg-background p-0 sm:w-80">
          {content}
        </SheetContent>
      </Sheet>
    </>
  );
}

function SidebarContent() {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <div className="flex size-10 items-center justify-center rounded-2xl border border-border bg-background text-lg font-bold text-primary shadow-sm">
            O
          </div>
          <div>
            <div className="text-base leading-tight">Oracly HQ</div>
            <div className="text-xs font-normal text-muted-foreground">Crypto Intelligence Suite</div>
          </div>
        </div>

        <nav className="space-y-4">
          <SidebarSection title="Navigation" items={mainNavigation} />
          <Separator />
          <SidebarSection title="Workspace" items={secondaryNavigation} />
          <Separator />
          <SidebarSection title="Quick actions" items={workspaceQuickActions} />
        </nav>

        <div className="rounded-xl border border-dashed border-border/70 bg-background/50 p-4 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Need more seats?</p>
          <p className="mt-2">
            Invite your team to collaborate on risk assessments, compliance and analytics.
          </p>
          <Button className="mt-4 w-full">Invite teammates</Button>
        </div>
      </div>
    </ScrollArea>
  );
}

type SidebarSectionProps = {
  title: string;
  items: SidebarNavItem[];
};

function SidebarSection({ title, items }: SidebarSectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.35em] text-muted-foreground/80">{title}</p>
      <div className="space-y-1">
        {items.map((item) => (
          <SidebarLink key={item.title} item={item} />
        ))}
      </div>
    </div>
  );
}

type SidebarLinkProps = {
  item: SidebarNavItem;
};

function SidebarLink({ item }: SidebarLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
        item.disabled && "pointer-events-none opacity-50"
      )}
    >
      <span className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg border text-muted-foreground transition",
            isActive && "border-primary/40 bg-primary/10 text-primary",
            item.disabled && "opacity-50"
          )}
        >
          {item.icon}
        </span>
        {item.title}
      </span>
      {item.badge ? (
        <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}
