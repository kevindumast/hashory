"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { isConvexConfigured } from "@/convex/client";
import { usePortfolioSnapshots } from "@/hooks/usePortfolioSnapshots";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";
import { SeasonalReturnsView } from "@/app/dashboard/sections/seasonal/SeasonalReturnsView";
import { CalendarDays } from "lucide-react";

const DAY_MS = 86_400_000;
const QUOTE_ASSETS = ["USDT","USDC","BUSD","USD","FDUSD","TUSD","DAI","BTC","ETH","BNB","EUR","GBP","TRY","AUD","CAD","BRL","ARS"];
const STABLECOINS = new Set(["USDT","USDC","BUSD","USD","FDUSD","TUSD","DAI"]);

function extractBase(symbol: string): string {
  const upper = symbol.toUpperCase();
  for (const q of QUOTE_ASSETS) {
    if (upper.endsWith(q)) { const b = upper.slice(0, upper.length - q.length); if (b) return b; }
  }
  return upper;
}

export function SeasonalPageClient() {
  const [selectedIntegration, setSelectedIntegration] = useState<string>("all");

  const { snapshots, isComputing } = usePortfolioSnapshots();
  // Données partagées avec le reste du dashboard : un seul calcul.
  const { trades, isLoading, integrations } = useDashboardData();

  // Detect DCA-only integrations (no sells)
  const isDcaOnly = useMemo(() => {
    if (selectedIntegration === "all") return false;
    return !trades.some((t) => String(t.integrationId) === selectedIntegration && t.side === "SELL");
  }, [selectedIntegration, trades]);

  // Symbols held by selected DCA integration (non-stablecoin bases)
  const dcaSymbols = useMemo(() => {
    if (!isDcaOnly || selectedIntegration === "all") return [];
    const syms = new Set<string>();
    trades
      .filter((t) => String(t.integrationId) === selectedIntegration)
      .forEach((t) => {
        const base = t.tradeType === "CONVERT" && t.toAsset
          ? t.toAsset.toUpperCase()
          : extractBase(t.symbol);
        if (!STABLECOINS.has(base)) syms.add(base);
      });
    return Array.from(syms);
  }, [isDcaOnly, selectedIntegration, trades]);

  // Date range for price query
  const { fromDay, toDay } = useMemo(() => {
    if (!isDcaOnly || selectedIntegration === "all" || trades.length === 0) return { fromDay: 0, toDay: 0 };
    const integTrades = trades.filter((t) => String(t.integrationId) === selectedIntegration);
    if (integTrades.length === 0) return { fromDay: 0, toDay: 0 };
    const minTs = Math.min(...integTrades.map((t) => t.executedAt));
    return {
      fromDay: Math.floor(minTs / DAY_MS) * DAY_MS,
      toDay: Math.floor(Date.now() / DAY_MS) * DAY_MS,
    };
  }, [isDcaOnly, selectedIntegration, trades]);

  const dcaPriceHistory = useQuery(
    api.portfolioSnapshots.listSymbolPrices,
    isConvexConfigured && isDcaOnly && dcaSymbols.length > 0 && fromDay > 0
      ? { symbols: dcaSymbols, fromDay, toDay }
      : "skip"
  );

  const loading = (isComputing && snapshots.length === 0) || isLoading;

  return (
    <div className="p-6 md:p-9 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center size-9 rounded-lg bg-primary/10 text-primary">
          <CalendarDays className="size-4" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">Saisonnalité</h1>
          <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">
            Analyse des rendements périodiques
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
          Chargement des données...
        </div>
      ) : (
        <SeasonalReturnsView
          snapshots={snapshots}
          integrations={integrations}
          allTrades={trades}
          selectedIntegration={selectedIntegration}
          onSelectIntegration={setSelectedIntegration}
          isDcaOnly={isDcaOnly}
          dcaPriceHistory={dcaPriceHistory ?? null}
        />
      )}
    </div>
  );
}
