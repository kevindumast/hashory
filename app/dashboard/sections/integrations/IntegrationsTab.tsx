"use client";

import { useMemo, useState } from "react";
import { useAction } from "convex/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoaderCircle, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IntegrationRecord } from "@/hooks/dashboard/useIntegrations";
import { api } from "@/convex/_generated/api";
import { dateFormatter } from "@/hooks/dashboard/useDashboardMetrics";

type IntegrationsTabProps = {
  integrations: IntegrationRecord[];
  onOpenDialog: () => void;
  onRefresh: () => void;
};

export function IntegrationsTab({ integrations, onOpenDialog, onRefresh }: IntegrationsTabProps) {
  const binanceIntegrations = useMemo(
    () => integrations.filter((integration) => integration.provider === "binance"),
    [integrations]
  );

  return (
    <section className="grid gap-5 lg:grid-cols-[2fr,1fr]">
      <Card className="border-border/60 bg-card/80 backdrop-blur">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardDescription>Connected platforms</CardDescription>
            <CardTitle className="text-lg">Active providers</CardTitle>
          </div>
          <Button size="sm" className="inline-flex items-center gap-2" onClick={onOpenDialog}>
            <Plug className="size-4" />
            Add provider
          </Button>
        </CardHeader>
        <CardContent className="rounded-xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Read only</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Linked on</TableHead>
                <TableHead>Account created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {integrations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No provider connected yet.
                  </TableCell>
                </TableRow>
              ) : (
                integrations.map((integration) => (
                  <TableRow key={integration._id} className="text-sm">
                    <TableCell className="font-medium text-foreground">
                      {integration.displayName ?? integration.provider}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {integration.provider === "binance" ? "Exchange" : integration.provider}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-semibold",
                          integration.readOnly ? "border-emerald-500/30 text-emerald-500" : "border-amber-500/30 text-amber-500"
                        )}
                      >
                        {integration.readOnly ? "Yes" : "Partial"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {integration.scopes?.length ? integration.scopes.join(", ") : "Read only"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {dateFormatter.format(new Date(integration.createdAt))}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {integration.accountCreatedAt
                        ? dateFormatter.format(new Date(integration.accountCreatedAt))
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
        {integrations.length > 0 ? (
          <CardFooter className="flex items-center justify-end text-xs text-muted-foreground">
            Last update: {dateFormatter.format(new Date(integrations[0].updatedAt))}
          </CardFooter>
        ) : null}
      </Card>

      <Card className="border-border/60 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardDescription>Security</CardDescription>
          <CardTitle className="text-lg">Secret handling</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Credentials are encrypted with ORACLY_ENCRYPTION_KEY before storage in Convex.</p>
          <p>Grant read-only access on Binance and other exchanges.</p>
          <p>Revoke API keys directly on the provider if you suspect an issue.</p>
          <p>Upcoming features: automation rules, risk alerts and rebalancing.</p>
        </CardContent>
      </Card>

      {binanceIntegrations.length > 0 ? (
        <Card className="border-border/60 bg-card/80 backdrop-blur lg:col-span-2">
          <CardHeader>
            <CardDescription>Manual sync</CardDescription>
            <CardTitle className="text-lg">Import Binance spot trades</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {binanceIntegrations.map((integration) => (
              <BinanceSyncCard key={integration._id} integration={integration} onSuccess={onRefresh} />
            ))}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}

type BinanceSyncCardProps = {
  integration: IntegrationRecord;
  onSuccess: () => void;
};

function BinanceSyncCard({ integration, onSuccess }: BinanceSyncCardProps) {
  const syncAccount = useAction(api.binance.syncAccount);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const result = await syncAccount({
        integrationId: integration._id,
      });
      const processed = Array.isArray(result.symbols) ? result.symbols.length : 0;
      const tradesInserted = result.trades?.inserted ?? 0;
      const tradesFetched = result.trades?.fetched ?? 0;
      const depositInserted = result.deposits?.inserted ?? 0;
      const depositFetched = result.deposits?.fetched ?? 0;
      const withdrawalInserted = result.withdrawals?.inserted ?? 0;
      const withdrawalFetched = result.withdrawals?.fetched ?? 0;
      const summary = [
        `Trades ${tradesInserted} (+${tradesFetched})`,
        `Dépôts ${depositInserted} (+${depositFetched})`,
        `Retraits ${withdrawalInserted} (+${withdrawalFetched})`,
        `${processed} paire${processed === 1 ? "" : "s"}`,
      ].join(" · ");
      setMessage(`Synchronisation complète · ${summary}`);
      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Impossible de synchroniser.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {integration.displayName ?? "Binance"} – {integration.readOnly ? "Read only" : "Extended permissions"}
          </p>
          <p className="text-xs text-muted-foreground">
            Last sync: {integration.lastSyncedAt ? dateFormatter.format(new Date(integration.lastSyncedAt)) : "never"}
          </p>
          <p className="text-xs text-muted-foreground">
            Account created: {integration.accountCreatedAt ? dateFormatter.format(new Date(integration.accountCreatedAt)) : "unknown"}
          </p>
        </div>
        <Button type="button" disabled={loading} onClick={handleSync}>
          {loading ? (
            <span className="flex items-center gap-2">
              <LoaderCircle className="size-4 animate-spin" /> Syncing...
            </span>
          ) : (
            "Synchronise"
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Toutes les paires détectées sur ce compte Binance seront synchronisées automatiquement.
      </p>
      {message ? <p className="text-xs text-emerald-500">{message}</p> : null}
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
