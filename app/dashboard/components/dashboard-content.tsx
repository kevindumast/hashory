"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, CalendarDays, RefreshCw, ShieldAlert, Zap } from "lucide-react";

type DashboardContentProps = {
  userName?: string | null;
};

const overviewMetrics = [
  {
    label: "Total AUM",
    value: "$24.5M",
    change: "+3.4%",
    trend: "positive" as const,
    description: "30d performance, net of fees",
  },
  {
    label: "Realized P&L",
    value: "+$1.78M",
    change: "+12.1%",
    trend: "positive" as const,
    description: "Across 48 mandates",
  },
  {
    label: "VaR (95%)",
    value: "-$320K",
    change: "-1.2%",
    trend: "negative" as const,
    description: "Daily Value at Risk",
  },
  {
    label: "Sharpe Ratio",
    value: "1.24",
    change: "+0.08",
    trend: "positive" as const,
    description: "Trailing 30 days",
  },
];

const navPerformance = [
  { date: "Juin 10", nav: 21.2 },
  { date: "Juin 14", nav: 21.9 },
  { date: "Juin 18", nav: 22.4 },
  { date: "Juin 22", nav: 22.1 },
  { date: "Juin 26", nav: 22.8 },
  { date: "Juin 30", nav: 23.2 },
  { date: "Juil 4", nav: 23.6 },
  { date: "Juil 8", nav: 24.1 },
  { date: "Juil 12", nav: 24.5 },
];

const allocationBreakdown = [
  { asset: "BTC", share: 38, change: "+2.1%" },
  { asset: "ETH", share: 26, change: "+1.3%" },
  { asset: "SOL", share: 12, change: "-0.6%" },
  { asset: "DeFi Index", share: 8, change: "+0.4%" },
  { asset: "Stablecoins", share: 16, change: "-0.8%" },
];

const recentTrades = [
  {
    time: "09:42",
    asset: "BTCUSDT",
    side: "Buy",
    size: "38.5 BTC",
    price: "$58,420",
    pnl: "+$182,650",
  },
  {
    time: "08:15",
    asset: "SOLUSDT",
    side: "Sell",
    size: "12,400 SOL",
    price: "$163.4",
    pnl: "+$42,910",
  },
  {
    time: "07:58",
    asset: "ETHUSDT",
    side: "Buy",
    size: "1,200 ETH",
    price: "$3,412",
    pnl: "-$16,840",
  },
  {
    time: "07:05",
    asset: "ARBUSDT",
    side: "Sell",
    size: "48,000 ARB",
    price: "$1.24",
    pnl: "+$9,310",
  },
];

const automationRules = [
  {
    name: "Rebalance BTC/ETH spread",
    status: "Active",
    description: "Trigger delta-neutral hedge when spread variance > 2.5σ",
  },
  {
    name: "Stablecoin buffer",
    status: "Active",
    description: "Maintain 15% minimum allocation to USD stablecoins",
  },
  {
    name: "SOL trailing stop",
    status: "Paused",
    description: "Dynamic stop-loss based on 14d ATR",
  },
];

const riskAlerts = [
  {
    title: "Funding rate spike detected on BTC perpetuals",
    severity: "high",
    timestamp: "Il y a 12 min",
  },
  {
    title: "Delegated wallet signed a high-value transaction",
    severity: "medium",
    timestamp: "Il y a 27 min",
  },
  {
    title: "Compliance check required for new client wallet",
    severity: "low",
    timestamp: "Il y a 1 h",
  },
];

export function DashboardContent({ userName }: DashboardContentProps) {
  const formattedUser = userName ? `${userName}` : "Gestionnaire";
  const performanceDelta = useMemo(() => navPerformance.at(-1)!.nav - navPerformance[0]!.nav, []);

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Welcome back</p>
            <h1 className="mt-2 text-3xl font-semibold text-foreground lg:text-4xl">Pilotage du portefeuille</h1>
          </div>
          <Badge variant="outline" className="gap-2 rounded-full border-primary/40 bg-primary/10 px-3 py-1 text-xs">
            <CalendarDays className="size-3" />
            Mise à jour {new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })}
          </Badge>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {formattedUser}, votre cockpit consolidé pour suivre la performance, le risque et l’allocation des actifs
          crypto de vos clients.
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="justify-start rounded-full bg-muted/60 p-1">
          <TabsTrigger value="overview" className="rounded-full px-4 py-2 text-sm">
            Overview
          </TabsTrigger>
          <TabsTrigger value="analytics" className="rounded-full px-4 py-2 text-sm">
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {overviewMetrics.map((metric) => (
              <Card key={metric.label} className="border-border/60 bg-card/80 backdrop-blur">
                <CardHeader className="space-y-1 pb-2">
                  <CardDescription className="text-[13px] uppercase tracking-[0.35em] text-muted-foreground/80">
                    {metric.label}
                  </CardDescription>
                  <CardTitle className="text-2xl text-foreground">{metric.value}</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between text-xs text-muted-foreground">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold",
                      metric.trend === "positive"
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-red-500/10 text-red-500"
                    )}
                  >
                    {metric.trend === "positive" ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                    {metric.change}
                  </span>
                  <span>{metric.description}</span>
                </CardContent>
              </Card>
            ))}
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <Card className="border-border/60 bg-card/80 backdrop-blur lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardDescription>Courbe NAV consolidée</CardDescription>
                  <CardTitle className="text-3xl text-foreground">${navPerformance.at(-1)?.nav.toFixed(1)}M</CardTitle>
                </div>
                <Badge variant="outline" className="gap-1 rounded-full border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
                  <ArrowUpRight className="size-3" />
                  {performanceDelta.toFixed(1)}% depuis 30j
                </Badge>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={navPerformance}>
                    <defs>
                      <linearGradient id="navGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#C9A646" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#C9A646" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} width={48} />
                    <RechartsTooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      contentStyle={{
                        background: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "12px",
                        color: "hsl(var(--foreground))",
                      }}
                    />
                    <Area type="monotone" dataKey="nav" stroke="#C9A646" strokeWidth={3} fill="url(#navGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
              <CardFooter className="justify-between text-xs text-muted-foreground">
                <span>
                  Baseline: 17.3M &nbsp;•&nbsp; Volatilité annualisée: <strong>18%</strong>
                </span>
                <span>Corrélation BTC: <strong>0.72</strong></span>
              </CardFooter>
            </Card>

            <Card className="border-border/60 bg-card/80 backdrop-blur">
              <CardHeader>
                <CardDescription>Répartition des actifs</CardDescription>
                <CardTitle className="text-lg">Allocation cible vs actuelle</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {allocationBreakdown.map((item) => (
                  <div key={item.asset} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">{item.asset}</span>
                      <span className="text-muted-foreground">{item.share}%</span>
                    </div>
                    <Progress value={item.share} aria-valuenow={item.share} />
                    <span
                      className={cn(
                        "text-xs font-medium",
                        item.change.startsWith("+") ? "text-emerald-500" : "text-red-500"
                      )}
                    >
                      {item.change} vs cible
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <Card className="border-border/60 bg-card/80 backdrop-blur lg:col-span-2" id="alerts">
              <CardHeader>
                <CardDescription>Opérations récentes</CardDescription>
                <CardTitle className="text-lg">Flux exécutés sur Binance</CardTitle>
              </CardHeader>
              <CardContent className="overflow-hidden rounded-xl border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Heure</TableHead>
                      <TableHead>Instrument</TableHead>
                      <TableHead>Côté</TableHead>
                      <TableHead>Taille</TableHead>
                      <TableHead>Prix</TableHead>
                      <TableHead className="text-right">P&L</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentTrades.map((trade) => (
                      <TableRow key={`${trade.asset}-${trade.time}`} className="text-sm">
                        <TableCell>{trade.time}</TableCell>
                        <TableCell className="font-medium">{trade.asset}</TableCell>
                        <TableCell>
                          <Badge
                            variant={trade.side === "Buy" ? "outline" : "secondary"}
                            className={cn(
                              "rounded-full px-3 py-1 text-xs font-semibold",
                              trade.side === "Buy" ? "text-emerald-500 border-emerald-500/30" : "text-red-500"
                            )}
                          >
                            {trade.side}
                          </Badge>
                        </TableCell>
                        <TableCell>{trade.size}</TableCell>
                        <TableCell>{trade.price}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-semibold",
                            trade.pnl.startsWith("+") ? "text-emerald-500" : "text-red-500"
                          )}
                        >
                          {trade.pnl}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
              <CardFooter className="justify-between text-xs text-muted-foreground">
                <div className="inline-flex items-center gap-2">
                  <RefreshCw className="size-3" />
                  Synchronisation auto toutes les 90 secondes via Convex
                </div>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
                  Voir tout l’historique
                </Button>
              </CardFooter>
            </Card>

            <Card className="border-border/60 bg-card/80 backdrop-blur">
              <CardHeader>
                <CardDescription>Automations IA</CardDescription>
                <CardTitle className="text-lg">Règles critiques</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {automationRules.map((rule) => (
                  <div key={rule.name} className="space-y-2 rounded-xl border border-border/50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">{rule.name}</p>
                      <Switch defaultChecked={rule.status === "Active"} disabled={rule.status !== "Active"} />
                    </div>
                    <p className="text-xs text-muted-foreground">{rule.description}</p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "w-fit rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider",
                        rule.status === "Active" ? "border-emerald-500/30 text-emerald-500" : "border-muted text-muted-foreground"
                      )}
                    >
                      {rule.status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <AnalyticsStat label="Beta vs BTC" value="0.62" trend="+0.04" />
            <AnalyticsStat label="Sortino Ratio" value="1.72" trend="+0.12" />
            <AnalyticsStat label="Max Drawdown" value="-8.4%" trend="-0.6%" negative />
            <AnalyticsStat label="Win Rate" value="64%" trend="+3.2%" />
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <Card className="border-border/60 bg-card/80 backdrop-blur">
              <CardHeader>
                <CardDescription>Alertes & conformité</CardDescription>
                <CardTitle className="text-lg">Radar temps réel</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {riskAlerts.map((alert) => (
                  <div
                    key={alert.title}
                    className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/70 p-4"
                  >
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-full border text-sm font-semibold",
                        alert.severity === "high" && "border-red-500/40 text-red-500",
                        alert.severity === "medium" && "border-amber-500/40 text-amber-500",
                        alert.severity === "low" && "border-emerald-500/40 text-emerald-500"
                      )}
                    >
                      <ShieldAlert className="size-4" />
                    </span>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">{alert.title}</p>
                      <p className="text-xs text-muted-foreground">{alert.timestamp}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/80 backdrop-blur" id="analytics">
              <CardHeader>
                <CardDescription>Pipeline IA</CardDescription>
                <CardTitle className="text-lg">Recommandations générées</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ScrollArea className="h-full pr-4">
                  <div className="space-y-4">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div key={index} className="rounded-xl border border-border/50 bg-background/60 p-4">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            IA Oracly • {index % 2 === 0 ? "Réallocation" : "Risque"} • Ticket #{1124 + index}
                          </span>
                          <Badge variant="outline" className="border-primary/30 text-primary">
                            <Zap className="mr-1 size-3" />
                            {index % 2 === 0 ? "Action" : "Alerte"}
                          </Badge>
                        </div>
                        <p className="mt-3 text-sm text-foreground">
                          {index % 2 === 0
                            ? "Réduire de 4% l’exposition BTC et augmenter SOL pour optimiser la corrélation au benchmark."
                            : "Augmenter le buffer stablecoins de 2.5% pour réduire le risque de liquidité court terme."}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

type AnalyticsStatProps = {
  label: string;
  value: string;
  trend: string;
  negative?: boolean;
};

function AnalyticsStat({ label, value, trend, negative = false }: AnalyticsStatProps) {
  return (
    <Card className="border-border/60 bg-card/80 backdrop-blur">
      <CardHeader className="space-y-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl text-foreground">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <Badge
          variant="outline"
          className={cn(
            "gap-1 rounded-full border px-2 py-1 text-xs font-semibold",
            negative ? "border-red-500/30 text-red-500" : "border-emerald-500/30 text-emerald-500"
          )}
        >
          {negative ? <ArrowDownRight className="size-3" /> : <ArrowUpRight className="size-3" />}
          {trend}
        </Badge>
      </CardContent>
    </Card>
  );
}
