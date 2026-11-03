"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Columns3,
  Copy,
  Download,
  LoaderCircle,
  Plus,
  Search,
  X,
} from "lucide-react"
import { transactionsSheet } from "@/lib/export"
import { useDownloadCsv } from "@/components/dashboard/export-preferences"
import { useProviderDialog } from "@/components/dashboard/provider-dialog-context"
import { cn } from "@/lib/utils"
import { useCmcTokenMap } from "@/hooks/useCmcTokenMap"
import { useFxRates } from "@/hooks/useFxRates"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { type TransactionEntry, currencyFormatter } from "@/hooks/dashboard/useDashboardMetrics"
import { EUR_STABLECOINS, USD_STABLECOINS, isFiat, normalizeAsset, splitPair } from "@/lib/ledger"
import {
  REVIEW_REASON_LABELS,
  type ReviewReason,
  isTaxableDisposal,
  reviewReasons,
} from "@/lib/transaction-flags"

// ─── Formats ──────────────────────────────────────────────────────────────

const quantityLarge = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 })
const quantitySmall = new Intl.NumberFormat("fr-FR", { maximumSignificantDigits: 6 })
const eurFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Quantité lisible sans perte : au-delà de 1, quatre décimales suffisent ;
 * en deçà, six chiffres significatifs — sinon 0,00040509 BTC s'affichait
 * « 0,0004 », et toutes les petites lignes se ressemblaient.
 */
function formatQuantity(value: number): string {
  return Math.abs(value) >= 1 ? quantityLarge.format(value) : quantitySmall.format(value)
}

const priceLarge = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Prix lisible : deux décimales au-delà de 1, six chiffres significatifs en deçà. */
function formatPrice(value: number): string {
  return Math.abs(value) >= 1 ? priceLarge.format(value) : quantitySmall.format(value)
}

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "Confirmée",
  COMPLETED: "Confirmée",
  SUCCESS: "Confirmée",
  "1": "Confirmée",
  "6": "Confirmée",
  PENDING: "En attente",
  "0": "En attente",
  FAILED: "Échouée",
  REJECTED: "Refusée",
  CANCELLED: "Annulée",
}

/** « < 0,01 $ » plutôt que « 0,00 $ » : une valeur infime n'est pas nulle. */
function formatMoney(value: number | null, formatter: Intl.NumberFormat): string | null {
  if (value === null) return null
  if (value > 0 && value < 0.005) return `< ${formatter.format(0.01)}`
  return formatter.format(value)
}

/**
 * Numéro de transaction tel que la plateforme l'affiche : l'import préfixe
 * ses identifiants par la source (« bitstack:… », « convert:… ») pour les
 * rendre uniques ; le préfixe n'a pas de sens pour l'utilisateur.
 */
function platformReference(externalId: string | null | undefined): string | null {
  if (!externalId) return null
  const match = externalId.match(/^[a-z_]+:(.+)$/i)
  return match ? match[1] : externalId
}

// ─── Modèle de ligne ──────────────────────────────────────────────────────

type Kind = "trade" | "deposit" | "withdrawal"
type Flow = { quantity: number; currency: string }

type Row = {
  id: string
  kind: Kind
  label: string
  timestamp: number
  out?: Flow
  in?: Flow
  account: string
  price?: number
  priceCurrency?: string
  fee?: number
  feeAsset?: string
  valueUsd: number | null
  valueEur: number | null
  /** Valorisé au cours actuel faute d'historique pour cet actif. */
  approximate: boolean
  taxable: boolean
  reasons: ReviewReason[]
  externalId: string | null
  txId: string | null
  network: string | null
  status: string | null
}

const TRADE_LABELS: Record<string, string> = {
  CONVERT: "Conversion",
  DUST: "Conversion de poussière",
}

function tradeLabel(tx: Extract<TransactionEntry, { type: "trade" }>): string {
  if (tx.tradeType && TRADE_LABELS[tx.tradeType]) return TRADE_LABELS[tx.tradeType]
  if (tx.tradeType === "FIAT") return tx.side === "BUY" ? "Achat fiat" : "Vente fiat"
  return "Échange"
}

const isUsd = (asset: string) => asset === "USD" || USD_STABLECOINS.has(asset)
const isEur = (asset: string) => asset === "EUR" || EUR_STABLECOINS.has(asset)

/** Actifs à valoriser au cours actuel : ni dollar, ni euro, ni autre fiat. */
function needsSpotPrice(asset: string): boolean {
  const normalized = normalizeAsset(asset)
  return !isUsd(normalized) && !isEur(normalized) && !isFiat(normalized)
}

function valueOf(
  asset: string,
  quantity: number,
  eurPerUsd: number | null,
  spot: Record<string, number>,
): { usd: number | null; eur: number | null; approximate: boolean } {
  const normalized = normalizeAsset(asset)
  if (isUsd(normalized)) {
    return { usd: quantity, eur: eurPerUsd ? quantity * eurPerUsd : null, approximate: false }
  }
  if (isEur(normalized)) {
    return { usd: eurPerUsd ? quantity / eurPerUsd : null, eur: quantity, approximate: false }
  }
  const price = spot[normalized]
  if (price === undefined) return { usd: null, eur: null, approximate: false }
  const usd = quantity * price
  return { usd, eur: eurPerUsd ? usd * eurPerUsd : null, approximate: true }
}

// ─── Onglets, filtres, colonnes ───────────────────────────────────────────

type TabId = "all" | "taxable" | "review"

const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "Toutes" },
  { id: "taxable", label: "Imposables" },
  { id: "review", label: "À vérifier" },
]

const TAB_HINTS: Partial<Record<TabId, React.ReactNode>> = {
  taxable: (
    <>
      Cessions de crypto contre une monnaie ayant cours légal (art. 150 VH bis du CGI). Les échanges
      crypto contre crypto ne sont pas imposables. Le calcul qui fait foi est dans la{" "}
      <Link href="/dashboard/tax-report" className="font-bold text-foreground underline underline-offset-4">
        déclaration fiscale
      </Link>
      .
    </>
  ),
  review: (
    <>
      Lignes sans valorisation, à la paire non reconnue, ou petites entrées de moins d&apos;un centime —
      souvent des envois indésirables sur une adresse publique.
    </>
  ),
}

const KIND_OPTIONS: { value: Kind | "all"; label: string }[] = [
  { value: "all", label: "Tous les types" },
  { value: "trade", label: "Échanges" },
  { value: "deposit", label: "Entrées" },
  { value: "withdrawal", label: "Sorties" },
]

type ColumnId = "account" | "price" | "fee" | "usd" | "eur"

const OPTIONAL_COLUMNS: { id: ColumnId; label: string }[] = [
  { id: "account", label: "Compte" },
  { id: "price", label: "Prix unitaire" },
  { id: "fee", label: "Frais" },
  { id: "usd", label: "Montant USD" },
  { id: "eur", label: "Montant EUR" },
]

const HIDDEN_COLUMNS_KEY = "hashory:transactions:hidden-columns"
const PAGE_SIZE = 100

function readHiddenColumns(): ColumnId[] {
  try {
    const raw = window.localStorage.getItem(HIDDEN_COLUMNS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    const known = new Set(OPTIONAL_COLUMNS.map((column) => column.id))
    return Array.isArray(parsed) ? parsed.filter((id): id is ColumnId => known.has(id)) : []
  } catch {
    return []
  }
}

function writeHiddenColumns(ids: ColumnId[]) {
  try {
    window.localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify(ids))
  } catch {
    // Navigation privée ou stockage bloqué : le choix vaut pour la session.
  }
}

// ─── Vue ──────────────────────────────────────────────────────────────────

interface TransactionsViewProps {
  transactions: TransactionEntry[]
  isLoading?: boolean
  /** Jeton pré-sélectionné, par exemple depuis la palette de commandes. */
  initialSymbol?: string | null
}

export function TransactionsView({ transactions, isLoading, initialSymbol }: TransactionsViewProps) {
  const downloadCsv = useDownloadCsv()
  const { openDialog } = useProviderDialog()
  const { rateAt } = useFxRates()

  const [tab, setTab] = React.useState<TabId>("all")
  const [search, setSearch] = React.useState("")
  const [kindFilter, setKindFilter] = React.useState<Kind | "all">("all")
  const [tokenFilter, setTokenFilter] = React.useState(initialSymbol ? initialSymbol.toUpperCase() : "all")
  const [accountFilter, setAccountFilter] = React.useState("all")
  const [sort, setSort] = React.useState<{ key: "date" | "value"; dir: "asc" | "desc" }>({ key: "date", dir: "desc" })
  const [page, setPage] = React.useState(1)
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set())
  const [hiddenColumns, setHiddenColumns] = React.useState<ColumnId[]>([])
  const [detailId, setDetailId] = React.useState<string | null>(null)

  React.useEffect(() => {
    setHiddenColumns(readHiddenColumns())
  }, [])

  React.useEffect(() => {
    if (initialSymbol) setTokenFilter(initialSymbol.toUpperCase())
  }, [initialSymbol])

  const isVisible = (id: ColumnId) => !hiddenColumns.includes(id)
  const toggleColumn = (id: ColumnId, visible: boolean) => {
    setHiddenColumns((current) => {
      const next = visible ? current.filter((c) => c !== id) : [...current, id]
      writeHiddenColumns(next)
      return next
    })
  }

  // Cours actuels pour les actifs sans contre-valeur directe (transferts de
  // jetons, trades cotés en BTC/ETH/BNB).
  const spotAssets = React.useMemo(() => {
    const assets = new Set<string>()
    for (const tx of transactions) {
      if (tx.type === "trade") {
        const quote = splitPair(tx.symbol)?.quote
        if (quote && needsSpotPrice(quote)) assets.add(quote)
      } else if (tx.baseAsset && needsSpotPrice(tx.baseAsset)) {
        assets.add(normalizeAsset(tx.baseAsset))
      }
    }
    return [...assets].sort()
  }, [transactions])
  const spotKey = spotAssets.join(",")

  const [spot, setSpot] = React.useState<{ key: string; prices: Record<string, number> } | null>(null)

  React.useEffect(() => {
    if (!spotKey) return
    let cancelled = false
    fetch("/api/prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: spotKey.split(",").map((asset) => `${asset}USDT`) }),
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ symbol: string; price: string }>) => {
        if (cancelled) return
        const prices: Record<string, number> = {}
        for (const item of data) {
          const pair = item.symbol.toUpperCase()
          const parsed = parseFloat(item.price)
          if (pair.endsWith("USDT") && !Number.isNaN(parsed)) prices[pair.slice(0, -4)] = parsed
        }
        setSpot({ key: spotKey, prices })
      })
      .catch(() => {
        if (!cancelled) setSpot({ key: spotKey, prices: {} })
      })
    return () => {
      cancelled = true
    }
  }, [spotKey])

  const pricesLoaded = !spotKey || spot?.key === spotKey
  const spotPrices = React.useMemo(() => spot?.prices ?? {}, [spot])

  const rows = React.useMemo<Row[]>(() => {
    return transactions.map((tx) => {
      const timestamp = tx.type === "trade" ? tx.executedAt : tx.timestamp
      // Taux du jour de l'opération, issu de l'historique BCE.
      const eurPerUsd = rateAt(timestamp)?.eurPerUsd ?? null
      const account = tx.providerDisplayName

      if (tx.type === "trade") {
        const pair = splitPair(tx.symbol)
        const base = pair?.base ?? tx.baseAsset
        const quote = pair?.quote ?? "?"
        const quoteQty = tx.quoteQuantity ?? tx.price * tx.quantity
        const baseFlow = { quantity: tx.quantity, currency: base }
        const quoteFlow = { quantity: quoteQty, currency: quote }
        const out = tx.side === "BUY" ? quoteFlow : baseFlow
        const received = tx.side === "BUY" ? baseFlow : quoteFlow
        const value = pair ? valueOf(quote, quoteQty, eurPerUsd, spotPrices) : { usd: null, eur: null, approximate: false }
        return {
          id: tx.id,
          kind: "trade",
          label: tradeLabel(tx),
          timestamp,
          out,
          in: received,
          account,
          price: tx.price,
          priceCurrency: pair?.quote,
          fee: tx.fee,
          feeAsset: tx.feeAsset,
          valueUsd: value.usd,
          valueEur: value.eur,
          approximate: value.approximate,
          taxable: isTaxableDisposal(out, received),
          reasons: reviewReasons({ type: "trade", valueUsd: value.usd, pairKnown: !!pair, pricesLoaded }),
          externalId: platformReference(tx.externalId),
          txId: null,
          network: null,
          status: null,
        }
      }

      const flow = { quantity: tx.amount, currency: normalizeAsset(tx.baseAsset) }
      const value = valueOf(flow.currency, tx.amount, eurPerUsd, spotPrices)
      return {
        id: tx.id,
        kind: tx.type,
        label: tx.type === "deposit" ? "Entrée" : "Sortie",
        timestamp,
        out: tx.type === "withdrawal" ? flow : undefined,
        in: tx.type === "deposit" ? flow : undefined,
        account,
        // Une entrée aussi peut coûter : virement en euros, achat par carte.
        fee: tx.fee ?? undefined,
        feeAsset: flow.currency,
        valueUsd: value.usd,
        valueEur: value.eur,
        approximate: value.approximate,
        taxable: false,
        reasons: reviewReasons({ type: tx.type, valueUsd: value.usd, pairKnown: true, pricesLoaded }),
        externalId: platformReference(tx.externalId),
        txId: tx.txId,
        network: tx.network,
        status: tx.status,
      }
    })
  }, [transactions, rateAt, spotPrices, pricesLoaded])

  const tokenOptions = React.useMemo(() => {
    const tokens = new Set<string>()
    for (const row of rows) {
      if (row.out) tokens.add(row.out.currency)
      if (row.in) tokens.add(row.in.currency)
    }
    if (tokenFilter !== "all") tokens.add(tokenFilter)
    return [...tokens].filter((t) => t !== "?").sort()
  }, [rows, tokenFilter])

  const accountOptions = React.useMemo(() => [...new Set(rows.map((row) => row.account))].sort(), [rows])

  // Recherche et filtres d'abord : les compteurs des onglets suivent.
  const filtered = React.useMemo(() => {
    const query = search.trim().toUpperCase()
    return rows.filter((row) => {
      const currencies = [row.out?.currency, row.in?.currency].filter(Boolean) as string[]
      if (query && !currencies.some((c) => c.includes(query)) && !row.account.toUpperCase().includes(query)) return false
      if (kindFilter !== "all" && row.kind !== kindFilter) return false
      if (tokenFilter !== "all" && !currencies.includes(tokenFilter)) return false
      if (accountFilter !== "all" && row.account !== accountFilter) return false
      return true
    })
  }, [rows, search, kindFilter, tokenFilter, accountFilter])

  const counts = React.useMemo(
    () => ({
      all: filtered.length,
      taxable: filtered.filter((row) => row.taxable).length,
      review: filtered.filter((row) => row.reasons.length > 0).length,
    }),
    [filtered],
  )

  const visibleRows = React.useMemo(() => {
    const inTab =
      tab === "taxable" ? filtered.filter((row) => row.taxable)
      : tab === "review" ? filtered.filter((row) => row.reasons.length > 0)
      : filtered
    const sign = sort.dir === "asc" ? 1 : -1
    return [...inTab].sort((a, b) => {
      if (sort.key === "value") {
        // Les lignes sans valeur ferment la marche, quel que soit le sens.
        if (a.valueUsd === null || b.valueUsd === null) return a.valueUsd === null ? (b.valueUsd === null ? 0 : 1) : -1
        return sign * (a.valueUsd - b.valueUsd)
      }
      return sign * (a.timestamp - b.timestamp)
    })
  }, [filtered, tab, sort])

  const activeFilters = [kindFilter !== "all", tokenFilter !== "all", accountFilter !== "all", search.trim() !== ""].filter(Boolean).length

  // Tout changement de périmètre ramène en page 1 et vide la sélection.
  React.useEffect(() => {
    setPage(1)
    setSelected(new Set())
  }, [tab, search, kindFilter, tokenFilter, accountFilter])

  React.useEffect(() => {
    setPage(1)
  }, [sort])

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const pageRows = visibleRows.slice(pageStart, pageStart + PAGE_SIZE)

  const pageSelectedCount = pageRows.filter((row) => selected.has(row.id)).length
  const headerChecked: boolean | "indeterminate" =
    pageRows.length > 0 && pageSelectedCount === pageRows.length ? true : pageSelectedCount > 0 ? "indeterminate" : false

  const toggleRow = (id: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })

  const togglePage = (checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      for (const row of pageRows) {
        if (checked) next.add(row.id)
        else next.delete(row.id)
      }
      return next
    })

  const resetFilters = () => {
    setSearch("")
    setKindFilter("all")
    setTokenFilter("all")
    setAccountFilter("all")
  }

  const toggleSort = (key: "date" | "value") =>
    setSort((current) => (current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }))

  const exportRows = selected.size > 0 ? visibleRows.filter((row) => selected.has(row.id)) : visibleRows

  const handleExport = () => {
    // Quantités exactes et montants en nombres, pas les libellés arrondis de
    // l'écran : un tableur doit pouvoir faire ses propres sommes. Les
    // identifiants permettent de retrouver chaque ligne chez la plateforme.
    const sheetRows = exportRows.map((row) => {
      const date = new Date(row.timestamp)
      return {
        date: date.toLocaleDateString("fr-FR"),
        time: date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        label: row.label,
        outQuantity: row.out ? row.out.quantity : null,
        outCurrency: row.out?.currency ?? null,
        outAccount: row.out ? row.account : null,
        inQuantity: row.in ? row.in.quantity : null,
        inCurrency: row.in?.currency ?? null,
        inAccount: row.in ? row.account : null,
        price: row.price ?? null,
        fee: row.fee ?? null,
        feeAsset: row.feeAsset || null,
        amountUsd: row.valueUsd,
        amountEur: row.valueEur,
        externalId: row.externalId,
        txId: row.txId,
        id: row.id,
      }
    })
    // CSV au format des tableurs français (« ; », virgule décimale par
    // défaut, point si le profil le demande), comme les autres exports.
    downloadCsv(transactionsSheet(sheetRows, Date.now()))
  }

  const iconSymbols = React.useMemo(() => tokenOptions, [tokenOptions])
  const { getCmcIconUrl } = useCmcTokenMap(iconSymbols)

  const detail = detailId ? rows.find((row) => row.id === detailId) ?? null : null
  const hint = TAB_HINTS[tab]
  const hasRows = transactions.length > 0

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-card">
      {/* En-tête : onglets et actions */}
      <header className="flex flex-col gap-3 border-b border-line px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
        <div role="tablist" aria-label="Vue des transactions" className="no-scrollbar inline-flex w-full overflow-x-auto rounded-full bg-surface p-1 md:w-auto">
          {TABS.map(({ id, label }) => {
            const active = tab === id
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(id)}
                className={cn(
                  "inline-flex h-8 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-bold transition-colors md:flex-none",
                  active ? "bg-card text-foreground ring-1 ring-line" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
                <span
                  className={cn(
                    "num rounded-full px-1.5 text-xs leading-5",
                    active
                      ? id === "review" && counts.review > 0 ? "bg-violet-soft text-violet" : "bg-surface text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {counts[id]}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport} disabled={exportRows.length === 0} className="flex-1 md:flex-none">
            <Download />
            {selected.size > 0 ? "Exporter la sélection" : "Exporter"}
            <span className="num rounded-full bg-surface px-1.5 text-xs leading-5 text-muted-foreground">{exportRows.length}</span>
          </Button>
          <Button onClick={openDialog} className="flex-1 md:flex-none">
            <Plus />
            Ajouter<span className="hidden sm:inline">&nbsp;des transactions</span>
          </Button>
        </div>
      </header>

      {/* Barre d'outils : recherche, filtres, colonnes, pagination */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 md:px-5">
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Jeton ou compte…"
            aria-label="Rechercher un jeton ou un compte"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-full border border-border bg-card pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-[3px] focus:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
          />
          {search && (
            <button
              type="button"
              aria-label="Effacer la recherche"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <FilterSelect
          label="Type"
          value={kindFilter}
          onChange={(v) => setKindFilter(v as Kind | "all")}
          options={KIND_OPTIONS}
        />
        <FilterSelect
          label="Jeton"
          value={tokenFilter}
          onChange={setTokenFilter}
          options={[{ value: "all", label: "Tous les jetons" }, ...tokenOptions.map((t) => ({ value: t, label: t }))]}
        />
        {accountOptions.length > 1 && (
          <FilterSelect
            label="Compte"
            value={accountFilter}
            onChange={setAccountFilter}
            options={[{ value: "all", label: "Tous les comptes" }, ...accountOptions.map((a) => ({ value: a, label: a }))]}
          />
        )}
        {activeFilters > 0 && (
          <button type="button" onClick={resetFilters} className="px-2 text-sm font-bold text-muted-foreground hover:text-foreground">
            Réinitialiser
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="hidden md:inline-flex">
                <Columns3 />
                Colonnes
                {hiddenColumns.length > 0 && (
                  <span className="num rounded-full bg-surface px-1.5 text-xs leading-5 text-muted-foreground">
                    {OPTIONAL_COLUMNS.length - hiddenColumns.length}/{OPTIONAL_COLUMNS.length}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Colonnes affichées</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {OPTIONAL_COLUMNS.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={isVisible(column.id)}
                  onCheckedChange={(checked) => toggleColumn(column.id, checked === true)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {column.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span className="num whitespace-nowrap px-1">
              {visibleRows.length === 0
                ? "0"
                : `${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, visibleRows.length)} sur ${visibleRows.length}`}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Page précédente"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Page suivante"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>

      {hint && <p className="border-b border-line bg-surface px-4 py-2.5 text-[13px] leading-relaxed text-muted-foreground md:px-5">{hint}</p>}

      {selected.size > 0 && (
        <div className="flex items-center gap-3 border-b border-line bg-violet-soft px-4 py-2 text-sm md:px-5">
          <span className="font-bold text-violet">
            <span className="num">{selected.size}</span> sélectionnée{selected.size > 1 ? "s" : ""}
          </span>
          <button type="button" onClick={() => setSelected(new Set())} className="font-bold text-violet/80 hover:text-violet">
            Tout désélectionner
          </button>
        </div>
      )}

      {/* Table */}
      <div className="scrollbar-subtle min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <LoaderCircle className="size-7 animate-spin text-muted-foreground" />
          </div>
        ) : visibleRows.length === 0 ? (
          <EmptyState
            tab={tab}
            hasRows={hasRows}
            filtered={activeFilters > 0}
            onReset={resetFilters}
            onAdd={openDialog}
          />
        ) : (
          <>
            {/* Téléphone : une carte par opération. */}
            <ul className="divide-y divide-line md:hidden">
              {pageRows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setDetailId(row.id)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface"
                  >
                    <KindIcon kind={row.kind} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-bold text-foreground">{row.label}</span>
                        <span className="num shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
                          {formatDate(row.timestamp)} · {formatTime(row.timestamp)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] font-bold text-foreground">
                        {row.out && <FlowText flow={row.out} sign="-" />}
                        {row.out && row.in && <ArrowRight className="size-3 text-muted-foreground" />}
                        {row.in && <FlowText flow={row.in} sign="+" />}
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span className="flex min-w-0 items-center gap-2 truncate">
                          {row.account}
                          <RowFlags row={row} compact />
                        </span>
                        <MoneyValue value={row.valueEur ?? row.valueUsd} approximate={row.approximate} formatter={row.valueEur !== null ? eurFormatter : currencyFormatter} />
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            <table className="hidden w-full border-collapse text-left md:table">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-line">
                  <th className="w-12 py-3 pl-5 pr-2">
                    <Checkbox
                      aria-label="Sélectionner les lignes de la page"
                      checked={headerChecked}
                      onCheckedChange={(checked) => togglePage(checked === true)}
                      className="border-border"
                    />
                  </th>
                  <Th>Type</Th>
                  <Th aria-sort={sort.key === "date" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                    <SortButton active={sort.key === "date"} dir={sort.dir} onClick={() => toggleSort("date")}>Date</SortButton>
                  </Th>
                  <Th>Sortie</Th>
                  <th className="w-6" aria-hidden />
                  <Th>Entrée</Th>
                  {isVisible("account") && <Th>Compte</Th>}
                  {isVisible("price") && <Th align="right">Prix unitaire</Th>}
                  {isVisible("fee") && <Th align="right">Frais</Th>}
                  {isVisible("usd") && (
                    <Th align="right" aria-sort={sort.key === "value" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                      <SortButton active={sort.key === "value"} dir={sort.dir} onClick={() => toggleSort("value")} align="right">Montant USD</SortButton>
                    </Th>
                  )}
                  {isVisible("eur") && (
                    <Th align="right" className="pr-5">
                      {isVisible("usd") ? (
                        "Montant EUR"
                      ) : (
                        <SortButton active={sort.key === "value"} dir={sort.dir} onClick={() => toggleSort("value")} align="right">Montant EUR</SortButton>
                      )}
                    </Th>
                  )}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const isSelected = selected.has(row.id)
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setDetailId(row.id)}
                      className={cn(
                        "cursor-pointer border-b border-line transition-colors last:border-b-0",
                        isSelected ? "bg-violet-soft/50" : "hover:bg-surface",
                      )}
                    >
                      <td className="py-3 pl-5 pr-2" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label={`Sélectionner ${row.label} du ${formatDate(row.timestamp)}`}
                          checked={isSelected}
                          onCheckedChange={(checked) => toggleRow(row.id, checked === true)}
                          className="border-border"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <KindIcon kind={row.kind} />
                          <div className="flex flex-col">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setDetailId(row.id)
                              }}
                              className="text-left text-sm font-bold text-foreground hover:underline hover:underline-offset-4"
                            >
                              {row.label}
                            </button>
                            <RowFlags row={row} />
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <div className="num text-[13px] text-foreground">{formatDate(row.timestamp)}</div>
                        <div className="num text-[11px] text-muted-foreground">{formatTime(row.timestamp)}</div>
                      </td>
                      <td className="px-3 py-3">{row.out && <FlowCell flow={row.out} sign="-" iconUrl={getCmcIconUrl(row.out.currency)} />}</td>
                      <td className="w-6 text-center">
                        {row.out && row.in && <ArrowRight className="inline size-3.5 text-faint" aria-hidden />}
                      </td>
                      <td className="px-3 py-3">{row.in && <FlowCell flow={row.in} sign="+" iconUrl={getCmcIconUrl(row.in.currency)} />}</td>
                      {isVisible("account") && (
                        <td className="max-w-40 truncate px-3 py-3 text-[13px] text-muted-foreground">{row.account}</td>
                      )}
                      {isVisible("price") && (
                        <td className="whitespace-nowrap px-3 py-3 text-right">
                          {row.price != null ? (
                            <>
                              <span className="num text-[13px] text-foreground">{formatPrice(row.price)}</span>
                              {row.priceCurrency && <span className="ml-1 text-[11px] text-muted-foreground">{row.priceCurrency}</span>}
                            </>
                          ) : (
                            <Missing />
                          )}
                        </td>
                      )}
                      {isVisible("fee") && (
                        <td className="whitespace-nowrap px-3 py-3 text-right">
                          {row.fee ? (
                            <>
                              <span className="num text-[13px] text-foreground">{formatQuantity(row.fee)}</span>
                              {row.feeAsset && <span className="ml-1 text-[11px] text-muted-foreground">{row.feeAsset}</span>}
                            </>
                          ) : (
                            <Missing />
                          )}
                        </td>
                      )}
                      {isVisible("usd") && (
                        <td className="whitespace-nowrap px-3 py-3 text-right text-[13px] font-bold text-foreground">
                          <MoneyValue value={row.valueUsd} approximate={row.approximate} formatter={currencyFormatter} />
                        </td>
                      )}
                      {isVisible("eur") && (
                        <td className="whitespace-nowrap py-3 pl-3 pr-5 text-right text-[13px] font-bold text-foreground">
                          <MoneyValue value={row.valueEur} approximate={row.approximate} formatter={eurFormatter} />
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}
      </div>

      <TransactionDetail row={detail} iconUrl={getCmcIconUrl} onClose={() => setDetailId(null)} />
    </section>
  )
}

// ─── Petits composants ────────────────────────────────────────────────────

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
}

function Th({
  children,
  align = "left",
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" }) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap px-3 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground",
        align === "right" && "text-right",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  )
}

function SortButton({
  active,
  dir,
  onClick,
  align = "left",
  children,
}: {
  active: boolean
  dir: "asc" | "desc"
  onClick: () => void
  align?: "left" | "right"
  children: React.ReactNode
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 uppercase tracking-[0.14em] transition-colors hover:text-foreground",
        active && "text-foreground",
        align === "right" && "flex-row-reverse",
      )}
    >
      {children}
      <Icon className={cn("size-3.5", !active && "opacity-50")} aria-hidden />
    </button>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  const active = value !== "all"
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        className={cn(
          "h-9 rounded-full font-bold shadow-none",
          active ? "border-transparent bg-violet-soft text-violet [&_svg]:!text-violet" : "border-border bg-card",
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function KindIcon({ kind, className }: { kind: Kind; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full",
        kind === "trade" && "bg-violet-soft text-violet",
        kind === "deposit" && "bg-jade-soft text-jade",
        kind === "withdrawal" && "bg-surface text-slate",
        className,
      )}
    >
      {kind === "trade" && <ArrowLeftRight className="size-4" />}
      {kind === "deposit" && <ArrowDown className="size-4" />}
      {kind === "withdrawal" && <ArrowUp className="size-4" />}
    </span>
  )
}

function RowFlags({ row, compact }: { row: Row; compact?: boolean }) {
  if (!row.taxable && row.reasons.length === 0) return null
  return (
    <span className={cn("flex items-center gap-2 text-[11px] font-bold", !compact && "mt-0.5")}>
      {row.taxable && <span className="text-violet">Imposable</span>}
      {row.reasons.length > 0 && (
        <span className="inline-flex items-center gap-1 text-muted-foreground" title={row.reasons.map((r) => REVIEW_REASON_LABELS[r]).join(" · ")}>
          <CircleAlert className="size-3" aria-hidden />
          À vérifier
        </span>
      )}
    </span>
  )
}

// Devises fiat : pas d'icône CMC, on dessine le signe monétaire sur une pastille colorée.
const FIAT_ICONS: Record<string, { glyph: string; bg: string }> = {
  EUR: { glyph: "€", bg: "#003399" },
  USD: { glyph: "$", bg: "#2E7D32" },
  GBP: { glyph: "£", bg: "#5B2C83" },
  CHF: { glyph: "₣", bg: "#D52B1E" },
  JPY: { glyph: "¥", bg: "#BC002D" },
}

function TokenAvatar({ symbol, url, size = 28 }: { symbol: string; url: string | null | undefined; size?: number }) {
  const fiat = FIAT_ICONS[symbol.toUpperCase()]
  if (fiat) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size, backgroundColor: fiat.bg, fontSize: Math.round(size * 0.55) }}
        className="flex shrink-0 items-center justify-center rounded-full font-bold leading-none text-white"
      >
        {fiat.glyph}
      </span>
    )
  }
  if (url) {
    return <Image src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" />
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-surface text-[9px] font-bold text-slate"
    >
      {symbol.slice(0, 3)}
    </span>
  )
}

function FlowText({ flow, sign }: { flow: Flow; sign: "+" | "-" }) {
  return (
    <span className="whitespace-nowrap">
      <span className="num">
        {sign === "-" ? "−" : "+"}
        {formatQuantity(flow.quantity)}
      </span>{" "}
      <span className="text-muted-foreground">{flow.currency}</span>
    </span>
  )
}

function FlowCell({ flow, sign, iconUrl }: { flow: Flow; sign: "+" | "-"; iconUrl: string | null | undefined }) {
  return (
    <div className="flex items-center gap-2.5">
      <TokenAvatar symbol={flow.currency} url={iconUrl} />
      <span className={cn("text-[13px] font-bold", sign === "+" ? "text-foreground" : "text-slate")}>
        <FlowText flow={flow} sign={sign} />
      </span>
    </div>
  )
}

function Missing() {
  return <span className="text-faint">—</span>
}

function MoneyValue({
  value,
  approximate,
  formatter,
}: {
  value: number | null
  approximate: boolean
  formatter: Intl.NumberFormat
}) {
  const text = formatMoney(value, formatter)
  if (text === null) return <Missing />
  return (
    <span title={approximate ? "Valorisé au cours actuel, faute d'historique pour cet actif" : undefined}>
      {approximate && <span className="mr-0.5 font-normal text-muted-foreground">≈</span>}
      <span className="num">{text}</span>
    </span>
  )
}

function EmptyState({
  tab,
  hasRows,
  filtered,
  onReset,
  onAdd,
}: {
  tab: TabId
  hasRows: boolean
  filtered: boolean
  onReset: () => void
  onAdd: () => void
}) {
  if (!hasRows) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="title text-xl text-foreground">Aucune transaction pour l&apos;instant</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Connectez une plateforme ou importez un relevé : l&apos;historique apparaîtra ici.
        </p>
        <Button onClick={onAdd} className="mt-1">
          <Plus />
          Ajouter des transactions
        </Button>
      </div>
    )
  }
  const message =
    tab === "taxable" ? "Aucune cession imposable dans cette sélection."
    : tab === "review" ? "Rien à vérifier : toutes les lignes sont valorisées."
    : "Aucune transaction ne correspond à ces filtres."
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 px-6 text-center">
      {tab === "review" && <Check className="size-6 text-jade" aria-hidden />}
      <p className="text-sm text-muted-foreground">{message}</p>
      {filtered && (
        <Button variant="outline" size="sm" onClick={onReset}>
          Réinitialiser les filtres
        </Button>
      )}
    </div>
  )
}

// ─── Détail d'une transaction ─────────────────────────────────────────────

function TransactionDetail({
  row,
  iconUrl,
  onClose,
}: {
  row: Row | null
  iconUrl: (symbol: string) => string | null | undefined
  onClose: () => void
}) {
  return (
    <Sheet open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto bg-card p-0 sm:max-w-md">
        {row && (
          <>
            <SheetHeader className="border-b border-line p-6">
              <div className="flex items-center gap-3">
                <KindIcon kind={row.kind} />
                <div>
                  <SheetTitle className="title text-xl text-foreground">{row.label}</SheetTitle>
                  <SheetDescription className="num text-xs">
                    {new Date(row.timestamp).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-3 p-6">
              {row.out && <DetailFlow title="Sortie" flow={row.out} sign="-" iconUrl={iconUrl(row.out.currency)} />}
              {row.in && <DetailFlow title="Entrée" flow={row.in} sign="+" iconUrl={iconUrl(row.in.currency)} />}

              {row.taxable && (
                <p className="rounded-2xl bg-violet-soft p-4 text-[13px] leading-relaxed text-violet">
                  <span className="font-bold">Cession imposable.</span> Elle entre dans le calcul de votre{" "}
                  <Link href="/dashboard/tax-report" className="font-bold underline underline-offset-4">
                    déclaration fiscale
                  </Link>
                  .
                </p>
              )}
              {row.reasons.length > 0 && (
                <div className="rounded-2xl bg-surface p-4 text-[13px] leading-relaxed text-muted-foreground">
                  <p className="mb-1 flex items-center gap-1.5 font-bold text-foreground">
                    <CircleAlert className="size-3.5" aria-hidden /> À vérifier
                  </p>
                  <ul className="list-disc pl-5">
                    {row.reasons.map((reason) => (
                      <li key={reason}>{REVIEW_REASON_LABELS[reason]}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <dl className="divide-y divide-line border-t border-line px-6 text-sm">
              <DetailItem label="Compte">{row.account}</DetailItem>
              {row.network && <DetailItem label="Réseau">{row.network}</DetailItem>}
              {row.status && <DetailItem label="Statut">{STATUS_LABELS[row.status.toUpperCase()] ?? row.status}</DetailItem>}
              {row.price != null && (
                <DetailItem label="Prix unitaire">
                  <span className="num">{formatPrice(row.price)}</span> {row.priceCurrency}
                </DetailItem>
              )}
              <DetailItem label="Frais">
                {row.fee ? (
                  <>
                    <span className="num">{formatQuantity(row.fee)}</span> {row.feeAsset}
                  </>
                ) : (
                  <Missing />
                )}
              </DetailItem>
              <DetailItem label="Montant USD">
                <MoneyValue value={row.valueUsd} approximate={row.approximate} formatter={currencyFormatter} />
              </DetailItem>
              <DetailItem label="Montant EUR" note="Change BCE du jour de l'opération">
                <MoneyValue value={row.valueEur} approximate={row.approximate} formatter={eurFormatter} />
              </DetailItem>
              {row.externalId && row.externalId !== row.txId && (
                <DetailItem label="N° chez la plateforme">
                  <CopyValue value={row.externalId} />
                </DetailItem>
              )}
              {row.txId && (
                <DetailItem label="Hash on-chain">
                  <CopyValue value={row.txId} />
                </DetailItem>
              )}
              <DetailItem label="ID Hashory">
                <CopyValue value={row.id} />
              </DetailItem>
            </dl>
            {row.approximate && (
              <p className="px-6 pb-6 pt-3 text-xs text-muted-foreground">
                ≈ Valorisé au cours actuel, faute d&apos;historique de prix pour cet actif.
              </p>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function DetailFlow({ title, flow, sign, iconUrl }: { title: string; flow: Flow; sign: "+" | "-"; iconUrl: string | null | undefined }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line p-4">
      <TokenAvatar symbol={flow.currency} url={iconUrl} size={36} />
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
        <p className="text-base font-bold text-foreground">
          <FlowText flow={flow} sign={sign} />
        </p>
      </div>
    </div>
  )
}

function DetailItem({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="shrink-0 text-muted-foreground">
        {label}
        {note && <span className="block text-[11px] text-faint">{note}</span>}
      </dt>
      <dd className="min-w-0 text-right font-bold text-foreground">{children}</dd>
    </div>
  )
}

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false)
  const copy = () => {
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copier ${value}`}
      className="group inline-flex max-w-full items-center gap-1.5 text-right hover:text-violet"
    >
      <span className="num truncate text-xs font-normal">{value}</span>
      {copied ? <Check className="size-3.5 shrink-0 text-jade" /> : <Copy className="size-3.5 shrink-0 text-muted-foreground group-hover:text-violet" />}
    </button>
  )
}
