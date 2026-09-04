"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";
import { TransactionsTab } from "@/app/dashboard/sections/transactions/TransactionsTab";

export function TransactionsPageClient() {
  const searchParams = useSearchParams();
  const integrationId = searchParams.get("integrationId");
  const symbol = searchParams.get("symbol");
  const { transactions, isLoading } = useDashboardData();

  // Filtre par plateforme : porté par l'URL depuis la page « Mes comptes ».
  const filteredTransactions = useMemo(() => {
    if (!integrationId) return transactions;
    return transactions.filter((tx) => tx.integrationId === integrationId);
  }, [transactions, integrationId]);

  return (
    <div className="p-6 md:p-9 h-full flex flex-col">
      <TransactionsTab
        transactions={filteredTransactions}
        isLoading={isLoading}
        integrationId={integrationId}
        initialSymbol={symbol}
      />
    </div>
  );
}
