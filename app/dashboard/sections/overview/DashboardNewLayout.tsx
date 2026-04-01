"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { currencyFormatter, type HistoryPoint, type ProfitSummary, type PortfolioToken } from "@/hooks/dashboard/useDashboardMetrics";
import { TrendingDown, TrendingUp } from "lucide-react";

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

  const totalProfit = profitSummary.totalProfitUsd;
  const profitPercent = profitSummary.profitPercentage || 0;
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
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={historySeries}>
                      <defs>
                        <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
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
                      <RechartsTooltip
                        cursor={{ strokeDasharray: "3 3" }}
                        contentStyle={{
                          background: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          color: "hsl(var(--foreground))",
                        }}
                        formatter={(value: number) => currencyFormatter.format(value)}
                      />
                      <Area
                        type="monotone"
                        dataKey="profitUsd"
                        stroke="#10B981"
                        strokeWidth={2}
                        fill="url(#colorGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
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
                <p className="text-sm text-muted-foreground">Montant investi</p>
                <p className="text-2xl font-bold">{currencyFormatter.format(profitSummary.costBasisUsd)}</p>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Montant retiré</p>
                <p className="text-2xl font-bold">$0,00</p>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Performance globale</p>
                <p className={`text-2xl font-bold ${isPositive ? "text-emerald-500" : "text-red-500"}`}>
                  {currencyFormatter.format(totalProfit)}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Frais payés</p>
                <p className="text-2xl font-bold">$0,00</p>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Investisseur depuis</p>
                <p className="text-lg font-semibold">-</p>
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Jeton</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Quantité</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Prix d&apos;achat moyen</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Prix actuel</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">24h</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">7 jours</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Valeur</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolioTokens.map((token) => {
                    const avgBuyPrice = token.averageBuyPrice ?? 0;
                    return (
                      <tr key={token.symbol} className="border-b border-border/20 hover:bg-muted/50 transition-colors">
                        <td className="py-3 px-4 font-medium">{token.symbol}</td>
                        <td className="text-right py-3 px-4 text-muted-foreground">
                          {token.currentQuantity > 0 ? token.currentQuantity.toLocaleString(undefined, { maximumFractionDigits: 6 }) : "-"}
                        </td>
                        <td className="text-right py-3 px-4 text-muted-foreground">
                          {avgBuyPrice > 0 ? `$${avgBuyPrice.toFixed(2)}` : "-"}
                        </td>
                        <td className="text-right py-3 px-4 text-muted-foreground">-</td>
                        <td className="text-right py-3 px-4 text-muted-foreground">-</td>
                        <td className="text-right py-3 px-4 text-muted-foreground">-</td>
                        <td className="text-right py-3 px-4 font-medium">{currencyFormatter.format(token.investedUsd)}</td>
                        <td className={`text-right py-3 px-4 font-medium ${token.netProfitUsd >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                          {currencyFormatter.format(token.netProfitUsd)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {portfolioTokens.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  Aucun jeton pour le moment
                </div>
              )}
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
