"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Scatter,
  Tooltip as RechartsTooltip,
  TooltipProps,
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
  priceFormatter,
  type PortfolioToken,
  type TokenTimelineEvent,
} from "@/hooks/dashboard/useDashboardMetrics";
import { cn } from "@/lib/utils";
import { LoaderCircle } from "lucide-react";

const EARLIEST_BINANCE_TIMESTAMP = Date.UTC(2017, 0, 1);
const FALLBACK_QUOTES = ["USDT", "USDC", "BUSD", "FDUSD", "TUSD", "USD", "BTC", "ETH", "BNB"];

function buildPriceSymbolCandidates(token: PortfolioToken): string[] {
  const candidates = new Set<string>();
  if (token.primarySymbol) {
    candidates.add(token.primarySymbol.toUpperCase());
  }
  token.tradeSymbols.forEach((symbol) => candidates.add(symbol.toUpperCase()));
  const base = token.symbol.toUpperCase();
  FALLBACK_QUOTES.forEach((quote) => candidates.add(`${base}${quote}`));
  return Array.from(candidates);
}

type TokenPortfolioSectionProps = {
  tokens: PortfolioToken[];
};

type RangeKey = "1H" | "1D" | "1W" | "1M" | "1Y" | "MAX";

type ChartPoint = {
  timestamp: number;
  price: number;
  quantity: number;
  type: TokenTimelineEvent["type"];
  provider: string;
  providerDisplayName: string;
};

type PricePoint = {
  timestamp: number;
  price: number;
  change?: number;
};

type ChartSlices = {
  line: PricePoint[];
  buys: ChartPoint[];
  sells: ChartPoint[];
  hasPriceHistory: boolean;
};

type ExtendedTooltipProps = TooltipProps<number, string> & {
  payload?: Array<
    {
      payload?: PricePoint | ChartPoint;
    } & Record<string, unknown>
  >;
};

const RANGE_CONFIG: Record<
  RangeKey,
  { label: string; interval: string; durationMs?: number; limit: number }
> = {
  "1H": {
    label: "1H",
    interval: "1m",
    durationMs: 60 * 60 * 1000,
    limit: 120,
  },
  "1D": {
    label: "1D",
    interval: "15m",
    durationMs: 24 * 60 * 60 * 1000,
    limit: 200,
  },
  "1W": {
    label: "1W",
    interval: "1h",
    durationMs: 7 * 24 * 60 * 60 * 1000,
    limit: 200,
  },
  "1M": {
    label: "1M",
    interval: "4h",
    durationMs: 30 * 24 * 60 * 60 * 1000,
    limit: 200,
  },
  "1Y": {
    label: "1Y",
    interval: "1d",
    durationMs: 365 * 24 * 60 * 60 * 1000,
    limit: 400,
  },
  MAX: {
    label: "Max",
    interval: "1d",
    limit: 1000,
  },
};

export function TokenPortfolioSection({ tokens }: TokenPortfolioSectionProps) {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("1M");

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

  const [priceSeries, setPriceSeries] = useState<PricePoint[]>([]);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [rangeWindow, setRangeWindow] = useState<{ start: number; end: number } | null>(null);
  const [activePriceSymbol, setActivePriceSymbol] = useState<string | null>(null);
  const [priceSymbolError, setPriceSymbolError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedToken) {
      setPriceSeries([]);
      setPriceError(null);
      setPriceSymbolError(null);
      setActivePriceSymbol(null);
      setPriceLoading(false);
      return;
    }

    let isActive = true;
    const controller = new AbortController();
    const config = RANGE_CONFIG[range];
    const now = Date.now();
    const earliestEvent = selectedToken.events[0]?.timestamp ?? now;

    let startTime: number;
    const endTime = now;

    if (config.durationMs !== undefined) {
      startTime = Math.max(0, now - config.durationMs);
      const buffer = 24 * 60 * 60 * 1000; // 1 day padding
      startTime = Math.max(0, startTime - buffer);
    } else {
      const baselineStart = Math.min(earliestEvent, EARLIEST_BINANCE_TIMESTAMP);
      startTime = Math.max(0, baselineStart);
    }

    // expose window immediately for event filtering
    setRangeWindow({ start: startTime, end: endTime });

    const candidates = buildPriceSymbolCandidates(selectedToken);
    if (candidates.length === 0) {
      setPriceSeries([]);
      setPriceError(null);
      setPriceSymbolError("Aucune paire Binance disponible pour cet actif.");
      setPriceLoading(false);
      return;
    }

    const fetchSeriesForSymbol = async (symbol: string) => {
      const aggregated: Array<{ timestamp: number; price: number }> = [];
      let cursor = startTime;
      let iterations = 0;
      const maxIterations = 120;

      while (cursor < endTime && iterations < maxIterations) {
        iterations += 1;

        const params = new URLSearchParams({
          symbol,
          interval: config.interval,
          limit: String(config.limit),
          startTime: Math.floor(cursor).toString(),
          endTime: Math.floor(endTime).toString(),
        });

        const response = await fetch(
          `https://api.binance.com/api/v3/klines?${params.toString()}`,
          {
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Binance klines error (${response.status}) for ${symbol}: ${errorText}`);
        }

        const raw = (await response.json()) as unknown;
        if (!Array.isArray(raw) || raw.length === 0) {
          break;
        }

        const batch = raw
          .map((item) => {
            if (!Array.isArray(item) || item.length < 5) {
              return null;
            }
            const timestamp = Number(item[0]);
            const close = Number(item[4]);
            if (Number.isNaN(timestamp) || Number.isNaN(close)) {
              return null;
            }
            return { timestamp, price: close };
          })
          .filter((entry): entry is { timestamp: number; price: number } => !!entry);

        if (batch.length === 0) {
          break;
        }

        aggregated.push(...batch);

        const lastTimestamp = batch[batch.length - 1].timestamp;
        if (batch.length < config.limit || lastTimestamp >= endTime) {
          break;
        }

        const nextCursor = lastTimestamp + 1;
        if (nextCursor <= cursor) {
          break;
        }
        cursor = nextCursor;
      }

      const sorted = aggregated
        .sort((a, b) => a.timestamp - b.timestamp)
        .filter(
          (entry, index, array) =>
            index === 0 || entry.timestamp !== array[index - 1].timestamp
        );

      if (sorted.length === 0) {
        return [] as PricePoint[];
      }

      const firstPrice = sorted[0].price;
      return sorted.map((point) => ({
        ...point,
        change: firstPrice > 0 ? (point.price - firstPrice) / firstPrice : 0,
      }));
    };

    const load = async () => {
      setPriceLoading(true);
      setPriceError(null);
      setPriceSymbolError(null);
      setPriceSeries([]);
      setActivePriceSymbol(null);
      let lastError: string | null = null;

      for (const candidate of candidates) {
        try {
          const series = await fetchSeriesForSymbol(candidate);
          if (!isActive) {
            return;
          }
          if (series.length === 0) {
            continue;
          }
          setActivePriceSymbol(candidate);
          setPriceSeries(series);
          setRangeWindow({
            start: series[0].timestamp,
            end: series[series.length - 1].timestamp,
          });
          setPriceError(null);
          setPriceSymbolError(null);
          setPriceLoading(false);
          return;
        } catch (error) {
          if ((error as Error).name === "AbortError") {
            if (isActive) {
              setPriceLoading(false);
            }
            return;
          }
          lastError = error instanceof Error ? error.message : "Failed to load price history.";
        }
      }

      if (!isActive) {
        return;
      }

      setPriceSeries([]);
      setPriceError(lastError);
      setPriceSymbolError(
        lastError ?? "Aucune donn�e historique disponible pour cet actif sur Binance."
      );
      setPriceLoading(false);
    };

    load();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [range, selectedToken]);

  const chart = useMemo<ChartSlices>(() => {
    if (!selectedToken) {
      return {
        line: [],
        buys: [],
        sells: [],
        hasPriceHistory: false,
      };
    }

    const windowStart = rangeWindow?.start ?? -Infinity;
    const windowEnd = rangeWindow?.end ?? Infinity;
    const line = priceSeries.filter((point) => point.timestamp >= windowStart && point.timestamp <= windowEnd);
    const referencePrice =
      line.length > 0 ? line[line.length - 1].price : selectedToken.averageBuyPrice ?? 0;

    const resolvePrice = (timestamp: number, fallback?: number) => {
      if (line.length === 0) {
        return fallback;
      }
      let closest = line[0];
      let minDiff = Math.abs(line[0].timestamp - timestamp);
      for (let index = 1; index < line.length; index += 1) {
        const candidate = line[index];
        const diff = Math.abs(candidate.timestamp - timestamp);
        if (diff < minDiff) {
          closest = candidate;
          minDiff = diff;
        }
        if (candidate.timestamp > timestamp) {
          break;
        }
      }
      return closest?.price ?? fallback;
    };

    const buys: ChartPoint[] = [];
    const sells: ChartPoint[] = [];

    selectedToken.events.forEach((event) => {
      if (event.timestamp < windowStart || event.timestamp > windowEnd) {
        return;
      }
      const eventPrice =
        (event.type === "BUY" || event.type === "SELL")
          ? event.price ?? resolvePrice(event.timestamp, referencePrice)
          : resolvePrice(event.timestamp, referencePrice);

      if (eventPrice === undefined) {
        return;
      }

      const point: ChartPoint = {
        timestamp: event.timestamp,
        price: eventPrice,
        quantity: event.quantity,
        type: event.type,
        provider: event.provider,
        providerDisplayName: event.providerDisplayName,
      };

      if (event.type === "BUY") {
        buys.push(point);
      } else if (event.type === "SELL") {
        sells.push(point);
      }
    });

    return {
      line,
      buys,
      sells,
      hasPriceHistory: line.length > 0,
    };
  }, [priceSeries, selectedToken, rangeWindow]);

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
                  <TableRow className="sticky top-0 bg-card/95 backdrop-blur hover:bg-card/95">
                    <TableHead className="w-24 text-xs uppercase tracking-wide text-muted-foreground/80">
                      Token
                    </TableHead>
                    <TableHead className="hidden text-right text-xs uppercase tracking-wide text-muted-foreground/80 sm:table-cell">
                      Holdings
                    </TableHead>
                    <TableHead className="hidden text-right text-xs uppercase tracking-wide text-muted-foreground/80 md:table-cell">
                      Bought
                    </TableHead>
                    <TableHead className="hidden text-right text-xs uppercase tracking-wide text-muted-foreground/80 lg:table-cell">
                      Sold
                    </TableHead>
                    <TableHead className="hidden text-right text-xs uppercase tracking-wide text-muted-foreground/80 lg:table-cell">
                      Deposits
                    </TableHead>
                    <TableHead className="hidden text-right text-xs uppercase tracking-wide text-muted-foreground/80 lg:table-cell">
                      Withdrawals
                    </TableHead>
                    <TableHead className="hidden text-right text-xs uppercase tracking-wide text-muted-foreground/80 lg:table-cell">
                      Avg buy
                    </TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground/80">
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
                        <TableCell className="hidden text-right text-sm sm:table-cell">
                          {numberFormatter.format(token.currentQuantity)}
                        </TableCell>
                        <TableCell className="hidden text-right text-sm text-emerald-500 md:table-cell">
                          +{numberFormatter.format(token.buyQuantity)}
                        </TableCell>
                        <TableCell className="hidden text-right text-sm text-red-500 lg:table-cell">
                          -{numberFormatter.format(token.sellQuantity)}
                        </TableCell>
                        <TableCell className="hidden text-right text-sm lg:table-cell">
                          {token.depositQuantity === 0 ? "-" : numberFormatter.format(token.depositQuantity)}
                        </TableCell>
                        <TableCell className="hidden text-right text-sm lg:table-cell">
                          {token.withdrawalQuantity === 0 ? "-" : `-${numberFormatter.format(token.withdrawalQuantity)}`}
                        </TableCell>
                        <TableCell className="hidden text-right text-sm lg:table-cell">
                          {token.averageBuyPrice !== undefined ? numberFormatter.format(token.averageBuyPrice) : "-"}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {netUsd === 0 ? "-" : currencyFormatter.format(netUsd)}
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
                  Pairs tracked:{" "}
                  {selectedToken.tradeSymbols.length > 0
                    ? selectedToken.tradeSymbols.join(", ")
                    : "N/A"}
                  <br />
                  {selectedToken.events.length} events imported � last update{" "}
                  {dateFormatter.format(new Date(selectedToken.lastActivityAt))}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-6">
                <Card className="border-border/60 bg-card/80 backdrop-blur">
                  <CardHeader className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <CardDescription>Price markers</CardDescription>
                        <CardTitle className="text-lg">Trade history</CardTitle>
                      </div>
                      <div className="flex items-center gap-1 rounded-full bg-muted/40 p-1">
                        {(Object.keys(RANGE_CONFIG) as RangeKey[]).map((key) => (
                          <Button
                            key={key}
                            size="sm"
                            variant="ghost"
                            className={cn(
                              "h-8 rounded-full px-3 text-xs font-medium transition",
                              range === key
                                ? "bg-foreground text-background shadow-sm"
                                : "text-muted-foreground hover:bg-background/20"
                            )}
                            onClick={() => setRange(key)}
                          >
                            {RANGE_CONFIG[key].label}
                          </Button>
                        ))}
                      </div>
                    </div>
                    {activePriceSymbol ? (
                      <p className="text-[11px] text-muted-foreground">
                        Source: Binance - {activePriceSymbol}
                      </p>
                    ) : null}
                  </CardHeader>
                  <CardContent className="h-[360px]">
                    {priceLoading ? (
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        <LoaderCircle className="mr-2 size-4 animate-spin" />
                        Loading chart...
                      </div>
                    ) : chart.hasPriceHistory ? (
                      <>
                        {priceSymbolError ?? priceError ? (
                          <p className="mb-2 text-xs text-red-500">
                            {priceSymbolError ?? priceError}
                          </p>
                        ) : null}
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart
                            data={chart.line}
                            margin={{ top: 12, right: 24, bottom: 8, left: 0 }}
                          >
                            <defs>
                              <linearGradient id="tokenPriceGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#C9A646" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="#C9A646" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid
                              stroke="hsl(var(--border))"
                              opacity={0.2}
                              vertical={false}
                              strokeDasharray="4 4"
                            />
                            <XAxis
                              type="number"
                              dataKey="timestamp"
                              scale="time"
                              domain={["dataMin", "dataMax"]}
                              tickLine={false}
                              tickFormatter={(value) =>
                                new Date(value).toLocaleDateString("fr-FR", {
                                  month: "short",
                                  day: "numeric",
                                })
                              }
                              axisLine={false}
                            />
                            <YAxis
                              dataKey="price"
                              domain={([min, max]) => {
                                if (min === undefined || max === undefined) {
                                  const fallback = min ?? max ?? 0;
                                  const pad = Math.max(Math.abs(fallback) * 0.05, 1);
                                  return [fallback - pad, fallback + pad];
                                }
                                const spread = max - min;
                                const padding = spread === 0 ? Math.max(Math.abs(min) * 0.05, 1) : spread * 0.08;
                                return [min - padding, max + padding];
                              }}
                              tickLine={false}
                              axisLine={false}
                              width={72}
                              stroke="hsl(var(--muted-foreground) / 0.8)"
                              tickFormatter={(value) => priceFormatter.format(Number(value))}
                            />
                            <RechartsTooltip
                              cursor={{
                                stroke: "hsl(var(--border))",
                                strokeDasharray: "3 3",
                              }}
                              content={<PriceTooltip />}
                            />
                            <Area
                              type="monotone"
                              dataKey="price"
                              stroke="#C9A646"
                              strokeWidth={2.5}
                              strokeLinecap="round"
                              fill="url(#tokenPriceGradient)"
                              isAnimationActive={false}
                            />
                            <Scatter
                              data={chart.buys}
                              dataKey="price"
                              fill="#22c55e"
                              stroke="#022c16"
                              strokeWidth={1}
                              shape="circle"
                              r={4}
                            />
                            <Scatter
                              data={chart.sells}
                              dataKey="price"
                              fill="#ef4444"
                              stroke="#450a0a"
                              strokeWidth={1}
                              shape="circle"
                              r={4}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                        <span className="text-xs text-red-500">
                          {priceSymbolError ?? priceError ?? "Historical data is unavailable for this asset on Binance."}
                        </span>
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

function PriceTooltip({ active, payload }: ExtendedTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const rawEntry = payload[0];
  const raw = rawEntry?.payload as PricePoint | ChartPoint | undefined;
  if (!raw) {
    return null;
  }
  const timestamp = "timestamp" in raw ? raw.timestamp : Date.now();
  const priceValue =
    "price" in raw ? Number((raw as { price: number }).price) : 0;
  const percentChange =
    "change" in raw ? Number((raw as PricePoint).change) * 100 : undefined;
  const isEvent = (raw as ChartPoint).type !== undefined;

  return (
    <div className="rounded-xl border border-border/70 bg-background/95 px-4 py-3 text-xs shadow-lg">
      <p className="text-sm font-semibold text-foreground">
        {priceFormatter.format(priceValue)}
      </p>
      {percentChange !== undefined ? (
        <p
          className={cn(
            "text-xs font-medium",
            percentChange >= 0 ? "text-emerald-500" : "text-red-500"
          )}
        >
          {percentChange >= 0 ? "+" : ""}
          {percentChange.toFixed(2)}%
        </p>
      ) : null}
      <p className="mt-1 text-[11px] text-muted-foreground">
        {new Date(timestamp).toLocaleString("fr-FR", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
      {isEvent ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {(raw as ChartPoint).type} � Qty{" "}
          {numberFormatter.format((raw as ChartPoint).quantity)}
        </p>
      ) : null}
    </div>
  );
}













