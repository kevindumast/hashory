"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  currencyFormatter,
  numberFormatter,
  priceFormatter,
  dateFormatter,
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
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

const QUOTE_ASSETS = [
  "USDT", "USDC", "BUSD", "USD", "FDUSD", "TUSD", "DAI",
  "BTC", "ETH", "BNB", "EUR", "GBP", "TRY", "AUD", "CAD", "BRL"
];

function extractQuoteAsset(symbol: string): string {
  const upper = symbol.toUpperCase();
  for (const quote of QUOTE_ASSETS) {
    if (upper.endsWith(quote)) {
      return quote;
    }
  }
  return "UNKNOWN";
}

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

        <div className="overflow-hidden rounded-xl border border-border/60">
          {isLoading ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              Loading transactions...
            </div>
          ) : filteredTransactions.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                No transaction matches the current filters.
            </div>
          ) : (
            <ScrollArea className="h-[520px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Exchange</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="text-right">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.map((entry) => (
                    <TableRow key={`${entry.type}-${entry.id}`} className="text-sm">
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">{entry.providerDisplayName}</p>
                          {entry.type === "trade" && (
                            <p className="text-[11px] text-muted-foreground">{entry.symbol}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <TransactionBadge entry={entry} />
                      </TableCell>
                      <TableCell>{renderFromAsset(entry)}</TableCell>
                      <TableCell>{renderToAsset(entry)}</TableCell>
                      <TableCell>{renderRate(entry)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{renderDetails(entry)}</TableCell>
                      <TableCell className="text-right">{renderDate(entry)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>
      </CardContent>
    </Card>
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

function AssetAvatar({ symbol }: { symbol: string }) {
  const initials = symbol.slice(0, 3).toUpperCase();
  return (
      <Avatar className="size-8 border border-border/60 bg-muted/60 text-[11px] font-semibold uppercase">
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}

function TransactionBadge({ entry }: { entry: TransactionEntry }) {
  if (entry.type === "trade") {
    const isBuy = entry.side === "BUY";
    return (
      <Badge
        variant="outline"
        className={cn(
          "rounded-full px-3 py-1 text-[11px] font-semibold",
          isBuy ? "border-emerald-500/40 text-emerald-500" : "border-red-500/40 text-red-500"
        )}
      >
        Trade - {isBuy ? "Buy" : "Sell"}
      </Badge>
    );
  }
  if (entry.type === "deposit") {
    return (
      <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px] font-semibold text-emerald-500">
        Deposit - Inbound
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px] font-semibold text-red-500">
      Withdrawal - Outbound
    </Badge>
  );
}

function renderFromAsset(entry: TransactionEntry) {
  if (entry.type === "trade") {
    const quoteAsset = extractQuoteAsset(entry.symbol);
    const quoteQty = entry.quoteQuantity ?? entry.price * entry.quantity;

    if (entry.side === "BUY") {
      // BUY: dépense la quote currency
      return (
        <div className="flex items-center gap-2">
          <AssetAvatar symbol={quoteAsset} />
          <div className="space-y-0.5">
            <p className="font-medium text-foreground">{numberFormatter.format(quoteQty)}</p>
            <p className="text-[11px] text-muted-foreground">{quoteAsset}</p>
          </div>
        </div>
      );
    } else {
      // SELL: vend la base currency
      return (
        <div className="flex items-center gap-2">
          <AssetAvatar symbol={entry.baseAsset} />
          <div className="space-y-0.5">
            <p className="font-medium text-foreground">{numberFormatter.format(entry.quantity)}</p>
            <p className="text-[11px] text-muted-foreground">{entry.baseAsset}</p>
          </div>
        </div>
      );
    }
  }

  if (entry.type === "withdrawal") {
    return (
      <div className="flex items-center gap-2">
        <AssetAvatar symbol={entry.baseAsset} />
        <div className="space-y-0.5">
          <p className="font-medium text-foreground">{numberFormatter.format(entry.amount)}</p>
          <p className="text-[11px] text-muted-foreground">{entry.baseAsset}</p>
        </div>
      </div>
    );
  }

  return <span className="text-muted-foreground">--</span>;
}

function renderToAsset(entry: TransactionEntry) {
  if (entry.type === "trade") {
    const quoteAsset = extractQuoteAsset(entry.symbol);
    const quoteQty = entry.quoteQuantity ?? entry.price * entry.quantity;

    if (entry.side === "BUY") {
      // BUY: reçoit la base currency
      return (
        <div className="flex items-center gap-2">
          <AssetAvatar symbol={entry.baseAsset} />
          <div className="space-y-0.5">
            <p className="font-medium text-foreground">{numberFormatter.format(entry.quantity)}</p>
            <p className="text-[11px] text-muted-foreground">{entry.baseAsset}</p>
          </div>
        </div>
      );
    } else {
      // SELL: reçoit la quote currency
      return (
        <div className="flex items-center gap-2">
          <AssetAvatar symbol={quoteAsset} />
          <div className="space-y-0.5">
            <p className="font-medium text-foreground">{numberFormatter.format(quoteQty)}</p>
            <p className="text-[11px] text-muted-foreground">{quoteAsset}</p>
          </div>
        </div>
      );
    }
  }

  if (entry.type === "deposit") {
    return (
      <div className="flex items-center gap-2">
        <AssetAvatar symbol={entry.baseAsset} />
        <div className="space-y-0.5">
          <p className="font-medium text-foreground">{numberFormatter.format(entry.amount)}</p>
          <p className="text-[11px] text-muted-foreground">{entry.baseAsset}</p>
        </div>
      </div>
    );
  }

  return <span className="text-muted-foreground">--</span>;
}

function renderRate(entry: TransactionEntry) {
  if (entry.type === "trade") {
    const quoteAsset = extractQuoteAsset(entry.symbol);
    return (
      <div className="space-y-0.5">
        <p className="font-medium text-foreground">{priceFormatter.format(entry.price)}</p>
        <p className="text-[11px] text-muted-foreground">{quoteAsset}/{entry.baseAsset}</p>
      </div>
    );
  }
  return <span className="text-muted-foreground">--</span>;
}

function renderDetails(entry: TransactionEntry) {
  if (entry.type === "trade") {
    if (!entry.fee) {
      return "No fee reported";
    }
    return `Fee ${numberFormatter.format(entry.fee)} ${entry.feeAsset ?? ""}`.trim();
  }
  if (entry.type === "deposit") {
    return [entry.network ?? undefined, entry.status].filter(Boolean).join(" • ") || "Deposit";
  }
  return [
    entry.network ?? undefined,
    `Fee ${numberFormatter.format(entry.fee)}`
  ]
    .filter(Boolean)
    .join(" • ");
}

function renderDate(entry: TransactionEntry) {
  const timestamp = entry.type === "trade" ? entry.executedAt : entry.timestamp;
  return dateFormatter.format(new Date(timestamp));
}
