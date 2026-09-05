"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useClerk } from "@clerk/nextjs";
import {
  ArrowLeftRight,
  CalendarDays,
  Activity,
  Coins,
  CornerDownLeft,
  FileText,
  LayoutDashboard,
  LogOut,
  Moon,
  Plug,
  RefreshCw,
  Search,
  Sun,
  Wallet,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: React.ElementType;
  run: () => void;
  keywords?: string;
};

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnectProvider: () => void;
};

/**
 * Palette de commandes ⌘K — navigation, actions et recherche de jeton.
 * Remplace le champ de recherche décoratif de la topbar, qui n'exécutait rien.
 */
export function CommandPalette({ open, onOpenChange, onConnectProvider }: CommandPaletteProps) {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const { signOut } = useClerk();
  const { portfolioTokens, refresh } = useDashboardData();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo<CommandItem[]>(() => {
    const go = (href: string) => () => {
      router.push(href);
      onOpenChange(false);
    };

    const base: CommandItem[] = [
      { id: "nav-overview", label: "Portefeuille", group: "Navigation", icon: LayoutDashboard, run: go("/dashboard"), keywords: "overview accueil" },
      { id: "nav-accounts", label: "Mes comptes", group: "Navigation", icon: Wallet, run: go("/dashboard/accounts"), keywords: "integrations plateformes" },
      { id: "nav-performance", label: "Performance et risque", group: "Navigation", icon: Activity, run: go("/dashboard/performance"), keywords: "sharpe drawdown volatilite risque benchmark" },
      { id: "nav-seasonal", label: "Saisonnalité", group: "Navigation", icon: CalendarDays, run: go("/dashboard/seasonal"), keywords: "saison mensuel" },
      { id: "nav-tax", label: "Déclaration fiscale", group: "Navigation", icon: FileText, run: go("/dashboard/tax-report"), keywords: "impots 2086 fisc" },
      { id: "nav-transactions", label: "Transactions", group: "Navigation", icon: ArrowLeftRight, run: go("/dashboard/transactions"), keywords: "trades historique" },
      {
        id: "action-connect",
        label: "Connecter une plateforme",
        hint: "Exchange ou wallet",
        group: "Actions",
        icon: Plug,
        run: () => {
          onOpenChange(false);
          onConnectProvider();
        },
        keywords: "binance kucoin wallet ajouter",
      },
      {
        id: "action-refresh",
        label: "Rafraîchir les données",
        group: "Actions",
        icon: RefreshCw,
        run: () => {
          refresh();
          onOpenChange(false);
          toast.success("Données rafraîchies");
        },
        keywords: "reload sync actualiser",
      },
      {
        id: "action-theme",
        label: resolvedTheme === "dark" ? "Passer en mode clair" : "Passer en mode sombre",
        group: "Actions",
        icon: resolvedTheme === "dark" ? Sun : Moon,
        run: () => {
          setTheme(resolvedTheme === "dark" ? "light" : "dark");
          onOpenChange(false);
        },
        keywords: "theme dark light apparence",
      },
      {
        id: "action-signout",
        label: "Se déconnecter",
        group: "Actions",
        icon: LogOut,
        run: () => {
          onOpenChange(false);
          void signOut(() => router.push("/"));
        },
        keywords: "logout quitter",
      },
    ];

    // Recherche de jeton : accessible seulement quand l'utilisateur tape.
    const tokens: CommandItem[] = query
      ? portfolioTokens.slice(0, 40).map((token) => ({
          id: `token-${token.symbol}`,
          label: token.symbol,
          hint: "Voir dans les transactions",
          group: "Jetons",
          icon: Coins,
          run: () => {
            router.push(`/dashboard/transactions?symbol=${encodeURIComponent(token.symbol)}`);
            onOpenChange(false);
          },
        }))
      : [];

    return [...base, ...tokens];
  }, [router, onOpenChange, onConnectProvider, refresh, resolvedTheme, setTheme, signOut, portfolioTokens, query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      `${item.label} ${item.keywords ?? ""} ${item.group}`.toLowerCase().includes(q)
    );
  }, [items, query]);

  // Réinitialise la sélection dès que la liste change.
  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % Math.max(filtered.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + filtered.length) % Math.max(filtered.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      filtered[activeIndex]?.run();
    }
  };

  // Fait défiler l'élément actif dans la vue lors de la navigation clavier.
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  let lastGroup = "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[15%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0"
        onKeyDown={handleKeyDown}
      >
        <DialogTitle className="sr-only">Palette de commandes</DialogTitle>

        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher une page, une action, un jeton…"
            aria-label="Rechercher une commande"
            className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline-block">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[min(60vh,420px)] overflow-y-auto scrollbar-subtle p-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Aucun résultat pour « {query} ».
            </p>
          ) : (
            filtered.map((item, index) => {
              const Icon = item.icon;
              const showGroup = item.group !== lastGroup;
              lastGroup = item.group;
              return (
                <div key={item.id}>
                  {showGroup && (
                    <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {item.group}
                    </p>
                  )}
                  <button
                    type="button"
                    data-index={index}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={item.run}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                      index === activeIndex
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="flex-1 truncate text-foreground">{item.label}</span>
                    {item.hint && (
                      <span className="hidden text-xs text-muted-foreground sm:inline">{item.hint}</span>
                    )}
                    {index === activeIndex && (
                      <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
