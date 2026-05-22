"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { isConvexConfigured } from "@/convex/client";

export type IntegrationRecord = {
  _id: Id<"integrations">;
  provider: string;
  displayName?: string;
  readOnly: boolean;
  scopes: string[];
  createdAt: number;
  updatedAt: number;
  lastSyncedAt?: number | null;
  syncStatus: "idle" | "syncing" | "synced" | "error";
  accountCreatedAt?: number | null;
  publicAddress?: string | null;
};

export function useIntegrations() {
  const [refreshToken, setRefreshToken] = useState(0);

  const integrations = useQuery(
    api.integrations.list,
    isConvexConfigured ? { refreshToken } : "skip"
  );
  const data = useMemo<IntegrationRecord[]>(() => integrations ?? [], [integrations]);

  const refreshIntegrations = useCallback(() => {
    setRefreshToken((value) => value + 1);
  }, []);

  return {
    integrations: data,
    providersCount: data.length,
    refreshToken,
    refreshIntegrations,
    isLoading: isConvexConfigured && integrations === undefined,
  };
}
