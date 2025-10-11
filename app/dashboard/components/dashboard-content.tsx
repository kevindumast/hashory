"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
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
import { useProviderDialog } from "@/components/dashboard/provider-dialog-context";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  FileLock,
  Plug,
  RefreshCw,
  ShieldAlert,
  Zap,
} from "lucide-react";

type DashboardContentProps = {
  userName?: string | null;
};

type IntegrationRecord = {
  _id: string;
  provider: string;
  displayName?: string;
  readOnly: boolean;
  scopes: string[];
  createdAt: number;
  updatedAt: number;
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
  { date: "Jun 10", nav: 21.2 },
  { date: "Jun 14", nav: 21.9 },
  { date: "Jun 18", nav: 22.4 },
  { date: "Jun 22", nav: 22.1 },
  { date: "Jun 26", nav: 22.8 },
  { date: "Jun 30", nav: 23.2 },
  { date: "Jul 4", nav: 23.6 },
  { date: "Jul 8", nav: 24.1 },
  { date: "Jul 12", nav: 24.5 },
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
    description: "Trigger delta-neutral hedge when spread variance > 2.5 sigma.",
  },
  {
    name: "Stablecoin buffer",
    status: "Active",
    description: "Maintain 15% minimum allocation to USD stablecoins.",
  },
  {
    name: "SOL trailing stop",
    status: "Paused",
    description: "Dynamic stop-loss based on 14 day ATR.",
  },
];

const riskAlerts = [
  {
    title: "Funding rate spike detected on BTC perpetuals",
    severity: "high",
    timestamp: "12 min ago",
  },
  {
    title: "Delegated wallet signed a high-value transaction",
    severity: "medium",
    timestamp: "27 min ago",
  },
  {
    title: "Compliance check required for new client wallet",
    severity: "low",
    timestamp: "1 hour ago",
  },
];

const providerMeta: Record<
  string,
  {
    label: string;
    type: string;
  }
> = {
  binance: {
    label: "Binance",
    type: "Exchange API",
  },
};

export function DashboardContent({ userName }: DashboardContentProps) {
  const formattedUser = userName ?? "Gestionnaire";
  const performanceDelta = useMemo(() => navPerformance.at(-1)!.nav - navPerformance[0]!.nav, []);
  const integrations = useQuery(api.integrations.list);
  const { openDialog } = useProviderDialog();

  const integrationsList = integrations ?? [];
  const integrationsCount = integrationsList.length;

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
            Mise a jour {new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })}
          </Badge>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {formattedUser}, votre cockpit consolide pour suivre la performance, le risque et l allocation des actifs
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
          <TabsTrigger value="integrations" className="rounded-full px-4 py-2 text-sm">
            Integrations
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
                    {metric.trend === "positive" ? (
                      <ArrowUpRight className="size-3" />
                    ) : (
                      <ArrowDownRight className="size-3" />
                    )}
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
                  <CardDescription>Courbe NAV consolidee</CardDescription>
                  <CardTitle className="text-3xl text-foreground">${navPerformance.at(-1)?.nav.toFixed(1)}M</CardTitle>
                </div>
                <Badge variant="outline" className="gap-1 rounded-full border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
                  <ArrowUpRight className="size-3" />
                  {performanceDelta.toFixed(1)}% sur 30j
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
                  Baseline: 17.3M • Volatilite annualisee: <strong>18%</strong>
                </span>
                <span>Correlation BTC: <strong>0.72</strong></span>
              </CardFooter>
            </Card>

            <Card className="border-border/60 bg-card/80 backdrop-blur">
              <CardHeader>
                <CardDescription>Repartition des actifs</CardDescription>
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
                <CardDescription>Operations recentes</CardDescription>
                <CardTitle className="text-lg">Flux executes sur Binance</CardTitle>
              </CardHeader>
              <CardContent className="overflow-hidden rounded-xl border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Heure</TableHead>
                      <TableHead>Instrument</TableHead>
                      <TableHead>Cote</TableHead>
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
                  Voir tout l historique
                </Button>
              </CardFooter>
            </Card>

            <Card className="border-border/60 bg-card/80 backdrop-blur" id="automation">
              <CardHeader>
                <CardDescription>Automations IA</CardDescription>
                <CardTitle className="text-lg">Regles critiques</CardTitle>
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
                        rule.status === "Active"
                          ? "border-emerald-500/30 text-emerald-500"
                          : "border-muted text-muted-foreground"
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

        <TabsContent value="analytics" className="space-y-6" id="analytics">
          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <AnalyticsStat label="Beta vs BTC" value="0.62" trend="+0.04" />
            <AnalyticsStat label="Sortino Ratio" value="1.72" trend="+0.12" />
            <AnalyticsStat label="Max Drawdown" value="-8.4%" trend="-0.6%" negative />
            <AnalyticsStat label="Win Rate" value="64%" trend="+3.2%" />
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <Card className="border-border/60 bg-card/80 backdrop-blur">
              <CardHeader>
                <CardDescription>Alertes et conformite</CardDescription>
                <CardTitle className="text-lg">Radar temps reel</CardTitle>
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

            <Card className="border-border/60 bg-card/80 backdrop-blur">
              <CardHeader>
                <CardDescription>Pipeline IA</CardDescription>
                <CardTitle className="text-lg">Recommandations generees</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ScrollArea className="h-full pr-4">
                  <div className="space-y-4">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div key={index} className="rounded-xl border border-border/50 bg-background/60 p-4">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            IA Oracly • {index % 2 === 0 ? "Reallocation" : "Risque"} • Ticket #{1124 + index}
                          </span>
                          <Badge variant="outline" className="border-primary/30 text-primary">
                            <Zap className="mr-1 size-3" />
                            {index % 2 === 0 ? "Action" : "Alerte"}
                          </Badge>
                        </div>
                        <p className="mt-3 text-sm text-foreground">
                          {index % 2 === 0
                            ? "Reduire de 4% l exposition BTC et augmenter SOL pour optimiser la correlation au benchmark."
                            : "Augmenter le buffer stablecoins de 2.5% pour reduire le risque de liquidite court terme."}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6" id="integrations">
          <section className="grid gap-5 lg:grid-cols-[2fr,1fr]">
            <Card className="border-border/60 bg-card/80 backdrop-blur">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardDescription>Connexion des plateformes</CardDescription>
                  <CardTitle className="text-lg">Providers actifs</CardTitle>
                </div>
                <Button size="sm" className="inline-flex items-center gap-2" onClick={openDialog}>
                  <Plug className="size-4" />
                  Connecter une plateforme
                </Button>
              </CardHeader>
              <CardContent className="rounded-xl border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Lecture seule</TableHead>
                      <TableHead>Scopes</TableHead>
                      <TableHead>Date d ajout</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {integrationsCount === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                          Aucune connexion active pour le moment. Cliquez sur &quot;Connecter une plateforme&quot; pour commencer.
                        </TableCell>
                      </TableRow>
                    ) : (
                      integrationsList.map((integration: IntegrationRecord) => {
                        const meta = providerMeta[integration.provider] ?? {
                          label: integration.provider,
                          type: "Custom",
                        };
                        return (
                          <TableRow key={integration._id} className="text-sm">
                            <TableCell className="font-medium text-foreground">
                              {integration.displayName ?? meta.label}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{meta.type}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-full px-3 py-1 text-xs font-semibold",
                                  integration.readOnly
                                    ? "border-emerald-500/30 text-emerald-500"
                                    : "border-amber-500/30 text-amber-500"
                                )}
                              >
                                {integration.readOnly ? "Oui" : "Partiel"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {integration.scopes.length > 0 ? integration.scopes.join(", ") : "Lecture seule"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Date(integration.createdAt).toLocaleDateString("fr-FR")}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
              {integrationsCount > 0 ? (
                <CardFooter className="flex items-center justify-end text-xs text-muted-foreground">
                  Derniere mise a jour: {new Date(integrationsList[0].updatedAt).toLocaleString("fr-FR")}
                </CardFooter>
              ) : null}
            </Card>

            <Card className="border-border/60 bg-card/80 backdrop-blur">
              <CardHeader>
                <CardDescription>Bonnes pratiques</CardDescription>
                <CardTitle className="text-lg">Stockage des secrets</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3 text-primary">
                  <FileLock className="size-4" />
                  <span>Vos cles sont chiffreess avec ORACLY_ENCRYPTION_KEY avant stockage dans Convex.</span>
                </div>
                <ul className="list-disc space-y-2 pl-5">
                  <li>Limitez les permissions au strict necessaire (lecture seule pour Binance).</li>
                  <li>Revoquez les clees directement depuis l exchange si un doute survient.</li>
                  <li>Planifiez une rotation periodique des clees pour rester conforme RGPD.</li>
                  <li>
                    Conservez les secrets dans un coffre interne; Oracly ne les affiche jamais en clair apres la saisie.
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <Button variant="ghost" className="text-xs" onClick={openDialog}>
                  Ajouter une nouvelle connexion
                </Button>
              </CardFooter>
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
