"use client";

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
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { currencyFormatter } from "@/hooks/dashboard/useDashboardMetrics";
import type { OverviewCard } from "@/hooks/dashboard/useDashboardMetrics";

type AllocationEntry = {
  symbol: string;
  share: number;
  value: number;
};

type OverviewTabProps = {
  cards: OverviewCard[];
  navSeries: { date: string; nav: number }[];
  allocation: AllocationEntry[];
  totalVolume: number;
  onOpenIntegrations: () => void;
};

export function OverviewTab({
  cards,
  navSeries,
  allocation,
  totalVolume,
  onOpenIntegrations,
}: OverviewTabProps) {
  return (
    <>
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label} className="border-border/60 bg-card/80 backdrop-blur">
            <CardHeader className="space-y-1 pb-2">
              <CardDescription className="text-[13px] uppercase tracking-[0.35em] text-muted-foreground/80">
                {card.label}
              </CardDescription>
              <CardTitle className="text-2xl text-foreground">{card.value}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">{card.description}</CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <Card className="border-border/60 bg-card/80 backdrop-blur lg:col-span-2">
          <CardHeader>
            <CardDescription>Cumulative volume</CardDescription>
            <CardTitle className="text-3xl text-foreground">{currencyFormatter.format(totalVolume || 0)}</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {navSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={navSeries}>
                  <defs>
                    <linearGradient id="overviewNavGradient" x1="0" y1="0" x2="0" y2="1">
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
                  <Area type="monotone" dataKey="nav" stroke="#C9A646" strokeWidth={3} fill="url(#overviewNavGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Import transactions to display the cumulative chart.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardDescription>Asset allocation</CardDescription>
            <CardTitle className="text-lg">Volume per symbol</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {allocation.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No transactions yet. Run a sync to populate the allocation chart.
              </p>
            ) : (
              allocation.slice(0, 5).map((item) => (
                <div key={item.symbol} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{item.symbol}</span>
                    <span className="text-muted-foreground">{item.share.toFixed(1)}%</span>
                  </div>
                  <Progress value={item.share} aria-valuenow={item.share} />
                  <span className="text-xs text-muted-foreground">
                    {currencyFormatter.format(item.value)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
          <CardFooter>
            <Button variant="ghost" className="text-xs" onClick={onOpenIntegrations}>
              Add provider
            </Button>
          </CardFooter>
        </Card>
      </section>
    </>
  );
}
