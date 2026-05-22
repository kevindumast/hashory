"use client";

import { useState } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoaderCircle, Plug, RefreshCw, RotateCcw } from "lucide-react";
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
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationRecord | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const syncAccount = useAction(api.binance.syncAccount);
  const resetCursors = useAction(api.resetCursors.resetAllCursors);

  const handleSync = async (integration: IntegrationRecord) => {
    setSyncingId(integration._id);
    setLogs([
      `[${new Date().toLocaleTimeString()}] 🚀 Starting synchronization for ${integration.displayName ?? integration.provider}`,
      `  ℹ️  This will recover ~300 days of history per sync`,
      `  ℹ️  For full history, click "Sync" multiple times`,
      `  ℹ️  Each sync continues from where the last one stopped`,
      ``,
    ]);

    try {
      const result = await syncAccount({
        integrationId: integration._id,
      });

      const hasData =
        (result.convertTrades?.inserted ?? 0) > 0 ||
        (result.fiatOrders?.inserted ?? 0) > 0 ||
        (result.deposits?.inserted ?? 0) > 0 ||
        (result.withdrawals?.inserted ?? 0) > 0;

      const finalLogs = [
        ``,
        `[${new Date().toLocaleTimeString()}] ${hasData ? '✓' : '✅'} Sync completed`,
        `  - Convert trades: ${result.convertTrades?.inserted ?? 0} inserted / ${result.convertTrades?.fetched ?? 0} fetched`,
        `  - Fiat orders: ${result.fiatOrders?.inserted ?? 0} inserted / ${result.fiatOrders?.fetched ?? 0} fetched`,
        `  - Deposits: ${result.deposits?.inserted ?? 0} inserted / ${result.deposits?.fetched ?? 0} fetched`,
        `  - Withdrawals: ${result.withdrawals?.inserted ?? 0} inserted / ${result.withdrawals?.fetched ?? 0} fetched`,
        ``,
        `📊 Spot trades sync: launched in background (this may take a while)`,
      ];

      if (hasData) {
        finalLogs.push(``);
        finalLogs.push(`  💡 More history available - Click "Sync" again to continue`);
      } else {
        finalLogs.push(``);
        finalLogs.push(`  ✅ Fast syncs completed - Check back for spot trades results`);
      }

      setLogs((prev) => [...prev, ...finalLogs]);
      onRefresh();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setLogs((prev) => [...prev, ``, `[${new Date().toLocaleTimeString()}] ✗ Error: ${errorMsg}`]);
    } finally {
      setSyncingId(null);
    }
  };

  const handleResetRequest = (integration: IntegrationRecord) => {
    setSelectedIntegration(integration);
    setShowResetConfirm(true);
  };

  const handleResetConfirm = async () => {
    if (!selectedIntegration) return;

    setResettingId(selectedIntegration._id);
    setShowResetConfirm(false);
    setLogs([`[${new Date().toLocaleTimeString()}] Resetting cursors for ${selectedIntegration.displayName ?? selectedIntegration.provider}...`]);

    try {
      await resetCursors({
        integrationId: selectedIntegration._id,
      });

      const newLogs = [
        `[${new Date().toLocaleTimeString()}] ✓ Cursors reset successfully`,
        `  - All sync cursors have been reset`,
        `  - Next sync will reimport all historical data`,
      ];
      setLogs((prev) => [...prev, ...newLogs]);
      onRefresh();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ✗ Error: ${errorMsg}`]);
    } finally {
      setResettingId(null);
      setSelectedIntegration(null);
    }
  };

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
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {integrations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
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
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={syncingId === integration._id || resettingId === integration._id}
                          onClick={() => handleSync(integration)}
                          className="h-8 gap-2"
                        >
                          {syncingId === integration._id ? (
                            <>
                              <LoaderCircle className="size-3 animate-spin" />
                              Syncing...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="size-3" />
                              Sync
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={syncingId === integration._id || resettingId === integration._id}
                          onClick={() => handleResetRequest(integration)}
                          className="h-8 gap-2 text-muted-foreground hover:text-destructive"
                          title="Reset sync cursors"
                        >
                          <RotateCcw className="size-3" />
                        </Button>
                      </div>
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
          <CardDescription>Synchronization</CardDescription>
          <CardTitle className="text-lg flex items-center gap-2">
            <RefreshCw className={cn("size-4", (syncingId || resettingId) && "animate-spin")} />
            Activity Logs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {logs.length > 0 ? (
            <ScrollArea className="h-[300px] rounded-md border border-border/60 bg-muted/30 p-3">
              <div className="space-y-1 font-mono text-xs">
                {logs.map((log, index) => (
                  <div
                    key={index}
                    className={cn(
                      "whitespace-pre-wrap",
                      log.includes("✓") && "text-emerald-500",
                      log.includes("✗") && "text-red-500",
                      log.includes("🚀") && "text-blue-500 font-semibold",
                      log.includes("✅") && "text-emerald-500 font-semibold",
                      log.includes("ℹ️") && "text-cyan-500",
                      log.includes("💡") && "text-amber-500 font-semibold",
                      log.includes("✓") && !log.includes("✅") && "text-emerald-500",
                      log.includes("Starting") && !log.includes("🚀") && "text-blue-500 font-semibold",
                      log.includes("Resetting") && "text-amber-500 font-semibold"
                    )}
                  >
                    {log}
                  </div>
                ))}
                {syncingId && (
                  <div className="flex items-center gap-2 text-blue-500 mt-2 font-semibold">
                    <LoaderCircle className="size-3 animate-spin" />
                    Synchronizing... This may take a few minutes
                  </div>
                )}
                {resettingId && (
                  <div className="flex items-center gap-2 text-muted-foreground mt-2">
                    <LoaderCircle className="size-3 animate-spin" />
                    Resetting cursors...
                  </div>
                )}
              </div>
            </ScrollArea>
          ) : (
            <div className="rounded-md border border-border/60 bg-muted/30 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No activity yet. Click &quot;Sync&quot; to start synchronizing data.
              </p>
            </div>
          )}
          <div className="space-y-2 text-xs text-muted-foreground pt-2 border-t border-border/60">
            <p className="font-semibold text-foreground">Security:</p>
            <p>• Credentials encrypted with ORACLY_ENCRYPTION_KEY before storage</p>
            <p>• Grant read-only access on exchanges</p>
            <p>• Revoke API keys directly on provider if suspicious activity</p>
          </div>
        </CardContent>
      </Card>

      {/* Reset Confirmation Modal */}
      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="size-4 text-destructive" />
              Reset Sync Cursors
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to reset all sync cursors for{" "}
              <span className="font-semibold text-foreground">
                {selectedIntegration?.displayName ?? selectedIntegration?.provider}
              </span>
              ?
            </p>
            <p className="text-sm text-amber-600 dark:text-amber-500">
              ⚠️ This will cause the next synchronization to reimport all historical data from the beginning.
            </p>
            <p className="text-xs text-muted-foreground">
              Use this if you&apos;re experiencing sync issues or want to force a complete re-import.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowResetConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleResetConfirm}>
              Reset Cursors
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

