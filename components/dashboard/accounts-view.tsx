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
  RefreshCw,
  Plus,
  Inbox,
  Copy,
  FileUp,
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
import { BitstackImportDialog } from "@/components/dashboard/bitstack-import-dialog"
import { FinaryImportDialog } from "@/components/dashboard/finary-import-dialog"
import { KucoinImportDialog } from "@/components/dashboard/kucoin-import-dialog"
import { useDashboardData } from "@/components/dashboard/dashboard-data-context"
import { useAction, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { isConvexConfigured } from "@/convex/client"
import { toast, withToast } from "@/lib/toast"
import type { Id } from "@/convex/_generated/dataModel"

// Types pour les données
type AccountStatus = "synced" | "error" | "unsupported" | "syncing"

const PROVIDER_ICONS: Record<string, string> = {
  binance: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/270.png",
  kucoin: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/311.png",
  ethereum: "https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png",
  bitcoin: "https://s2.coinmarketcap.com/static/img/coins/64x64/1.png",
  arbitrum: "https://s2.coinmarketcap.com/static/img/coins/64x64/11841.png",
  solana: "https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png",
  kaspa: "https://s2.coinmarketcap.com/static/img/coins/64x64/20396.png",
  tao: "https://s2.coinmarketcap.com/static/img/coins/64x64/22974.png",
  bitstack: "https://bitcoin.fr/wp-content/uploads/2022/05/Bitstack.jpg",
}

const PROVIDER_NAMES: Record<string, string> = {
  binance: "Binance",
  kucoin: "KuCoin",
  ethereum: "Ethereum",
  bitcoin: "Bitcoin",
  arbitrum: "Arbitrum One",
  solana: "Solana",
  kaspa: "Kaspa",
  tao: "Bittensor (TAO)",
  bitstack: "Bitstack",
  finary: "Finary",
}

const FILE_IMPORT_PROVIDERS = new Set(["bitstack", "finary"])

type AccountType = "All" | "API" | "File"

export function AccountsView() {
  const [isConnectOpen, setIsConnectOpen] = React.useState(false)
  const [isBitstackImportOpen, setIsBitstackImportOpen] = React.useState(false)
  const [isFinaryImportOpen, setIsFinaryImportOpen] = React.useState(false)
  const [isKucoinImportOpen, setIsKucoinImportOpen] = React.useState(false)
  const [kucoinImportIntegrationId, setKucoinImportIntegrationId] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<AccountType>("All")
  const [viewMode, setViewMode] = React.useState<"list" | "grid">("list")
  // Les données viennent du contexte du dashboard : un seul chargement
  // partagé avec la sidebar et la vue portefeuille.
  const {
    integrations,
    isLoadingIntegrations: integrationsLoading,
    transactions,
    isLoading: transactionsLoading,
    refresh: handleRefresh,
  } = useDashboardData()
  const resetAllCursors = useAction(api.resetCursors.resetAllCursors)
  const syncAccount = useAction(api.binance.syncAccount)
  const syncKucoin = useAction(api.kucoin.syncAccount)
  const syncKucoinConverts = useAction(api.kucoin.syncConvertsOnly)
  const syncFiatOnly = useAction(api.binance.syncFiatOrdersOnly)
  const syncDustOnly = useAction(api.binance.syncDustOnly)
  const syncBalances = useAction(api.binance.getUserAssets)
  const syncOrders = useAction(api.binance.syncOrdersOnly)
  const syncKaspaWallet = useAction(api.kaspa.syncKaspaWallet)
  const syncEthereumWallet = useAction(api.ethereum.syncEthereumWallet)
  const syncSolanaWallet = useAction(api.solana.syncSolanaWallet)
  const syncBitcoinWallet = useAction(api.bitcoin.syncBitcoinWallet)
  const syncTaoWallet = useAction(api.tao.syncTaoWallet)
  const purgeAllData = useMutation(api.integrations.purgeAllData)
  const deleteIntegration = useMutation(api.integrations.deleteIntegration)

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

      const accountCreatedAt = integration.accountCreatedAt
        ? new Date(integration.accountCreatedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
        : null

      return {
        id: integration._id,
        name: PROVIDER_NAMES[integration.provider] || integration.displayName || integration.provider || "Compte",
        type: (FILE_IMPORT_PROVIDERS.has(integration.provider) ? "File" : "API") as "API" | "File",
        platformId: integration.provider,
        iconUrl: PROVIDER_ICONS[integration.provider] || "",
        subAccountsCount: 1,
        addressOrId: integration.publicAddress || integration.displayName || integration.provider,
        transactionCount: integrationTransactions.length,
        lastSync,
        status,
        accountCreatedAt,
      }
    })
  }, [integrations, transactions])

  const handleSyncAccount = React.useCallback(async (accountId: Id<"integrations">, provider?: string) => {
    if (!isConvexConfigured) {
      console.error("Convex is not configured")
      toast.error("Convex n'est pas configuré, l'action est indisponible.")
      return
    }

    const providerKey = provider || "binance"
    const providerName = PROVIDER_NAMES[providerKey] || "le compte"

    const done = await withToast(
      async () => {
        if (providerKey === "kaspa") {
          await syncKaspaWallet({ integrationId: accountId })
        } else if (providerKey === "ethereum") {
          await syncEthereumWallet({ integrationId: accountId })
        } else if (providerKey === "solana") {
          await syncSolanaWallet({ integrationId: accountId })
        } else if (providerKey === "bitcoin") {
          await syncBitcoinWallet({ integrationId: accountId })
        } else if (providerKey === "tao") {
          await syncTaoWallet({ integrationId: accountId })
        } else if (providerKey === "binance") {
          // Binance flow (default for backward compatibility)
          // First reset all cursors to force re-sync from the beginning
          await resetAllCursors({ integrationId: accountId })

          // Then call syncAccount to fetch the actual data (status is managed in the backend)
          await syncAccount({ integrationId: accountId })
        } else if (providerKey === "kucoin") {
          await syncKucoin({ integrationId: accountId })
        } else {
          throw new Error(`Synchronisation non prise en charge pour ${providerName}.`)
        }
        return true as const
      },
      {
        loading: `Synchronisation de ${providerName}…`,
        success: `${providerName} synchronisé`,
        error: `Échec de la synchronisation de ${providerName}`,
      }
    )

    if (!done) return

    // Wait a brief moment before refreshing
    await new Promise((resolve) => setTimeout(resolve, 1000))
    handleRefresh()
  }, [handleRefresh, resetAllCursors, syncAccount, syncKucoin, syncKaspaWallet, syncEthereumWallet, syncSolanaWallet, syncBitcoinWallet, syncTaoWallet])

  const handleSyncFiatOnly = React.useCallback(async (accountId: Id<"integrations">) => {
    if (!isConvexConfigured) {
      console.error("Convex is not configured")
      toast.error("Convex n'est pas configuré, l'action est indisponible.")
      return
    }

    const done = await withToast(
      async () => {
        await syncFiatOnly({ integrationId: accountId })
        return true as const
      },
      {
        loading: "Synchronisation des ordres fiat…",
        success: "Ordres fiat synchronisés",
        error: "Échec de la synchronisation des ordres fiat",
      }
    )

    if (!done) return

    await new Promise((resolve) => setTimeout(resolve, 1000))
    handleRefresh()
  }, [handleRefresh, syncFiatOnly])

  const handleSyncKucoinConverts = React.useCallback(async (accountId: Id<"integrations">) => {
    if (!isConvexConfigured) {
      console.error("Convex is not configured")
      toast.error("Convex n'est pas configuré, l'action est indisponible.")
      return
    }

    const done = await withToast(
      async () => {
        await syncKucoinConverts({ integrationId: accountId })
        return true as const
      },
      {
        loading: "Synchronisation des converts KuCoin…",
        success: "Converts KuCoin synchronisés",
        error: "Échec de la synchronisation des converts KuCoin",
      }
    )

    if (!done) return

    await new Promise((resolve) => setTimeout(resolve, 1000))
    handleRefresh()
  }, [handleRefresh, syncKucoinConverts])

  const handleSyncDustOnly = React.useCallback(async (accountId: Id<"integrations">) => {
    if (!isConvexConfigured) {
      console.error("Convex is not configured")
      toast.error("Convex n'est pas configuré, l'action est indisponible.")
      return
    }

    const done = await withToast(
      async () => {
        await syncDustOnly({ integrationId: accountId })
        return true as const
      },
      {
        loading: "Synchronisation des conversions dust…",
        success: "Conversions dust synchronisées",
        error: "Échec de la synchronisation des conversions dust",
      }
    )

    if (!done) return

    await new Promise((resolve) => setTimeout(resolve, 1000))
    handleRefresh()
  }, [handleRefresh, syncDustOnly])

  const handleSyncBalances = React.useCallback(async (accountId: Id<"integrations">) => {
    if (!isConvexConfigured) {
      console.error("Convex is not configured")
      toast.error("Convex n'est pas configuré, l'action est indisponible.")
      return
    }

    const assets = await withToast(
      () => syncBalances({ integrationId: accountId }),
      {
        loading: "Synchronisation des soldes…",
        success: (result) =>
          `${result.length} actif${result.length > 1 ? "s" : ""} mis à jour`,
        error: "Échec de la synchronisation des soldes",
      }
    )

    if (!assets) return

    await new Promise((resolve) => setTimeout(resolve, 1000))
    handleRefresh()
  }, [handleRefresh, syncBalances])

  const handleSyncOrders = React.useCallback(async (accountId: Id<"integrations">) => {
    if (!isConvexConfigured) {
      console.error("Convex is not configured")
      toast.error("Convex n'est pas configuré, l'action est indisponible.")
      return
    }

    const done = await withToast(
      async () => {
        await syncOrders({ integrationId: accountId })
        return true as const
      },
      {
        loading: "Synchronisation de l'historique des ordres…",
        success: "Historique des ordres synchronisé",
        error: "Échec de la synchronisation de l'historique des ordres",
      }
    )

    if (!done) return

    await new Promise((resolve) => setTimeout(resolve, 1000))
    handleRefresh()
  }, [handleRefresh, syncOrders])

  const handlePurgeData = React.useCallback(async (accountId: Id<"integrations">) => {
    if (!isConvexConfigured) {
      console.error("Convex is not configured")
      toast.error("Convex n'est pas configuré, l'action est indisponible.")
      return
    }

    if (!window.confirm("Vider toutes les données de ce compte ? (trades, orders, deposits, balances…)\nL'API restera connectée.")) {
      return
    }

    const counts = await withToast(
      () => purgeAllData({ integrationId: accountId }),
      {
        loading: "Suppression des données du compte…",
        success: (result) => {
          const total =
            result.trades +
            result.orders +
            result.convertTrades +
            result.deposits +
            result.withdrawals +
            result.fiatTransactions +
            result.balances
          if (total === 0) return "Aucune donnée à supprimer pour ce compte"
          return `${total.toLocaleString("fr-FR")} enregistrement${total > 1 ? "s" : ""} supprimé${total > 1 ? "s" : ""} : ${result.trades} trades, ${result.orders} ordres, ${result.deposits} dépôts, ${result.withdrawals} retraits`
        },
        error: "Échec de la suppression des données",
      }
    )

    if (!counts) return

    await new Promise((resolve) => setTimeout(resolve, 500))
    handleRefresh()
  }, [handleRefresh, purgeAllData])

  const handleDeleteAccount = React.useCallback(async (accountId: Id<"integrations">) => {
    if (!isConvexConfigured) {
      console.error("Convex is not configured")
      toast.error("Convex n'est pas configuré, l'action est indisponible.")
      return
    }

    if (!window.confirm("Supprimer définitivement ce compte et toutes ses données ?\nCette action est irréversible.")) {
      return
    }

    const done = await withToast(
      async () => {
        await deleteIntegration({ integrationId: accountId })
        return true as const
      },
      {
        loading: "Suppression du compte…",
        success: "Compte supprimé avec toutes ses données",
        error: "Échec de la suppression du compte",
      }
    )

    if (!done) return

    await new Promise((resolve) => setTimeout(resolve, 500))
    handleRefresh()
  }, [handleRefresh, deleteIntegration])

  const isLoading = integrationsLoading || transactionsLoading

  const filteredAccounts = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return accountsWithTransactions
      .filter((account) => {
        if (typeFilter !== "All" && account.type !== typeFilter) return false
        if (!query) return true
        return (
          account.name.toLowerCase().includes(query) ||
          account.addressOrId.toLowerCase().includes(query) ||
          account.platformId.toLowerCase().includes(query)
        )
      })
      .sort((a, b) => {
        const rank = (s: AccountStatus) => (s === "error" ? 0 : s === "syncing" ? 1 : s === "unsupported" ? 2 : 3)
        return rank(a.status) - rank(b.status)
      })
  }, [accountsWithTransactions, searchQuery, typeFilter])

  const hasAnyAccounts = accountsWithTransactions.length > 0

  return (
    <div className="flex flex-col h-full bg-background min-h-screen font-sans p-6 md:p-9 max-w-[1141px] mx-auto">
      {/* Header */}
      <div className="flex flex-row justify-between items-center mb-9">
        <div className="flex flex-col gap-1">
          <p className="num text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Portefeuille</p>
          <h1 className="font-serif text-3xl font-normal leading-tight text-foreground">Mes comptes</h1>
        </div>
        <Button
          onClick={() => setIsConnectOpen(true)}
          className="h-10 px-5 rounded-md font-medium cursor-pointer gap-2"
        >
          <Plus className="w-4 h-4" />
          Ajouter un compte
        </Button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row md:items-center gap-4 mb-8">
        {/* Chips */}
        <div className="flex items-center gap-2">
          <FilterChip label="Tous" active={typeFilter === "All"} onClick={() => setTypeFilter("All")} />
          <FilterChip label="API" active={typeFilter === "API"} onClick={() => setTypeFilter("API")} />
          <FilterChip label="Fichier" active={typeFilter === "File"} onClick={() => setTypeFilter("File")} />
        </div>

        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un compte"
            className="h-[42px] bg-card border-border rounded-md pl-10 pr-9 text-sm placeholder:text-muted-foreground focus-visible:ring-primary/40"
            aria-label="Rechercher un compte"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Effacer la recherche"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* View Toggler */}
        <div
          role="tablist"
          aria-label="Affichage des comptes"
          className="flex items-center bg-muted p-1 rounded-md h-[42px]"
        >
          <button
            role="tab"
            type="button"
            aria-label="Vue grille"
            aria-selected={viewMode === "grid"}
            onClick={() => setViewMode("grid")}
            className={cn(
              "flex items-center justify-center w-[43px] h-[34px] rounded cursor-pointer transition-colors",
              viewMode === "grid"
                ? "bg-card text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            role="tab"
            type="button"
            aria-label="Vue liste"
            aria-selected={viewMode === "list"}
            onClick={() => setViewMode("list")}
            className={cn(
              "flex items-center justify-center w-[43px] h-[34px] rounded cursor-pointer transition-colors",
              viewMode === "list"
                ? "bg-card text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ListIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Accounts List */}
      <div className={cn(
        viewMode === "grid"
          ? "grid grid-cols-1 md:grid-cols-2 gap-3"
          : "flex flex-col gap-3"
      )}>
        {isLoading ? (
          <AccountsSkeleton />
        ) : !hasAnyAccounts ? (
          <EmptyState onAdd={() => setIsConnectOpen(true)} />
        ) : filteredAccounts.length === 0 ? (
          <NoResultsState query={searchQuery} onReset={() => { setSearchQuery(""); setTypeFilter("All") }} />
        ) : (
          filteredAccounts.map((account) => (
            <Accordion type="single" collapsible key={account.id} className="bg-card rounded-lg border border-border overflow-hidden transition-colors hover:border-primary/30">
              <AccordionItem value={account.id} className="border-none">
                <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-muted/40 transition-colors group [&>svg]:text-muted-foreground">
                  <div className="flex items-center justify-between w-full pr-2 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="w-11 h-11 rounded-full border border-border bg-muted shrink-0">
                        <AvatarImage src={account.iconUrl} alt={account.name} />
                        <AvatarFallback className="text-xs font-semibold text-muted-foreground">{(account.name ?? "??").slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-sm font-semibold text-foreground truncate">{account.name}</span>
                        {account.accountCreatedAt && (
                          <span className="text-xs text-muted-foreground hidden sm:inline">depuis le {account.accountCreatedAt}</span>
                        )}
                        <div className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full border border-border bg-muted/50">
                          <span className="text-[11px] font-medium text-muted-foreground">{account.subAccountsCount}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[12px] text-muted-foreground hidden sm:inline whitespace-nowrap">{account.lastSync}</span>
                      <StatusBadge status={account.status} showText />
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="px-0 pb-0">
                  <Separator className="bg-border" />
                  <div className="p-5 grid grid-cols-1 md:grid-cols-[1.4fr_auto_auto_1fr] gap-4 items-center">
                    {/* Platform Info */}
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10 rounded-full border border-border bg-muted">
                        <AvatarImage src={account.iconUrl} alt={account.name} />
                        <AvatarFallback className="text-xs font-semibold text-muted-foreground">{(account.name ?? "??").slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-sm font-semibold text-foreground truncate">{account.name}</span>
                        <CopyableAddress address={account.addressOrId} />
                      </div>
                    </div>

                    {/* Type */}
                    <div className="flex items-center gap-2 px-2.5 py-1 rounded-md border border-border w-fit bg-muted/30">
                      <div className="w-5 h-5 flex items-center justify-center bg-primary/15 rounded-[4px]">
                        <Calendar className="w-3 h-3 text-primary" />
                      </div>
                      <span className="text-[12px] font-medium text-foreground">{account.type}</span>
                    </div>

                    {/* Transactions Link */}
                    <Link
                      href={`/dashboard/transactions?integrationId=${account.id}`}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-primary/10 w-fit transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      <span className="text-sm font-semibold text-primary">{account.transactionCount.toLocaleString("fr-FR")} transactions</span>
                      <ExternalLink className="w-3.5 h-3.5 text-primary" />
                    </Link>

                    {/* Status & Actions */}
                    <div className="flex items-center justify-end gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[12px] text-muted-foreground whitespace-nowrap">{account.lastSync}</span>
                        <StatusBadge status={account.status} showText />
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Actions sur le compte"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem className="cursor-pointer">
                            <span className="text-sm">Renommer</span>
                          </DropdownMenuItem>
                          {FILE_IMPORT_PROVIDERS.has(account.platformId) ? (
                            <DropdownMenuItem
                              onClick={() => account.platformId === "finary" ? setIsFinaryImportOpen(true) : setIsBitstackImportOpen(true)}
                              className="cursor-pointer flex items-center justify-between"
                            >
                              <span className="text-sm">Importer un fichier CSV</span>
                              <FileUp className="w-3.5 h-3.5 text-muted-foreground" />
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => handleSyncAccount(account.id, account.platformId)}
                              disabled={account.status === "syncing"}
                              className="cursor-pointer flex items-center justify-between"
                            >
                              <span className="text-sm">Synchroniser</span>
                              <RefreshCw className={cn("w-3.5 h-3.5 text-muted-foreground", account.status === "syncing" && "animate-spin")} />
                            </DropdownMenuItem>
                          )}
                          {!FILE_IMPORT_PROVIDERS.has(account.platformId) && (<>
                          <DropdownMenuItem
                            onClick={() => handleSyncFiatOnly(account.id)}
                            disabled={account.status === "syncing"}
                            className="cursor-pointer"
                          >
                            <span className="text-sm">Sync Fiat uniquement</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleSyncDustOnly(account.id)}
                            disabled={account.status === "syncing"}
                            className="cursor-pointer"
                          >
                            <span className="text-sm">Sync Dust/Dribblet</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleSyncBalances(account.id)}
                            disabled={account.status === "syncing"}
                            className="cursor-pointer"
                          >
                            <span className="text-sm">Sync Balances</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleSyncOrders(account.id)}
                            disabled={account.status === "syncing"}
                            className="cursor-pointer"
                          >
                            <span className="text-sm">Sync Order History</span>
                          </DropdownMenuItem>
                          {account.platformId === "kucoin" && (
                          <DropdownMenuItem
                            onClick={() => handleSyncKucoinConverts(account.id)}
                            disabled={account.status === "syncing"}
                            className="cursor-pointer"
                          >
                            <span className="text-sm">Sync Converts</span>
                          </DropdownMenuItem>
                          )}
                          {account.platformId === "kucoin" && (
                          <DropdownMenuItem
                            onClick={() => { setKucoinImportIntegrationId(account.id); setIsKucoinImportOpen(true); }}
                            className="cursor-pointer flex items-center justify-between"
                          >
                            <span className="text-sm">Importer fichiers CSV</span>
                            <FileUp className="w-3.5 h-3.5 text-muted-foreground" />
                          </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="cursor-pointer">
                            <span className="text-sm">Mettre à jour l&apos;API</span>
                          </DropdownMenuItem>
                          </>)}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handlePurgeData(account.id)}
                            className="cursor-pointer text-orange-600 focus:text-orange-600 dark:text-orange-400 dark:focus:text-orange-400"
                          >
                            <span className="text-sm">Vider les données</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDeleteAccount(account.id)}
                            className="cursor-pointer text-destructive focus:text-destructive"
                          >
                            <span className="text-sm">Supprimer</span>
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
      <BitstackImportDialog
        open={isBitstackImportOpen}
        onOpenChange={setIsBitstackImportOpen}
        onSuccess={handleRefresh}
      />
      <FinaryImportDialog
        open={isFinaryImportOpen}
        onOpenChange={setIsFinaryImportOpen}
        onSuccess={handleRefresh}
      />
      {kucoinImportIntegrationId && (
        <KucoinImportDialog
          open={isKucoinImportOpen}
          onOpenChange={setIsKucoinImportOpen}
          integrationId={kucoinImportIntegrationId as import("@/convex/_generated/dataModel").Id<"integrations">}
          onSuccess={handleRefresh}
        />
      )}
    </div>
  )
}

function CopyableAddress({ address }: { address: string }) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = React.useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch (error) {
      console.error("Failed to copy address:", error)
    }
  }, [address])

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Copié !" : `Copier ${address}`}
      aria-label={copied ? "Adresse copiée" : "Copier l'adresse"}
      className="group flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded max-w-[260px]"
    >
      <span className="truncate">{address}</span>
      {copied ? (
        <Check className="w-3 h-3 text-positive shrink-0" />
      ) : (
        <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      )}
    </button>
  )
}

function FilterChip({ label, active, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-colors border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted/60"
      )}
    >
      {label}
    </button>
  )
}

function StatusBadge({ status, showText }: { status: AccountStatus, showText?: boolean }) {
  if (status === 'synced') {
    return (
      <div className="num flex items-center gap-1.5 border border-positive/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-positive">
        <Check className="w-3.5 h-3.5" />
        {showText && <span className="text-[12px] font-medium">Synchronisé</span>}
      </div>
    )
  }
  if (status === 'syncing') {
    return (
      <div className="num flex items-center gap-1.5 border border-chart-4/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-chart-4">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        {showText && <span className="text-[12px] font-medium">Synchronisation…</span>}
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
        <AlertCircle className="w-3.5 h-3.5" />
        {showText && <span className="text-[12px] font-medium">Erreur</span>}
      </div>
    )
  }
  if (status === 'unsupported') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border">
        <X className="w-3.5 h-3.5" />
        {showText && <span className="text-[12px] font-medium">Non supportée</span>}
      </div>
    )
  }
  return null
}

function AccountsSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-card rounded-lg border border-border px-5 py-4 flex items-center justify-between animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-muted" />
            <div className="flex flex-col gap-2">
              <div className="h-3.5 w-32 rounded bg-muted" />
              <div className="h-3 w-24 rounded bg-muted/60" />
            </div>
          </div>
          <div className="h-6 w-24 rounded-full bg-muted" />
        </div>
      ))}
    </>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 rounded-lg border border-dashed border-border bg-card/60">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <Inbox className="w-6 h-6 text-primary" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">Aucun compte connecté</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-5">
        Ajoutez votre premier exchange ou wallet pour démarrer la synchronisation de vos transactions.
      </p>
      <Button onClick={onAdd} className="gap-2 cursor-pointer">
        <Plus className="w-4 h-4" />
        Ajouter un compte
      </Button>
    </div>
  )
}

function NoResultsState({ query, onReset }: { query: string; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6 rounded-lg border border-dashed border-border bg-card/60">
      <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center mb-3">
        <Search className="w-5 h-5 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">Aucun résultat</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-4">
        {query
          ? <>Aucun compte ne correspond à <span className="font-medium text-foreground">&ldquo;{query}&rdquo;</span>.</>
          : "Aucun compte ne correspond aux filtres actuels."}
      </p>
      <Button variant="outline" onClick={onReset} className="cursor-pointer">
        Réinitialiser les filtres
      </Button>
    </div>
  )
}