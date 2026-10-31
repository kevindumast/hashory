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
  ArrowUpRight,
  RefreshCw,
  Plus,
  Inbox,
  Copy,
  FileUp,
  CircleStop,
  KeyRound,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { dataProviderForSource, dataProviderLabel } from "@/lib/data-providers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
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
import { TransactionsPerYear } from "@/components/dashboard/transactions-per-year"
import { useDashboardData } from "@/components/dashboard/dashboard-data-context"
import { useAction, useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { isConvexConfigured } from "@/convex/client"
import { isFileImportAccount } from "@/lib/providers"
import { PROVIDER_ICONS } from "@/lib/provider-icons"
import { toast, withToast } from "@/lib/toast"
import { assessSyncHealth, formatElapsed, type SyncHealth } from "@/lib/sync-health"
import type { Id } from "@/convex/_generated/dataModel"

// Types pour les données
type AccountStatus = "synced" | "error" | "unsupported" | "syncing"


const PROVIDER_NAMES: Record<string, string> = {
  binance: "Binance",
  kraken: "Kraken",
  kucoin: "KuCoin",
  ethereum: "Ethereum",
  bitcoin: "Bitcoin",
  arbitrum: "Arbitrum One",
  solana: "Solana",
  kaspa: "Kaspa",
  tao: "Bittensor (TAO)",
  bitstack: "Bitstack",
  finary: "Finary",
  strike: "Strike",
}


type AccountType = "All" | "API" | "File"

/**
 * Horloge réveillée régulièrement, pour que la durée affichée avance et que
 * le seuil d'alerte finisse par se déclencher sans recharger la page.
 *
 * Nulle au premier rendu : l'heure du navigateur ne peut pas être lue
 * pendant le rendu serveur, et l'y comparer produirait une divergence
 * d'hydratation.
 */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = React.useState<number | null>(null)
  React.useEffect(() => {
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

export function AccountsView() {
  const [isConnectOpen, setIsConnectOpen] = React.useState(false)
  const [isBitstackImportOpen, setIsBitstackImportOpen] = React.useState(false)
  const [isFinaryImportOpen, setIsFinaryImportOpen] = React.useState(false)
  const [isKucoinImportOpen, setIsKucoinImportOpen] = React.useState(false)
  const [renameTarget, setRenameTarget] = React.useState<{ id: Id<"integrations">; name: string } | null>(null)
  const [renameValue, setRenameValue] = React.useState("")
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
  const syncKraken = useAction(api.kraken.syncAccount)
  const syncKucoinConverts = useAction(api.kucoin.syncConvertsOnly)
  const syncFiatOnly = useAction(api.binance.syncFiatOrdersOnly)
  const syncDustOnly = useAction(api.binance.syncDustOnly)
  const syncBalances = useAction(api.binance.getUserAssets)
  const syncOrders = useAction(api.binance.syncOrdersOnly)
  const syncSpotTrades = useAction(api.binance.syncSpotTradesOnly)
  const syncKaspaWallet = useAction(api.kaspa.syncKaspaWallet)
  const syncEthereumWallet = useAction(api.ethereum.syncEthereumWallet)
  const syncSolanaWallet = useAction(api.solana.syncSolanaWallet)
  const syncBitcoinWallet = useAction(api.bitcoin.syncBitcoinWallet)
  const syncTaoWallet = useAction(api.tao.syncTaoWallet)
  const purgeAllData = useMutation(api.integrations.purgeAllData)
  const deleteIntegration = useMutation(api.integrations.deleteIntegration)
  const setSyncEnabled = useMutation(api.integrations.setSyncEnabled)
  const cancelSync = useMutation(api.integrations.cancelSync)
  const renameIntegration = useMutation(api.integrations.rename)
  const dataProviderKeys = useQuery(api.dataProviderKeys.list)
  const now = useNow()

  // Diagnostic de synchronisation, tenu à part : il se rafraîchit à chaque
  // battement d'horloge, alors que le décompte des transactions ci-dessous
  // n'a aucune raison d'être refait toutes les trente secondes.
  const syncHealthById = React.useMemo(() => {
    const map = new Map<string, SyncHealth>()
    for (const integration of integrations) {
      map.set(
        integration._id,
        assessSyncHealth({
          syncStatus: integration.syncStatus,
          startedAt: integration.syncStartedAt,
          jobs: integration.syncJobs,
          now: now ?? integration.syncStartedAt ?? 0,
        })
      )
    }
    return map
  }, [integrations, now])

  // Wallet lu via un fournisseur dont l'utilisateur n'a pas encore fourni
  // la clé : on le dit sur la ligne plutôt que de laisser la synchro échouer.
  const missingKeyFor = React.useCallback(
    (provider: string) => {
      const required = dataProviderForSource(provider)
      if (!required || dataProviderKeys === undefined) return null
      return dataProviderKeys.some((key) => key.provider === required) ? null : required
    },
    [dataProviderKeys]
  )

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
        // Le nom choisi par l'utilisateur d'abord : celui de la plateforme masquait tout renommage.
        // Des comptes ont reçu l'identifiant de la plateforme pour nom (« kraken ») : ce n'en est pas un.
        name:
          (integration.displayName !== integration.provider && integration.displayName) ||
          PROVIDER_NAMES[integration.provider] ||
          integration.provider ||
          "Compte",
        type: (isFileImportAccount(integration) ? "File" : "API") as "API" | "File",
        platformId: integration.provider,
        iconUrl: PROVIDER_ICONS[integration.provider] || "",
        subAccountsCount: 1,
        addressOrId: integration.publicAddress || integration.displayName || integration.provider,
        transactionCount: integrationTransactions.length,
        syncEnabled: integration.syncEnabled,
        lastSync,
        status,
        accountCreatedAt,
        health: syncHealthById.get(integration._id) ?? null,
        missingKey: missingKeyFor(integration.provider),
      }
    })
  }, [integrations, transactions, syncHealthById, missingKeyFor])

  const handleToggleSync = React.useCallback(
    async (accountId: Id<"integrations">, enabled: boolean, label: string) => {
      if (!isConvexConfigured) {
        toast.error("Convex n'est pas configuré, l'action est indisponible.")
        return
      }
      await withToast(() => setSyncEnabled({ integrationId: accountId, enabled }), {
        loading: enabled ? `Réactivation de ${label}…` : `Mise en pause de ${label}…`,
        success: enabled
          ? `${label} sera de nouveau synchronisé automatiquement`
          : `${label} ne sera plus synchronisé — son historique est conservé`,
      })
      handleRefresh()
    },
    [setSyncEnabled, handleRefresh]
  )

  const handleCancelSync = React.useCallback(
    async (accountId: Id<"integrations">, label: string) => {
      if (!isConvexConfigured) {
        toast.error("Convex n'est pas configuré, l'action est indisponible.")
        return
      }
      await withToast(() => cancelSync({ integrationId: accountId }), {
        loading: `Arrêt de la synchronisation de ${label}…`,
        success: (result) =>
          result.cancelled > 0
            ? `Synchronisation de ${label} arrêtée — ${result.cancelled} étape${result.cancelled > 1 ? "s" : ""} annulée${result.cancelled > 1 ? "s" : ""}`
            : `${label} n'est plus marqué en synchronisation`,
      })
      handleRefresh()
    },
    [cancelSync, handleRefresh]
  )

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
        } else if (providerKey === "kraken") {
          // Comme pour Binance, le bouton manuel relit tout : les curseurs
          // sont effacés d'abord. Les insertions étant dédupliquées, une
          // relecture ne crée aucun doublon.
          await resetAllCursors({ integrationId: accountId })
          await syncKraken({ integrationId: accountId })
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
  }, [handleRefresh, resetAllCursors, syncAccount, syncKucoin, syncKraken, syncKaspaWallet, syncEthereumWallet, syncSolanaWallet, syncBitcoinWallet, syncTaoWallet])

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

  const handleSyncSpotTrades = React.useCallback(async (accountId: Id<"integrations">) => {
    if (!isConvexConfigured) {
      console.error("Convex is not configured")
      toast.error("Convex n'est pas configuré, l'action est indisponible.")
      return
    }

    const result = await withToast(
      () => syncSpotTrades({ integrationId: accountId }),
      {
        loading: "Synchronisation des trades spot…",
        success: (r) =>
          r.inserted > 0
            ? `${r.inserted} trade${r.inserted > 1 ? "s" : ""} ajouté${r.inserted > 1 ? "s" : ""} (${r.symbols} paires lues)`
            : `Trades à jour (${r.symbols} paires lues)`,
        error: "Échec de la synchronisation des trades spot",
      }
    )

    if (!result) return

    await new Promise((resolve) => setTimeout(resolve, 1000))
    handleRefresh()
  }, [handleRefresh, syncSpotTrades])

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

  // Chiffres de synthèse, lus d'un coup d'œil avant la liste.
  const summary = React.useMemo(() => {
    let api = 0
    let file = 0
    let errors = 0
    let syncing = 0
    let paused = 0
    for (const account of accountsWithTransactions) {
      if (account.type === "API") api += 1
      else file += 1
      if (account.syncEnabled === false) paused += 1
      else if (account.status === "error") errors += 1
      else if (account.status === "syncing") syncing += 1
    }
    const total = accountsWithTransactions.length
    return { total, api, file, errors, syncing, paused, upToDate: total - errors - syncing - paused }
  }, [accountsWithTransactions])

  const openImport = React.useCallback((account: { id: string; platformId: string }) => {
    if (account.platformId === "kucoin") {
      setKucoinImportIntegrationId(account.id)
      setIsKucoinImportOpen(true)
    } else if (account.platformId === "finary") {
      setIsFinaryImportOpen(true)
    } else {
      setIsBitstackImportOpen(true)
    }
  }, [])

  return (
    <div className="mx-auto flex h-full min-h-screen w-full max-w-[1141px] flex-col bg-background p-4 pb-32 font-sans sm:p-6 md:p-9 md:pb-9">
      {/* En-tête */}
      <header className="mb-6 flex items-end justify-between gap-4 sm:mb-8">
        <div className="min-w-0">
          <p className="eyebrow">Portefeuille</p>
          <h1 className="title mt-1 text-3xl text-foreground sm:text-4xl">Mes comptes</h1>
        </div>
        <Button onClick={() => setIsConnectOpen(true)} className="h-10 shrink-0 cursor-pointer gap-2 px-4 sm:px-5">
          <Plus className="h-4 w-4" />
          <span className="sm:hidden">Ajouter</span>
          <span className="hidden sm:inline">Ajouter un compte</span>
        </Button>
      </header>

      {/* Synthèse : comptes, volume, état de la synchronisation */}
      {!isLoading && hasAnyAccounts && (
        <dl className="mb-4 grid grid-cols-3 gap-2 sm:mb-6 sm:gap-3">
          <SummaryTile
            label="Comptes"
            value={summary.total.toLocaleString("fr-FR")}
            hint={`${summary.api} API · ${summary.file} fichier${summary.file > 1 ? "s" : ""}`}
          />
          <SummaryTile
            label="Transactions"
            value={transactions.length.toLocaleString("fr-FR")}
            hint="toutes sources"
          />
          <SummaryTile
            label="À jour"
            value={`${summary.upToDate}/${summary.total}`}
            hint={
              summary.errors > 0
                ? `${summary.errors} en erreur`
                : summary.syncing > 0
                  ? `${summary.syncing} en cours`
                  : summary.paused > 0
                    ? `${summary.paused} en pause`
                    : "tout est synchronisé"
            }
            tone={summary.errors > 0 ? "negative" : summary.syncing > 0 ? "warning" : "positive"}
          />
        </dl>
      )}

      {/* Activité par année : la vue d'ensemble passe avant le détail des comptes. */}
      {!isLoading && <TransactionsPerYear transactions={transactions} className="mb-8 sm:mb-10" />}

      {/* Liste des comptes */}
      <section aria-labelledby="accounts-list-title">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="accounts-list-title" className="title text-xl text-foreground">
            Comptes connectés
          </h2>
          {hasAnyAccounts && (
            <span className="text-xs text-muted-foreground">
              {filteredAccounts.length === accountsWithTransactions.length
                ? `${accountsWithTransactions.length} compte${accountsWithTransactions.length > 1 ? "s" : ""}`
                : `${filteredAccounts.length} sur ${accountsWithTransactions.length}`}
            </span>
          )}
        </div>

        {/* Filtres & recherche */}
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1 md:order-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un compte, une adresse…"
              className="h-10 rounded-full border-line bg-card pl-10 pr-9 text-sm placeholder:text-muted-foreground focus-visible:ring-primary/40"
              aria-label="Rechercher un compte"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Effacer la recherche"
                className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 md:order-1">
            <div className="flex items-center gap-1.5" role="group" aria-label="Filtrer par type">
              <FilterChip label="Tous" active={typeFilter === "All"} onClick={() => setTypeFilter("All")} />
              <FilterChip label="API" active={typeFilter === "API"} onClick={() => setTypeFilter("API")} />
              <FilterChip label="Fichier" active={typeFilter === "File"} onClick={() => setTypeFilter("File")} />
            </div>
          </div>

          {/* Sur mobile la grille n'a qu'une colonne : le sélecteur n'y servirait à rien. */}
          <div
            role="tablist"
            aria-label="Affichage des comptes"
            className="hidden h-10 items-center rounded-full bg-muted p-1 md:order-3 md:flex"
          >
            <button
              role="tab"
              type="button"
              aria-label="Vue grille"
              aria-selected={viewMode === "grid"}
              onClick={() => setViewMode("grid")}
              className={cn(
                "flex h-8 w-10 cursor-pointer items-center justify-center rounded-full transition-colors",
                viewMode === "grid" ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              role="tab"
              type="button"
              aria-label="Vue liste"
              aria-selected={viewMode === "list"}
              onClick={() => setViewMode("list")}
              className={cn(
                "flex h-8 w-10 cursor-pointer items-center justify-center rounded-full transition-colors",
                viewMode === "list" ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ListIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className={cn(viewMode === "grid" ? "grid grid-cols-1 items-start gap-3 md:grid-cols-2" : "flex flex-col gap-3")}>
          {isLoading ? (
            <AccountsSkeleton />
          ) : !hasAnyAccounts ? (
            <EmptyState onAdd={() => setIsConnectOpen(true)} />
          ) : filteredAccounts.length === 0 ? (
            <NoResultsState query={searchQuery} onReset={() => { setSearchQuery(""); setTypeFilter("All") }} />
          ) : (
            filteredAccounts.map((account) => {
              const isRunning = account.health && account.health.kind !== "idle" && account.health.elapsedMs !== null
              const syncLabel = isRunning
                ? `en cours depuis ${formatElapsed(account.health!.elapsedMs!)}`
                : account.lastSync
              const isPaused = account.syncEnabled === false
              const typeLabel = account.type === "File" ? "Fichier" : "API"

              return (
                <Accordion
                  type="single"
                  collapsible
                  key={account.id}
                  className={cn(
                    "overflow-hidden rounded-2xl border bg-card transition-colors",
                    account.status === "error" ? "border-destructive/30" : "border-line hover:border-primary/30"
                  )}
                >
                  <AccordionItem value={account.id} className="border-none">
                    <AccordionTrigger className="items-center gap-3 rounded-none px-4 py-3.5 hover:bg-muted/30 hover:no-underline sm:px-5 [&>svg]:translate-y-0 [&>svg]:text-muted-foreground">
                      {/* min-w-0 : sans lui, la ligne refusait de rétrécir sous la
                          taille de son contenu et débordait de la carte sur mobile. */}
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar className="h-10 w-10 shrink-0 rounded-full border border-line bg-muted">
                          <AvatarImage src={account.iconUrl} alt="" />
                          <AvatarFallback className="text-xs font-semibold text-muted-foreground">
                            {(account.name ?? "??").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>

                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-[15px] font-bold text-foreground">{account.name}</span>
                            <span
                              className="num flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-line bg-surface px-1.5 text-[11px] text-muted-foreground"
                              title={`${account.subAccountsCount} sous-compte${account.subAccountsCount > 1 ? "s" : ""}`}
                            >
                              {account.subAccountsCount}
                            </span>
                            {account.health?.message && (
                              <AlertCircle className="h-4 w-4 shrink-0 text-chart-4" aria-label={account.health.message} />
                            )}
                          </div>
                          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="shrink-0">{typeLabel}</span>
                            <span aria-hidden>·</span>
                            <span className="shrink-0">
                              <span className="num">{account.transactionCount.toLocaleString("fr-FR")}</span> tx
                            </span>
                            <span aria-hidden className="hidden sm:inline">·</span>
                            <span className="hidden truncate sm:inline">{isPaused ? "En pause" : syncLabel}</span>
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {isPaused ? (
                          <span className="chip py-1 text-xs">En pause</span>
                        ) : account.missingKey ? (
                          <MissingKeyChip provider={account.missingKey} asLink={false} />
                        ) : (
                          <StatusBadge status={account.status} />
                        )}
                      </div>
                    </AccordionTrigger>

                    <AccordionContent className="px-0 pb-0">
                      {account.health?.message && (
                        <div className="flex flex-wrap items-center gap-3 border-y border-chart-4/30 bg-chart-4/5 px-4 py-3 sm:px-5">
                          <AlertCircle className="h-4 w-4 shrink-0 text-chart-4" />
                          <p className="min-w-0 flex-1 text-[13px] text-foreground">
                            {account.health.message}{" "}
                            <span className="text-muted-foreground">
                              {account.health.kind === "orphaned"
                                ? "Le compte est resté affiché en synchronisation ; l'arrêter le libère sans rien perdre."
                                : "Les données déjà importées sont conservées : une synchronisation reprise ne crée pas de doublon."}
                            </span>
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0 cursor-pointer gap-1.5"
                            onClick={() => void handleCancelSync(account.id as Id<"integrations">, account.name)}
                          >
                            <CircleStop className="h-3.5 w-3.5" />
                            Arrêter
                          </Button>
                        </div>
                      )}

                      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-line px-4 py-4 sm:grid-cols-4 sm:px-5">
                        <DetailField label="Identifiant" className="col-span-2">
                          <CopyableAddress address={account.addressOrId} />
                        </DetailField>
                        <DetailField label="Source">
                          <span className="inline-flex items-center gap-1.5">
                            {account.type === "File" ? (
                              <FileUp className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <KeyRound className="h-3.5 w-3.5 text-primary" />
                            )}
                            {account.type === "File" ? "Import de fichier" : "Clé API"}
                          </span>
                        </DetailField>
                        <DetailField label="Ouvert le">
                          {account.accountCreatedAt ?? <span className="text-faint">—</span>}
                        </DetailField>
                        <DetailField label="Transactions">
                          <Link
                            href={`/dashboard/transactions?integrationId=${account.id}`}
                            className="-mx-1 inline-flex items-center gap-1.5 rounded-md px-1 font-bold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                          >
                            <span className="num">{account.transactionCount.toLocaleString("fr-FR")}</span>
                            <span>voir</span>
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </Link>
                        </DetailField>
                        <DetailField label={isRunning ? "Synchronisation" : "Dernière synchro"}>
                          <span className="num text-[13px]">{syncLabel}</span>
                        </DetailField>
                        <DetailField label="Synchro auto" className="col-span-2 sm:col-span-1">
                          {account.type === "API" ? (
                            <label className="inline-flex cursor-pointer items-center gap-2">
                              <Switch
                                checked={!isPaused}
                                onCheckedChange={(checked) =>
                                  void handleToggleSync(account.id as Id<"integrations">, checked, account.name)
                                }
                                aria-label={`Synchronisation automatique de ${account.name}`}
                                className="cursor-pointer"
                              />
                              <span className="text-[13px]">{isPaused ? "En pause" : "Activée"}</span>
                            </label>
                          ) : (
                            // Les imports de fichiers n'ont pas d'API à interroger.
                            <span className="text-muted-foreground">Import manuel</span>
                          )}
                        </DetailField>
                        {account.missingKey && (
                          <DetailField label="Clé requise" className="col-span-2 sm:col-span-1">
                            <MissingKeyChip provider={account.missingKey} />
                          </DetailField>
                        )}
                      </dl>

                      <div className="flex items-center justify-between gap-2 border-t border-line bg-surface/50 px-4 py-2.5 sm:px-5">
                        <div className="min-w-0">
                          {/* Toujours offert pendant une synchronisation, pas
                              seulement quand elle devient suspecte. */}
                          {account.health?.canCancel && !account.health.message && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 cursor-pointer gap-1.5 px-2.5 text-[13px] text-muted-foreground hover:text-foreground"
                              onClick={() => void handleCancelSync(account.id as Id<"integrations">, account.name)}
                            >
                              <CircleStop className="h-3.5 w-3.5" />
                              Arrêter
                            </Button>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {account.type === "File" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 cursor-pointer gap-1.5 bg-card"
                              onClick={() => openImport(account)}
                            >
                              <FileUp className="h-3.5 w-3.5" />
                              Importer
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 cursor-pointer gap-1.5 bg-card"
                              disabled={account.status === "syncing"}
                              onClick={() => handleSyncAccount(account.id, account.platformId)}
                            >
                              <RefreshCw className={cn("h-3.5 w-3.5", account.status === "syncing" && "animate-spin")} />
                              Synchroniser
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Plus d'actions sur ${account.name}`}
                                className="h-8 w-8 cursor-pointer text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem
                                onClick={() => {
                                  setRenameTarget({ id: account.id as Id<"integrations">, name: account.name })
                                  setRenameValue(account.name)
                                }}
                                className="cursor-pointer"
                              >
                                <span className="text-sm">Renommer</span>
                              </DropdownMenuItem>
                              {account.type !== "File" && (<>
                              <DropdownMenuSeparator />
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
                              <DropdownMenuItem
                                onClick={() => handleSyncSpotTrades(account.id)}
                                disabled={account.status === "syncing"}
                                className="cursor-pointer"
                              >
                                <span className="text-sm">Sync Trades spot</span>
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
                                <span className="text-sm">Importer les exports (.xlsx, .csv)</span>
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
              )
            })
          )}
        </div>
      </section>

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

      <Dialog open={renameTarget !== null} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="max-w-sm gap-4">
          <DialogHeader className="space-y-1">
            <DialogTitle>Renommer le compte</DialogTitle>
            <DialogDescription className="text-xs">Laissez vide pour reprendre le nom de la plateforme.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault()
              if (!renameTarget) return
              const done = await withToast(
                () => renameIntegration({ integrationId: renameTarget.id, displayName: renameValue }),
                { loading: "Renommage…", success: "Compte renommé", error: "Échec du renommage" }
              )
              if (done) setRenameTarget(null)
            }}
          >
            <Input
              autoFocus
              value={renameValue}
              maxLength={80}
              onChange={(event) => setRenameValue(event.target.value)}
              aria-label="Nom du compte"
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRenameTarget(null)}>
                Annuler
              </Button>
              <Button type="submit">Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SummaryTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint: string
  tone?: "positive" | "negative" | "warning"
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-card px-3 py-3 sm:px-4">
      <dt className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-faint">{label}</dt>
      <dd className="num mt-1 truncate text-xl font-bold leading-tight text-foreground sm:text-2xl">{value}</dd>
      <dd
        className={cn(
          "mt-0.5 truncate text-[11px] sm:text-xs",
          tone === "negative"
            ? "font-semibold text-destructive"
            : tone === "warning"
              ? "font-semibold text-chart-4"
              : tone === "positive"
                ? "text-positive"
                : "text-muted-foreground"
        )}
      >
        {hint}
      </dd>
    </div>
  )
}

function DetailField({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-faint">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{children}</dd>
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
      className="group -mx-1 flex max-w-full cursor-pointer items-center gap-1.5 rounded-md px-1 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <span className="num truncate text-[13px]">{address}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-positive" />
      ) : (
        // Toujours visible : sur mobile, il n'y a pas de survol pour le révéler.
        <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
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
        "h-9 cursor-pointer rounded-full border px-3.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-line bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      {label}
    </button>
  )
}

/**
 * Signale la clé qui manque. En lien, renvoie vers la page où l'ajouter ;
 * sans lien quand la pastille est posée dans un bouton (en-tête d'accordéon).
 */
function MissingKeyChip({ provider, asLink = true }: { provider: string; asLink?: boolean }) {
  const content = (
    <>
      <KeyRound className="h-3 w-3" />
      Clé <span className="hidden sm:inline">{dataProviderLabel(provider)}</span> requise
    </>
  )
  if (!asLink) {
    return <span className="chip chip-violet whitespace-nowrap py-1 text-xs">{content}</span>
  }
  return (
    <Link
      href="/dashboard/settings/api-keys"
      className="chip chip-violet whitespace-nowrap py-1 text-xs hover:opacity-80"
    >
      {content}
    </Link>
  )
}

function StatusBadge({ status }: { status: AccountStatus }) {
  if (status === "synced") {
    return (
      <span className="chip chip-jade whitespace-nowrap py-1 text-xs">
        <Check className="h-3.5 w-3.5" />
        Synchronisé
      </span>
    )
  }
  if (status === "syncing") {
    return (
      <span className="chip whitespace-nowrap bg-chart-4/10 py-1 text-xs text-chart-4">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        <span className="hidden sm:inline">Synchronisation…</span>
        <span className="sm:hidden">En cours</span>
      </span>
    )
  }
  if (status === "error") {
    return (
      <span className="chip whitespace-nowrap bg-destructive/10 py-1 text-xs text-destructive">
        <AlertCircle className="h-3.5 w-3.5" />
        Erreur
      </span>
    )
  }
  if (status === "unsupported") {
    return (
      <span className="chip whitespace-nowrap py-1 text-xs">
        <X className="h-3.5 w-3.5" />
        Non supportée
      </span>
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
          className="flex animate-pulse items-center justify-between rounded-2xl border border-line bg-card px-4 py-3.5 sm:px-5"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted" />
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
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 rounded-2xl border border-dashed border-line bg-card/60">
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
    <div className="flex flex-col items-center justify-center text-center py-10 px-6 rounded-2xl border border-dashed border-line bg-card/60">
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