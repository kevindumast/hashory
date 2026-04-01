"use client"

import * as React from "react"
import Link from "next/link"
import {
  Search,
  LayoutGrid,
  List as ListIcon,
  MoreVertical,
  Check,
  AlertCircle,
  X,
  ExternalLink,
  Calendar,
  RefreshCw
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { ConnectProviderDialog } from "@/components/dashboard/connect-provider-dialog"
import { useIntegrations } from "@/hooks/dashboard/useIntegrations"
import { useDashboardMetrics } from "@/hooks/dashboard/useDashboardMetrics"
import { useAction } from "convex/react"
import { api } from "@/convex/_generated/api"
import { isConvexConfigured } from "@/convex/client"
import type { Id } from "@/convex/_generated/dataModel"

// Types pour les données
type AccountStatus = "synced" | "error" | "unsupported" | "syncing"

const PROVIDER_ICONS: Record<string, string> = {
  binance: "https://icons.waltio.com/account/BINANCE",
  kucoin: "https://icons.waltio.com/account/KUCOIN",
  ethereum: "https://icons.waltio.com/account/WALLET_ETH",
  bitcoin: "https://icons.waltio.com/account/WALLET_BTC",
  arbitrum: "https://icons.waltio.com/account/WALLET_ARBITRUM",
  solana: "https://icons.waltio.com/account/SOLANA",
  kaspa: "https://icons.waltio.com/account/WALLET_KASPA",
}

const PROVIDER_NAMES: Record<string, string> = {
  binance: "Binance",
  kucoin: "KuCoin",
  ethereum: "Ethereum",
  bitcoin: "Bitcoin",
  arbitrum: "Arbitrum One",
  solana: "Solana",
  kaspa: "Kaspa",
}

export function AccountsView() {
  const [isConnectOpen, setIsConnectOpen] = React.useState(false)
  const [refreshToken, setRefreshToken] = React.useState(0)
  const { integrations, isLoading: integrationsLoading } = useIntegrations()
  const { transactions, isLoading: transactionsLoading } = useDashboardMetrics(refreshToken)
  const resetAllCursors = useAction(api.resetCursors.resetAllCursors)
  const syncAccount = useAction(api.binance.syncAccount)
  const syncFiatOnly = useAction(api.binance.syncFiatOrdersOnly)

  // Calculer les comptes avec les transactions
  const accountsWithTransactions = React.useMemo(() => {
    return integrations.map((integration) => {
      const integrationTransactions = transactions.filter(
        (tx) => tx.integrationId === integration._id
      )
      const lastSync = integration.lastSyncedAt
        ? new Date(integration.lastSyncedAt).toLocaleString("fr-FR")
        : "Jamais"

      const status: AccountStatus = (integration.syncStatus === "syncing"
        ? "syncing"
        : integration.syncStatus === "error"
          ? "error"
          : "synced") as AccountStatus

      return {
        id: integration._id,
        name: PROVIDER_NAMES[integration.provider] || integration.displayName || integration.provider,
        type: "API" as const,
        platformId: integration.provider,
        iconUrl: PROVIDER_ICONS[integration.provider] || "https://icons.waltio.com/account/DEFAULT",
        subAccountsCount: 1,
        addressOrId: integration.displayName || integration.provider,
        transactionCount: integrationTransactions.length,
        lastSync,
        status,
      }
    })
  }, [integrations, transactions])

  const handleRefresh = React.useCallback(() => {
    setRefreshToken((prev) => prev + 1)
  }, [])

  const handleSyncAccount = React.useCallback(async (accountId: Id<"integrations">) => {
    if (!isConvexConfigured) {
      console.error("Convex is not configured")
      return
    }

    try {
      // First reset all cursors to force re-sync from the beginning
      await resetAllCursors({ integrationId: accountId })
      console.log("✓ Cursors reset, now starting data sync...")

      // Then call syncAccount to fetch the actual data (status is managed in the backend)
      await syncAccount({ integrationId: accountId })
      console.log("✓ Sync completed")

      // Wait a brief moment before refreshing
      await new Promise((resolve) => setTimeout(resolve, 1000))
      handleRefresh()
    } catch (error) {
      console.error("Failed to sync account:", error)
    }
  }, [handleRefresh, resetAllCursors, syncAccount])

  const handleSyncFiatOnly = React.useCallback(async (accountId: Id<"integrations">) => {
    if (!isConvexConfigured) {
      console.error("Convex is not configured")
      return
    }

    try {
      await syncFiatOnly({ integrationId: accountId })
      console.log("✓ Fiat sync completed")
      await new Promise((resolve) => setTimeout(resolve, 1000))
      handleRefresh()
    } catch (error) {
      console.error("Failed to sync fiat:", error)
    }
  }, [handleRefresh, syncFiatOnly])

  const isLoading = integrationsLoading || transactionsLoading

  return (
    <div className="flex flex-col h-full bg-[#f8f9fc] min-h-screen font-sans p-6 md:p-9 max-w-[1141px] mx-auto">
      {/* Header */}
      <div className="flex flex-row justify-between items-center mb-9">
        <h1 className="text-[28px] font-bold text-[#1e2029]">Mes comptes</h1>
        <Button
          className="bg-[#503bff] hover:bg-[#402fd0] text-white font-medium rounded-md h-10 px-6 shadow-sm"
          onClick={() => setIsConnectOpen(true)}
        >
          Ajouter un compte
        </Button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row md:items-center gap-5 mb-9">
        {/* Chips */}
        <div className="flex items-center gap-2">
          <FilterChip label="Tous" active />
          <FilterChip label="API" />
          <FilterChip label="Fichier" />
        </div>

        {/* Search */}
        <div className="flex-1 relative">
          <Input
            placeholder="Rechercher un compte"
            className="h-[42px] bg-white border-[#d4d8e1] rounded-md pl-4 pr-10 text-sm placeholder:text-[#808594] focus-visible:ring-[#503bff]"
          />
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#808594]" />
        </div>

        {/* View Toggler */}
        <div className="flex items-center bg-[#e9e9e9] p-1 rounded-md h-[42px]">
          <div className="flex items-center justify-center w-[43px] h-[34px] bg-white rounded shadow-sm cursor-pointer">
            <LayoutGrid className="w-5 h-5 text-[#1e2029]" />
          </div>
          <div className="flex items-center justify-center w-[43px] h-[34px] cursor-pointer text-[#808594] hover:text-[#1e2029]">
            <ListIcon className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Accounts List */}
      <div className="flex flex-col gap-3">
        {isLoading ? (
          <div className="text-center py-8">
            <p className="text-[#808594]">Chargement des comptes...</p>
          </div>
        ) : accountsWithTransactions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-[#808594]">Aucun compte connecté. Commencez par en ajouter un.</p>
          </div>
        ) : (
          accountsWithTransactions.map((account) => (
            <Accordion type="single" collapsible key={account.id} className="bg-white rounded-xl border border-[#d4d8e1] shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] overflow-hidden">
              <AccordionItem value={account.id} className="border-none">
                <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-[#fcfcfd] transition-colors group">
                  <div className="flex items-center justify-between w-full pr-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-11 h-11 rounded-full border border-[#f0f0f0]">
                        <AvatarImage src={account.iconUrl} alt={account.name} />
                        <AvatarFallback>{account.name.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-bold text-[#1e2029]">{account.name}</span>
                      <div className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full border border-[#d4d8e1]">
                        <span className="text-xs font-medium text-[#808594]">{account.subAccountsCount}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-5">
                      <StatusBadge status={account.status} />
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="px-0 pb-0">
                  <Separator className="bg-[#d4d8e1]" />
                  <div className="p-5 grid grid-cols-[1fr_0.5fr_1fr_1fr] gap-4 items-center">
                    {/* Platform Info */}
                    <div className="flex items-center gap-4">
                      <Avatar className="w-11 h-11 rounded-full border border-[#f0f0f0]">
                        <AvatarImage src={account.iconUrl} alt={account.name} />
                        <AvatarFallback>{account.name.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col gap-1">
                        <div className="px-1.5 py-1 rounded hover:bg-[#eff0f3] cursor-pointer w-fit -ml-1.5 transition-colors">
                          <span className="text-sm font-medium text-[#1e2029]">{account.name}</span>
                        </div>
                        <span className="text-[13px] text-[#808594]">{account.addressOrId}</span>
                      </div>
                    </div>

                    {/* Type */}
                    <div className="flex items-center gap-2 px-2 py-1 rounded border border-[#e3e5ea] w-fit hover:border-[#c9cad4] cursor-pointer bg-white">
                      <div className="w-5 h-5 flex items-center justify-center bg-[#e3e5ea] rounded-[3px]">
                        <Calendar className="w-3 h-3 text-[#503bff]" />
                      </div>
                      <span className="text-[13px] text-[#3b414f]">{account.type}</span>
                    </div>

                    {/* Transactions Link */}
                    <Link
                      href={`/dashboard/transactions?integrationId=${account.id}`}
                      className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-[#503bff]/10 w-fit transition-colors group/link"
                    >
                      <span className="text-sm font-medium text-[#503bff]">{account.transactionCount} transactions</span>
                      <ExternalLink className="w-3 h-3 text-[#503bff]" />
                    </Link>

                    {/* Status & Actions */}
                    <div className="flex items-center justify-end gap-4">
                      <div className="flex items-center gap-3">
                        <span className="text-[13px] text-[#808594]">{account.lastSync}</span>
                        <StatusBadge status={account.status} showText />
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-[#808594] hover:text-[#1e2029]">
                            <MoreVertical className="w-5 h-5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 bg-white">
                          <DropdownMenuItem className="cursor-pointer text-[#1e2029] hover:bg-[#f8f9fc]">
                            <span className="text-sm font-medium">Renommer</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleSyncAccount(account.id)}
                            disabled={account.status === "syncing"}
                            className="cursor-pointer text-[#1e2029] hover:bg-[#f8f9fc] flex items-center justify-between disabled:opacity-50"
                          >
                            <span className="text-sm font-medium">Synchroniser</span>
                            <span className="text-xs text-[#808594]">(0 restante)</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleSyncFiatOnly(account.id)}
                            disabled={account.status === "syncing"}
                            className="cursor-pointer text-[#1e2029] hover:bg-[#f8f9fc] disabled:opacity-50"
                          >
                            <span className="text-sm font-medium">Sync Fiat uniquement</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer text-[#1e2029] hover:bg-[#f8f9fc]">
                            <span className="text-sm font-medium">Mettre à jour l&apos;API</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-[#d4d8e1]" />
                          <DropdownMenuItem className="cursor-pointer text-red-600 hover:bg-red-50">
                            <span className="text-sm font-medium">Supprimer</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          ))
        )}
      </div>

      <ConnectProviderDialog open={isConnectOpen} onOpenChange={(open) => {
        setIsConnectOpen(open)
        if (!open) {
          handleRefresh()
        }
      }} />
    </div>
  )
}

function FilterChip({ label, active }: { label: string, active?: boolean }) {
  return (
    <div className={cn(
      "px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-colors border",
      active 
        ? "bg-[#503bff] text-white border-[#503bff]" 
        : "bg-white text-[#808594] border-[#d4d8e1] hover:bg-[#f8f9fc]"
    )}>
      {label}
    </div>
  )
}

function StatusBadge({ status, showText }: { status: AccountStatus, showText?: boolean }) {
  if (status === 'synced') {
    return (
      <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-[#d8fff0]">
        <Check className="w-3.5 h-3.5 text-[#00492f]" />
        {showText && <span className="text-[13px] font-medium text-[#00492f]">Synchronisé</span>}
      </div>
    )
  }
  if (status === 'syncing') {
    return (
      <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-[#fff3cd]">
        <RefreshCw className="w-3.5 h-3.5 text-[#856404] animate-spin" />
        {showText && <span className="text-[13px] font-medium text-[#856404]">Synchronisation</span>}
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-[#ffdce4]">
        <AlertCircle className="w-3.5 h-3.5 text-[#b20000]" />
        {showText && <span className="text-[13px] font-medium text-[#b20000]">Erreur</span>}
      </div>
    )
  }
  if (status === 'unsupported') {
    return (
      <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-[#eff0f3]">
        <X className="w-3.5 h-3.5 text-[#3b414f]" />
        {showText && <span className="text-[13px] font-medium text-[#3b414f]">Plateforme non supportée</span>}
      </div>
    )
  }
  return null
}