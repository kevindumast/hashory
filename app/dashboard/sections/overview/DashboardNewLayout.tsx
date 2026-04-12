"use client";

import { useState, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { currencyFormatter, type HistoryPoint, type ProfitSummary, type PortfolioToken } from "@/hooks/dashboard/useDashboardMetrics";
import { useCurrentPrices } from "@/hooks/useCurrentPrices";
import { TrendingDown, TrendingUp, LoaderCircle, RefreshCw } from "lucide-react";

type DashboardNewLayoutProps = {
  profitSummary: ProfitSummary;
  historySeries: HistoryPoint[];
  portfolioTokens: PortfolioToken[];
  onOpenIntegrations: () => void;
};

export function DashboardNewLayout({
  profitSummary,
  historySeries,
  portfolioTokens,
  onOpenIntegrations,
}: DashboardNewLayoutProps) {
  const [activeTab, setActiveTab] = useState<"jetons" | "plateformes" | "protocoles" | "dettes">("jetons");
  const [sortColumn, setSortColumn] = useState<"symbol" | "qty" | "avgPrice" | "current" | "value" | "pnlTotal" | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [hideZeroBalance, setHideZeroBalance] = useState(false);
  const { currentPrices, loading: pricesLoading, error: pricesError, refresh: refreshPrices } = useCurrentPrices(portfolioTokens);

  // Filtrer les tokens avec quantité 0 ou quasi-0 (< 0.00001)
  const filteredTokens = useMemo(() => {
    if (!hideZeroBalance) {
      return portfolioTokens;
    }
    // Considérer les quantités <= 0.00001 comme 0
    return portfolioTokens.filter(t => t.currentQuantity > 0.00001);
  }, [portfolioTokens, hideZeroBalance]);

  // PnL total basé sur les prix actuels
  const totalCurrentValue = useMemo(() =>
    portfolioTokens.reduce((sum, token) => {
      const price = currentPrices[token.symbol];
      if (price && token.currentQuantity > 0) {
        return sum + price * token.currentQuantity;
      }
      return sum;
    }, 0),
    [portfolioTokens, currentPrices]
  );

  // Coût total AVCO : somme de (avgCostBasis × quantité détenue) pour chaque token
  const totalCostBasis = useMemo(() =>
    portfolioTokens.reduce((sum, token) =>
      sum + token.avgCostBasis * token.currentQuantity, 0),
    [portfolioTokens]
  );

  // PnL réalisé total (AVCO)
  const totalRealizedPnl = useMemo(() =>
    portfolioTokens.reduce((sum, token) => sum + token.realizedPnlAvco, 0),
    [portfolioTokens]
  );

  const hasCurrentPrices = Object.keys(currentPrices).length > 0;

  const totalProfit = hasCurrentPrices
    ? totalCurrentValue - totalCostBasis + totalRealizedPnl
    : profitSummary.totalProfitUsd;
  const profitPercent = totalCostBasis > 0
    ? ((totalProfit / totalCostBasis) * 100)
    : profitSummary.profitPercentage || 0;
  const isPositive = totalProfit >= 0;

  return (
    <div className="space-y-6">
      {/* Main Dashboard Card */}
      <Card className="border-border/60 bg-card/80 backdrop-blur">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Side - Main Chart */}
            <div className="lg:col-span-2">
              <div className="mb-6">
                <div className="flex items-end gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Portefeuille total</p>
                    <h2 className="text-4xl font-bold">{currencyFormatter.format(totalProfit)}</h2>
                  </div>
                  <div className={`flex items-center gap-1 pb-2 ${isPositive ? "text-emerald-500" : "text-red-500"}`}>
                    {isPositive ? (
                      <TrendingUp className="w-5 h-5" />
                    ) : (
                      <TrendingDown className="w-5 h-5" />
                    )}
                    <span className="text-lg font-semibold">{profitPercent.toFixed(2)}%</span>
                  </div>
                </div>
              </div>

              {/* Chart */}
              <div className="h-80">
                {historySeries.length > 0 ? (
                  <ChartContainer config={{ profitUsd: { label: "Profit", color: isPositive ? "#10B981" : "#EF4444" } }} className="h-full w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={historySeries}>
                        <defs>
                          <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={isPositive ? "#10B981" : "#EF4444"} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={isPositive ? "#10B981" : "#EF4444"} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
                        <XAxis
                          dataKey="label"
                          stroke="hsl(var(--muted-foreground))"
                          tickLine={false}
                          axisLine={false}
                          style={{ fontSize: "12px" }}
                        />
                        <YAxis
                          stroke="hsl(var(--muted-foreground))"
                          tickLine={false}
                          axisLine={false}
                          width={60}
                          tickFormatter={(value) => currencyFormatter.format(value)}
                          style={{ fontSize: "12px" }}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Area
                          type="monotone"
                          dataKey="profitUsd"
                          stroke={isPositive ? "#10B981" : "#EF4444"}
                          strokeWidth={2}
                          fill="url(#colorGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Import transactions to display the chart.
                  </div>
                )}
              </div>
            </div>

            {/* Right Side - Stats */}
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Coût total investi</p>
                <p className="text-2xl font-bold">{currencyFormatter.format(totalCostBasis)}</p>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Valeur actuelle</p>
                <p className="text-2xl font-bold">
                  {hasCurrentPrices ? currencyFormatter.format(totalCurrentValue) : "-"}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">PnL réalisé</p>
                <p className={`text-2xl font-bold ${totalRealizedPnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {totalRealizedPnl >= 0 ? "+" : ""}{currencyFormatter.format(totalRealizedPnl)}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">PnL latent</p>
                <p className={`text-2xl font-bold ${hasCurrentPrices ? (totalCurrentValue - totalCostBasis >= 0 ? "text-emerald-500" : "text-red-500") : "text-foreground"}`}>
                  {hasCurrentPrices
                    ? `${totalCurrentValue - totalCostBasis >= 0 ? "+" : ""}${currencyFormatter.format(totalCurrentValue - totalCostBasis)}`
                    : "-"}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Performance globale</p>
                <p className={`text-2xl font-bold ${isPositive ? "text-emerald-500" : "text-red-500"}`}>
                  {totalProfit >= 0 ? "+" : ""}{currencyFormatter.format(totalProfit)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs Section */}
      <Card className="border-border/60 bg-card/80 backdrop-blur">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab("jetons")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === "jetons"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Jetons {portfolioTokens.length}
              </button>
              <button
                onClick={() => setActiveTab("plateformes")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === "plateformes"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Plateformes
              </button>
              <button
                onClick={() => setActiveTab("protocoles")}
                disabled
                className="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground/50 cursor-not-allowed"
              >
                Protocoles 🔒
              </button>
              <button
                onClick={() => setActiveTab("dettes")}
                disabled
                className="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground/50 cursor-not-allowed"
              >
                Dettes 🔒
              </button>
            </div>
            <Button
              className="bg-primary hover:bg-primary/90"
              onClick={onOpenIntegrations}
            >
              Ajouter un jeton
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {activeTab === "jetons" && (
            <div className="overflow-x-auto">
              <div className="flex justify-between items-center mb-3 gap-4">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideZeroBalance}
                    onChange={(e) => setHideZeroBalance(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  Masquer les tokens à 0
                </label>
                <div className="flex items-center gap-2">
                  {pricesError && <span className="text-xs text-red-500">{pricesError}</span>}
                  <button
                    onClick={refreshPrices}
                    disabled={pricesLoading}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${pricesLoading ? "animate-spin" : ""}`} />
                    {pricesLoading ? "Chargement..." : "Rafraîchir les prix"}
                  </button>
                </div>
              </div>

              {/* Préparer les données triées et filtrées */}
              {(() => {
                let filtered = filteredTokens;

                // Calculer les valeurs de tri pour chaque token
                const tokensWithValues = filtered.map(token => {
                  const currentPrice = currentPrices[token.symbol];
                  const currentValue = currentPrice && token.currentQuantity > 0
                    ? currentPrice * token.currentQuantity
                    : null;
                  const costOfHoldings = token.avgCostBasis * token.currentQuantity;
                  const unrealizedPnl = currentValue !== null ? currentValue - costOfHoldings : null;
                  const totalPnl = unrealizedPnl !== null ? token.realizedPnlAvco + unrealizedPnl : null;

                  return {
                    token,
                    currentPrice,
                    currentValue,
                    costOfHoldings,
                    unrealizedPnl,
                    totalPnl,
                  };
                });

                // Trier
                const sorted = [...tokensWithValues].sort((a, b) => {
                  let aVal = 0, bVal = 0;
                  if (sortColumn === "symbol") {
                    aVal = a.token.symbol.localeCompare(b.token.symbol);
                    return sortAsc ? aVal : -aVal;
                  } else if (sortColumn === "qty") {
                    aVal = a.token.currentQuantity;
                    bVal = b.token.currentQuantity;
                  } else if (sortColumn === "avgPrice") {
                    aVal = a.token.avgCostBasis;
                    bVal = b.token.avgCostBasis;
                  } else if (sortColumn === "current") {
                    aVal = a.currentPrice ?? 0;
                    bVal = b.currentPrice ?? 0;
                  } else if (sortColumn === "value") {
                    aVal = a.currentValue ?? 0;
                    bVal = b.currentValue ?? 0;
                  } else if (sortColumn === "pnlTotal") {
                    aVal = a.totalPnl ?? 0;
                    bVal = b.totalPnl ?? 0;
                  } else {
                    // Tri par défaut : par valeur décroissante
                    aVal = b.currentValue ?? 0;
                    bVal = a.currentValue ?? 0;
                    return aVal - bVal;
                  }

                  return sortAsc ? aVal - bVal : bVal - aVal;
                });

                return (
                  <>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/40">
                          <th
                            className="text-left py-3 px-4 font-medium text-muted-foreground cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => {
                              if (sortColumn === "symbol") {
                                setSortAsc(!sortAsc);
                              } else {
                                setSortColumn("symbol");
                                setSortAsc(true);
                              }
                            }}
                          >
                            Jeton {sortColumn === "symbol" && (sortAsc ? "↑" : "↓")}
                          </th>
                          <th
                            className="text-right py-3 px-4 font-medium text-muted-foreground cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => {
                              if (sortColumn === "qty") {
                                setSortAsc(!sortAsc);
                              } else {
                                setSortColumn("qty");
                                setSortAsc(true);
                              }
                            }}
                          >
                            Quantité {sortColumn === "qty" && (sortAsc ? "↑" : "↓")}
                          </th>
                          <th
                            className="text-right py-3 px-4 font-medium text-muted-foreground cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => {
                              if (sortColumn === "avgPrice") {
                                setSortAsc(!sortAsc);
                              } else {
                                setSortColumn("avgPrice");
                                setSortAsc(true);
                              }
                            }}
                          >
                            Prix d&apos;achat moyen {sortColumn === "avgPrice" && (sortAsc ? "↑" : "↓")}
                          </th>
                          <th
                            className="text-right py-3 px-4 font-medium text-muted-foreground cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => {
                              if (sortColumn === "current") {
                                setSortAsc(!sortAsc);
                              } else {
                                setSortColumn("current");
                                setSortAsc(true);
                              }
                            }}
                          >
                            <span className="flex items-center justify-end gap-1">
                              Prix actuel {sortColumn === "current" && (sortAsc ? "↑" : "↓")}
                              {pricesLoading && <LoaderCircle className="w-3 h-3 animate-spin" />}
                            </span>
                          </th>
                          <th
                            className="text-right py-3 px-4 font-medium text-muted-foreground cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => {
                              if (sortColumn === "value") {
                                setSortAsc(!sortAsc);
                              } else {
                                setSortColumn("value");
                                setSortAsc(true);
                              }
                            }}
                          >
                            Valeur actuelle {sortColumn === "value" && (sortAsc ? "↑" : "↓")}
                          </th>
                          <th className="text-right py-3 px-4 font-medium text-muted-foreground">PnL réalisé</th>
                          <th className="text-right py-3 px-4 font-medium text-muted-foreground">PnL latent</th>
                          <th
                            className="text-right py-3 px-4 font-medium text-muted-foreground cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => {
                              if (sortColumn === "pnlTotal") {
                                setSortAsc(!sortAsc);
                              } else {
                                setSortColumn("pnlTotal");
                                setSortAsc(true);
                              }
                            }}
                          >
                            PnL total {sortColumn === "pnlTotal" && (sortAsc ? "↑" : "↓")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map(({ token, currentPrice, currentValue, costOfHoldings, unrealizedPnl, totalPnl }) => {
                          const realizedPnl = token.realizedPnlAvco;

                          return (
                            <tr key={token.symbol} className="border-b border-border/20 hover:bg-muted/50 transition-colors">
                              <td className="py-3 px-4 font-semibold">{token.symbol}</td>
                              <td className="text-right py-3 px-4 text-muted-foreground">
                                {token.currentQuantity > 0
                                  ? token.currentQuantity.toLocaleString("fr-FR", { maximumFractionDigits: 6 })
                                  : "-"}
                              </td>
                              <td className="text-right py-3 px-4 text-muted-foreground">
                                {token.avgCostBasis > 0 ? currencyFormatter.format(token.avgCostBasis) : "-"}
                              </td>
                              <td className="text-right py-3 px-4 text-muted-foreground">
                                {currentPrice ? currencyFormatter.format(currentPrice) : "-"}
                              </td>
                              <td className="text-right py-3 px-4 font-medium">
                                {currentValue !== null ? currencyFormatter.format(currentValue) : "-"}
                              </td>
                              <td className={`text-right py-3 px-4 font-medium ${realizedPnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                                {realizedPnl !== 0
                                  ? `${realizedPnl >= 0 ? "+" : ""}${currencyFormatter.format(realizedPnl)}`
                                  : "-"}
                              </td>
                              <td className={`text-right py-3 px-4 font-medium ${unrealizedPnl === null ? "text-muted-foreground" : unrealizedPnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                                {unrealizedPnl !== null
                                  ? `${unrealizedPnl >= 0 ? "+" : ""}${currencyFormatter.format(unrealizedPnl)}`
                                  : "-"}
                              </td>
                              <td className={`text-right py-3 px-4 font-medium ${totalPnl === null ? "text-muted-foreground" : totalPnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                                {totalPnl !== null
                                  ? `${totalPnl >= 0 ? "+" : ""}${currencyFormatter.format(totalPnl)}`
                                  : currencyFormatter.format(realizedPnl)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filtered.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        {hideZeroBalance && portfolioTokens.length > 0 ? "Aucun jeton avec solde" : "Aucun jeton pour le moment"}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {activeTab === "plateformes" && (
            <div className="text-center py-8 text-muted-foreground">
              Onglet Plateformes en développement
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
