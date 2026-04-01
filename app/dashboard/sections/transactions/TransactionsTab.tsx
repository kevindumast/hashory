"use client";

import { useMemo, useState } from "react";
import {
  type TransactionEntry,
} from "@/hooks/dashboard/useDashboardMetrics";
import { TransactionsView } from "./transactions-view";


interface TransactionsTabProps {
  transactions: TransactionEntry[];
  isLoading: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  integrationId?: string | null;
}

type TypeFilter = "all" | "trade" | "deposit" | "withdrawal";
type DirectionFilter = "all" | "buy" | "sell" | "in" | "out";

export function TransactionsTab({
  transactions,
  isLoading,
}: TransactionsTabProps) {
  const [symbolFilter, setSymbolFilter] = useState<string>("all");

  const filteredTransactions = useMemo(() => {
    const startTimestamp = startDate ? new Date(startDate).getTime() : null;
    const endTimestamp = endDate ? new Date(endDate).getTime() + 86_399_000 : null;

    return transactions.filter((tx) => {
      if (typeFilter !== "all" && tx.type !== typeFilter) {
        return false;
      }

      if (symbolFilter !== "all" && tx.baseAsset !== symbolFilter) {
        return false;
      }

      if (providerFilter !== "all" && tx.providerDisplayName !== providerFilter) {
        return false;
      }

      if (directionFilter !== "all") {
        if (tx.type === "trade") {
          if (directionFilter === "buy" && tx.side !== "BUY") {
            return false;
          }
          if (directionFilter === "sell" && tx.side !== "SELL") {
            return false;
          }
          if (directionFilter === "in" || directionFilter === "out") {
            return false;
          }
        } else if (tx.type === "deposit") {
          if (directionFilter !== "in") {
            return false;
          }
        } else if (tx.type === "withdrawal") {
          if (directionFilter !== "out") {
            return false;
          }
        }
      }

      const timestamp =
        tx.type === "trade" ? tx.executedAt : tx.timestamp;

      if (startTimestamp && timestamp < startTimestamp) {
        return false;
      }
      if (endTimestamp && timestamp > endTimestamp) {
        return false;
      }

      return true;
    });
  }, [directionFilter, endDate, providerFilter, startDate, symbolFilter, transactions, typeFilter]);

  // Extract unique symbols from transactions for filter dropdown
  const availableSymbols = Array.from(
    new Set(transactions.map(tx => tx.baseAsset).filter(Boolean))
  ).sort();

  return (
    <TransactionsView
      transactions={filteredTransactions}
      isLoading={isLoading}
      symbolFilter={symbolFilter}
      onSymbolFilterChange={setSymbolFilter}
      availableSymbols={availableSymbols}
    />
  );
}
