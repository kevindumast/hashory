"use client";

import { type TransactionEntry } from "@/hooks/dashboard/useDashboardMetrics";
import { TransactionsView } from "./transactions-view";

interface TransactionsTabProps {
  transactions: TransactionEntry[];
  isLoading: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  integrationId?: string | null;
  /** Jeton pré-sélectionné, par exemple depuis la palette de commandes. */
  initialSymbol?: string | null;
}

/**
 * Le filtre par jeton vit désormais dans la vue : il porte sur ce qui sort
 * comme sur ce qui entre, alors qu'ici il ne voyait que l'actif de base —
 * filtrer USDT manquait tous les achats payés en USDT.
 */
export function TransactionsTab({ transactions, isLoading, initialSymbol }: TransactionsTabProps) {
  return <TransactionsView transactions={transactions} isLoading={isLoading} initialSymbol={initialSymbol} />;
}
