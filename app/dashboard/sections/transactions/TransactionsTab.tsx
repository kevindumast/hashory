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

export function TransactionsTab({
  transactions,
  isLoading,
}: TransactionsTabProps) {
  const [symbolFilter, setSymbolFilter] = useState<string>("all");

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (symbolFilter !== "all" && tx.baseAsset !== symbolFilter) {
        return false;
      }
      return true;
    });
  }, [symbolFilter, transactions]);

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
