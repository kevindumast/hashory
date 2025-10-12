"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  currencyFormatter,
  dateFormatter,
  numberFormatter,
  type PortfolioToken,
  type TokenTimelineEvent,
} from "@/hooks/dashboard/useDashboardMetrics";
import { cn } from "@/lib/utils";

type TokenPortfolioSectionProps = {
  tokens: PortfolioToken[];
};

type ChartPoint = {
  timestamp: number;
  price: number;
  quantity: number;
  type: TokenTimelineEvent["type"];
  provider: string;
  providerDisplayName: string;
};

type ChartSlices = {
  series: ChartPoint[];
  buys: ChartPoint[];
  sells: ChartPoint[];
  deposits: ChartPoint[];
  withdrawals: ChartPoint[];
  hasPriceHistory: boolean;
};

export function TokenPortfolioSection({ tokens }: TokenPortfolioSectionProps) {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  const orderedTokens = useMemo(
    () =>
      [...tokens].sort((a, b) => {
        if (a.currentQuantity === 0 && b.currentQuantity !== 0) {
          return 1;
        }
        if (a.currentQuantity !== 0 && b.currentQuantity === 0) {
          return -1;
        }
        if (b.investedUsd === a.investedUsd) {
          return b.lastActivityAt - a.lastActivityAt;
        }
        return b.investedUsd - a.investedUsd;
      }),
    [tokens]
  );

  const selectedToken = useMemo(
    () => orderedTokens.find((token) => token.symbol === selectedSymbol),
    [orderedTokens, selectedSymbol]
  );

  const chart = useMemo<ChartSlices>(() => {
    if (!selectedToken) {
      return {
        series: [],
        buys: [],
        sells: [],
        deposits: [],
        withdrawals: [],
        hasPriceHistory: false,
      };
    }

    let carryPrice: number | null = null;
    const series: ChartPoint[] = [];
    const buys: ChartPoint[] = [];
    const sells: ChartPoint[] = [];
    const deposits: ChartPoint[] = [];
    const withdrawals: ChartPoint[] = [];

    selectedToken.events.forEach((event) => {
      if ((event.type === "BUY" || event.type === "SELL") && typeof event.price === "number") {
        carryPrice = event.price;
        const point: ChartPoint = {
          timestamp: event.timestamp,
          price: event.price,
          quantity: event.quantity,
          type: event.type,
          provider: event.provider,
          providerDisplayName: event.providerDisplayName,
        };
        series.push(point);
        if (event.type === "BUY") {
          buys.push(point);
        } else {
          sells.push(point);
        }
        return;
      }

      if (carryPrice !== null) {
        const point: ChartPoint = {
          timestamp: event.timestamp,
          price: carryPrice,
          quantity: event.quantity,
          type: event.type,
          provider: event.provider,
          providerDisplayName: event.providerDisplayName,
        };
        series.push(point);
        if (event.type === "DEPOSIT") {
          deposits.push(point);
        }
        if (event.type === "WITHDRAWAL") {
          withdrawals.push(point);
        }
      }
    });

    return {
      series,
      buys,
      sells,
      deposits,
      withdrawals,
      hasPriceHistory: series.some((point) => point.type === "BUY" || point.type === "SELL"),
    };
  }, [selectedToken]);

  const resetSelection = () => setSelectedSymbol(null);

  return (
    <>
      <Card className="border-border/60 bg-card/80 backdrop-blur">
        <CardHeader className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-1">
            <CardDescription>Token allocation</CardDescription>
            <CardTitle className="text-lg text-foreground">Portfolio breakdown</CardTitle>
          </div>
          <CardDescription className="text-xs text-muted-foreground">
            Includes trades, deposits, and withdrawals imported from Binance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orderedTokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Connect Binance and run a sync to populate your portfolio.
            </p>
          ) : (
            <ScrollArea className="max-h-[420px]">
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 bg-card/95 backdrop-blur">
                    <TableHead className="w-[120px] text-xs uppercase tracking-wide text-muted-foreground/80">
                      Token
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground/80">
                      Holdings
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground/80">
                      Bought
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground/80">
                      Sold
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground/80">
                      Deposits
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground/80">
                      Withdrawals
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground/80">
                      Avg buy
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground/80">
                      Net USD
                    </TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground/80">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderedTokens.map((token) => {
                    const netUsd = token.investedUsd - token.realizedUsd;
                    return (
                      <TableRow key={token.symbol} className="hover:bg-muted/40">
                        <TableCell className="font-semibold uppercase tracking-wide text-foreground">
                          {token.symbol}
                        </TableCell>
                        <TableCell className="text-sm">
                          {numberFormatter.format(token.currentQuantity)}
                        </TableCell>
                        <TableCell className="text-sm text-emerald-500">
                          +{numberFormatter.format(token.buyQuantity)}
                        </TableCell>
                        <TableCell className="text-sm text-red-500">
                          -{numberFormatter.format(token.sellQuantity)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {token.depositQuantity === 0
                            ? "—"
                            : numberFormatter.format(token.depositQuantity)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {token.withdrawalQuantity === 0
                            ? "—"
                            : `-${numberFormatter.format(token.withdrawalQuantity)}`}
                        </TableCell>
                        <TableCell className="text-sm">
                          {token.averageBuyPrice !== undefined
                            ? numberFormatter.format(token.averageBuyPrice)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {netUsd === 0 ? "—" : currencyFormatter.format(netUsd)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs font-semibold uppercase tracking-wide"
                            onClick={() => setSelectedSymbol(token.symbol)}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selectedToken} onOpenChange={(open) => {
        if (!open) {
          resetSelection();
        }
      }}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto bg-background/95 backdrop-blur sm:max-w-xl lg:max-w-3xl"
        >
          {selectedToken ? (
            <>
              <SheetHeader className="space-y-2 pb-4 text-left">
                <SheetTitle className="text-2xl font-semibold uppercase tracking-wide text-foreground">
                  {selectedToken.symbol}
                </SheetTitle>
                <SheetDescription className="text-sm text-muted-foreground">
                  {selectedToken.events.length} events imported — last update{" "}
                  {dateFormatter.format(new Date(selectedToken.lastActivityAt))}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-6">
                <Card className="border-border/60 bg-card/80 backdrop-blur">
                  <CardHeader>
                    <CardDescription>Price markers</CardDescription>
                    <CardTitle className="text-lg">Trade history</CardTitle>
                  </CardHeader>
                  <CardContent className="h-72">
                    {chart.hasPriceHistory ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chart.series}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
                          <XAxis
                            type="number"
                            dataKey="timestamp"
                            stroke="hsl(var(--muted-foreground))"
                            tickFormatter={(value) =>
                              new Date(value).toLocaleDateString("fr-FR", {
                                month: "short",
                                day: "numeric",
                              })
                            }
                          />
                          <YAxis
                            dataKey="price"
                            stroke="hsl(var(--muted-foreground))"
                            tickFormatter={(value) => numberFormatter.format(Number(value))}
                            width={64}
                          />
                          <RechartsTooltip
                            content={({ active, payload }) => {
                              if (!active || !payload || payload.length === 0) {
                                return null;
                              }
                              const point = payload[0].payload as ChartPoint;
                              return (
                                <div className="rounded-lg border border-border/60 bg-background/95 p-3 text-xs shadow-lg">
                                  <p className="font-semibold uppercase tracking-wide text-foreground">
                                    {new Date(point.timestamp).toLocaleString("fr-FR")}
                                  </p>
                                  <p className="mt-1 text-muted-foreground">
                                    Price {numberFormatter.format(point.price)}
                                  </p>
                                  <p className="text-muted-foreground">
                                    Qty {numberFormatter.format(point.quantity)}
                                  </p>
                                </div>
                              );
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="price"
                            stroke="#C9A646"
                            strokeWidth={3}
                            dot={false}
                            isAnimationActive={false}
                          />
                          <Scatter data={chart.buys} fill="#22c55e" shape="circle" />
                          <Scatter data={chart.sells} fill="#ef4444" shape="circle" />
                          <Scatter
                            data={chart.deposits}
                            fill="#0ea5e9"
                            shape="triangle"
                          />
                          <Scatter
                            data={chart.withdrawals}
                            fill="#a855f7"
                            shape="triangle"
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        No price history available yet. Import a trade to plot the timeline.
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-card/80 backdrop-blur">
                  <CardHeader>
                    <CardDescription>Detailed timeline</CardDescription>
                    <CardTitle className="text-lg">Events</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="max-h-[280px]">
                      <div className="divide-y divide-border/60">
                        {selectedToken.events.map((event) => (
                          <div key={event.id} className="flex flex-col gap-1 py-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "uppercase tracking-wide",
                                    event.type === "BUY" && "border-emerald-500/40 text-emerald-500",
                                    event.type === "SELL" && "border-red-500/40 text-red-500",
                                    event.type === "DEPOSIT" && "border-sky-500/40 text-sky-500",
                                    event.type === "WITHDRAWAL" && "border-purple-500/40 text-purple-500"
                                  )}
                                >
                                  {event.type}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {event.providerDisplayName}
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {new Date(event.timestamp).toLocaleString("fr-FR")}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              <span>
                                Qty {numberFormatter.format(event.quantity)}
                              </span>
                              {event.price !== undefined && (
                                <span>Price {numberFormatter.format(event.price)}</span>
                              )}
                              {event.valueUsd !== undefined && (
                                <span>Notional {currencyFormatter.format(event.valueUsd)}</span>
                              )}
                              {event.fee !== undefined && (
                                <span>
                                  Fee {numberFormatter.format(event.fee)} {event.feeAsset ?? ""}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
