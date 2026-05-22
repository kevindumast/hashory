"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useDashboardMetrics } from "@/hooks/dashboard/useDashboardMetrics";
import { TransactionsTab } from "@/app/dashboard/sections/transactions/TransactionsTab";

export function TransactionsPageClient() {
  const searchParams = useSearchParams();
  const integrationId = searchParams.get("integrationId");
  const { transactions, isLoading } = useDashboardMetrics(0);

  // Filtrer les transactions par integrationId si présent
  const filteredTransactions = useMemo(() => {
    if (!integrationId || !transactions) {
      return transactions || [];
    }
    return transactions.filter((tx) => tx.integrationId === integrationId);
  }, [transactions, integrationId]);

  return (
    <div className="p-6 md:p-9 h-full flex flex-col">
      <TransactionsTab
        transactions={filteredTransactions}
        isLoading={isLoading}
        integrationId={integrationId}
      />
    </div>
  );
}