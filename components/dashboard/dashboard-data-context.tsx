"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useDashboardMetrics } from "@/hooks/dashboard/useDashboardMetrics";
import { useIntegrations } from "@/hooks/dashboard/useIntegrations";

type DashboardData = ReturnType<typeof useDashboardMetrics> & {
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

  const refresh = useCallback(() => {
    setRefreshToken((value) => value + 1);
    refreshIntegrations();
  }, [refreshIntegrations]);

  const value = useMemo<DashboardData>(
    () => ({
      ...metrics,
      integrations,
      integrationsCount: integrations.length,
      isLoadingIntegrations,
      hasNoIntegration: !isLoadingIntegrations && integrations.length === 0,
      refresh,
    }),
    [metrics, integrations, isLoadingIntegrations, refresh]
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
