"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  type TransactionEntry,
} from "@/hooks/dashboard/useDashboardMetrics";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { LoaderCircle } from "lucide-react";
import { TransactionsView } from "./transactions-view";


interface TransactionsTabProps {
  transactions: TransactionEntry[];
  isLoading: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

type TypeFilter = "all" | "trade" | "deposit" | "withdrawal";
type DirectionFilter = "all" | "buy" | "sell" | "in" | "out";

export function TransactionsTab({
  transactions,
  isLoading,
  onRefresh,
  isRefreshing,
}: TransactionsTabProps) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [symbolFilter, setSymbolFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const providerOptions = useMemo(
    () => Array.from(new Set(transactions.map((tx) => tx.providerDisplayName))).sort(),
    [transactions]
  );

  const symbolOptions = useMemo(
    () => Array.from(new Set(transactions.map((tx) => tx.baseAsset))).sort(),
    [transactions]
  );

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

  const totalEntries = transactions.length;
  const visibleEntries = filteredTransactions.length;

  return (
    <div className="space-y-4">
      {/* Filtres existants conservés mais stylisés pour s'intégrer */}
      <Card className="border-border/60 bg-card/80 backdrop-blur">
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <CardDescription>All exchanges</CardDescription>
          <CardTitle className="text-lg">Transactions</CardTitle>
          <p className="text-xs text-muted-foreground">
            {visibleEntries === totalEntries
              ? `${totalEntries} entries`
              : `${visibleEntries} / ${totalEntries} entries visible`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {onRefresh ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => onRefresh()}
              disabled={isLoading || isRefreshing}
            >
              {isRefreshing ? (
                <span className="flex items-center gap-2">
                  <LoaderCircle className="size-3 animate-spin" />
                  Refreshing...
                </span>
              ) : (
                "Refresh data"
              )}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
          <FilterSelect
            label="Type"
            value={typeFilter}
            onValueChange={(value) => setTypeFilter(value as TypeFilter)}
            options={[
              { value: "all", label: "All types" },
              { value: "trade", label: "Trades" },
              { value: "deposit", label: "Deposits" },
              { value: "withdrawal", label: "Withdrawals" },
            ]}
          />
          <FilterSelect
            label="Direction"
            value={directionFilter}
            onValueChange={(value) => setDirectionFilter(value as DirectionFilter)}
            options={[
              { value: "all", label: "All directions" },
              { value: "buy", label: "Buy" },
              { value: "sell", label: "Sell" },
              { value: "in", label: "Inbound" },
              { value: "out", label: "Outbound" },
            ]}
          />
          <FilterSelect
            label="Platform"
            value={providerFilter}
            onValueChange={setProviderFilter}
            options={[
              { value: "all", label: "All platforms" },
              ...providerOptions.map((option) => ({ value: option, label: option })),
            ]}
          />
          <FilterSelect
            label="Asset"
            value={symbolFilter}
            onValueChange={setSymbolFilter}
            options={[
              { value: "all", label: "All assets" },
              ...symbolOptions.map((option) => ({ value: option, label: option })),
            ]}
          />
          <FilterDate label="From" value={startDate} onChange={setStartDate} />
          <FilterDate label="To" value={endDate} onChange={setEndDate} />
        </div>
      </CardContent>
    </Card>

    {/* Nouvelle vue des transactions */}
    <TransactionsView transactions={filteredTransactions} isLoading={isLoading} />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-9 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FilterDate({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <Input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 text-xs"
      />
    </div>
  );
}
