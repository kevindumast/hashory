"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { isConvexConfigured } from "@/convex/client";
import { usePortfolioSnapshots } from "@/hooks/usePortfolioSnapshots";
import { useFxRates } from "@/hooks/useFxRates";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";
import { SeasonalReturnsView } from "@/app/dashboard/sections/seasonal/SeasonalReturnsView";
import { CalendarDays } from "lucide-react";
import { acquiredCryptoAssets, hasCryptoDisposal } from "@/lib/seasonality";

const DAY_MS = 86_400_000;

export function SeasonalPageClient() {
  const [selectedIntegration, setSelectedIntegration] = useState<string>("all");

  const { snapshots, isComputing } = usePortfolioSnapshots();
  // Données partagées avec le reste du dashboard : un seul calcul.
  const { trades, isLoading, integrations } = useDashboardData();
  const fx = useFxRates();
  const eurPerUsdAt = useMemo(
    () => (timestamp: number) => fx.rateAt(timestamp)?.eurPerUsd ?? null,
    [fx]
  );

  const selectedTrades = useMemo(
    () => trades.filter((t) => String(t.integrationId) === selectedIntegration),
    [selectedIntegration, trades]
  );

  // Sans cession de crypto, il n'y a rien de « réalisé » : on mesure alors
  // la valeur de marché. Convertir des euros en USDC n'est pas une cession.
  const isDcaOnly = useMemo(
    () => selectedIntegration !== "all" && !hasCryptoDisposal(selectedTrades),
    [selectedIntegration, selectedTrades]
  );

  // Cryptos acquises dont il faut l'historique de cours.
  const dcaSymbols = useMemo(
    () => (isDcaOnly ? acquiredCryptoAssets(selectedTrades) : []),
    [isDcaOnly, selectedTrades]
  );

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

  // Sans le change, les achats en euros seraient pris pour des dollars.
  const loading = (isComputing && snapshots.length === 0) || isLoading || fx.isLoading;

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
          eurPerUsdAt={eurPerUsdAt}
        />
      )}
    </div>
  );
}
