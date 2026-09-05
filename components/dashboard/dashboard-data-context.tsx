"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useDashboardMetrics } from "@/hooks/dashboard/useDashboardMetrics";
import { useIntegrations } from "@/hooks/dashboard/useIntegrations";
import { useCurrentPrices } from "@/hooks/useCurrentPrices";

type DashboardData = ReturnType<typeof useDashboardMetrics> & {
  /** Cours actuels, par symbole. */
  currentPrices: Record<string, number>;
  pricesLoading: boolean;
  pricesError: string | null;
  /** Recharge tous les cours. Distinct de `refresh`, qui relit aussi les données. */
  refreshPrices: () => void;
  /** Recharge le cours d'un seul actif. */
  refreshSymbol: (symbol: string) => Promise<void>;
  refreshingSymbols: Set<string>;
  integrations: ReturnType<typeof useIntegrations>["integrations"];
  integrationsCount: number;
  isLoadingIntegrations: boolean;
  /** Vrai tant qu'aucune plateforme n'est connectée — pilote le parcours d'accueil. */
  hasNoIntegration: boolean;
  refresh: () => void;
};

const DashboardDataContext = createContext<DashboardData | undefined>(undefined);

/**
 * Charge les métriques du portefeuille **une seule fois** pour tout le
 * dashboard. Auparavant `useDashboardMetrics` était appelé séparément par la
 * sidebar, la navigation mobile et le contenu : trois fois le même calcul sur
 * l'ensemble des trades, à chaque rendu.
 */
export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [refreshToken, setRefreshToken] = useState(0);
  const metrics = useDashboardMetrics(refreshToken);
  const { integrations, isLoading: isLoadingIntegrations, refreshIntegrations } = useIntegrations();

  // Les cours sont chargés une fois pour tout le dashboard. Chaque écran en
  // tenait auparavant sa propre copie : autant de lots simultanés vers la
  // place de marché, qui en refusait une partie, et autant d'états
  // divergents d'un tableau à l'autre.
  const {
    currentPrices,
    loading: pricesLoading,
    error: pricesError,
    // Nommé explicitement : un `refresh` de plus aurait été masqué par celui
    // du contexte, sans que rien ne le signale.
    refresh: refreshPrices,
    refreshSymbol,
    refreshingSymbols,
  } = useCurrentPrices(metrics.portfolioTokens);

  const refresh = useCallback(() => {
    setRefreshToken((value) => value + 1);
    refreshIntegrations();
  }, [refreshIntegrations]);

  const value = useMemo<DashboardData>(
    () => ({
      ...metrics,
      currentPrices,
      pricesLoading,
      pricesError,
      refreshPrices,
      refreshSymbol,
      refreshingSymbols,
      integrations,
      integrationsCount: integrations.length,
      isLoadingIntegrations,
      hasNoIntegration: !isLoadingIntegrations && integrations.length === 0,
      refresh,
    }),
    [
      metrics,
      currentPrices,
      pricesLoading,
      pricesError,
      refreshPrices,
      refreshSymbol,
      refreshingSymbols,
      integrations,
      isLoadingIntegrations,
      refresh,
    ]
  );

  return <DashboardDataContext.Provider value={value}>{children}</DashboardDataContext.Provider>;
}

export function useDashboardData() {
  const context = useContext(DashboardDataContext);
  if (!context) {
    throw new Error("useDashboardData doit être utilisé dans un DashboardDataProvider.");
  }
  return context;
}
