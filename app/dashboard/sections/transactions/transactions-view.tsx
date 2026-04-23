"use client"

import * as React from "react"
import Image from "next/image"
import { ArrowRight, ArrowLeftRight, Download, Filter, Plus, Eye, LoaderCircle, ArrowUpDown, Search, X } from "lucide-react"
import * as XLSX from "xlsx"
import { cn } from "@/lib/utils"
import { useCmcTokenMap } from "@/hooks/useCmcTokenMap"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { type TransactionEntry, numberFormatter, currencyFormatter } from "@/hooks/dashboard/useDashboardMetrics"

// Helper pour extraire le quote asset (réutilisé de votre logique existante)
const QUOTE_ASSETS = [
  "USDT", "USDC", "BUSD", "USD", "FDUSD", "TUSD", "DAI",
  "BTC", "ETH", "BNB", "EUR", "GBP", "TRY", "AUD", "CAD", "BRL"
];

function extractQuoteAsset(symbol: string): string {
  const upper = symbol.toUpperCase();
  for (const quote of QUOTE_ASSETS) {
    if (upper.endsWith(quote)) {
      return quote;
    }
  }
  return "UNKNOWN";
}

interface TransactionsViewProps {
  transactions: TransactionEntry[];
  isLoading?: boolean;
  symbolFilter?: string;
  onSymbolFilterChange?: (value: string) => void;
  availableSymbols?: string[];
}

export function TransactionsView({
  transactions,
  isLoading,
  symbolFilter = "all",
  onSymbolFilterChange,
  availableSymbols = [],
}: TransactionsViewProps) {
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = React.useState(1);
  const [isFilterDialogOpen, setIsFilterDialogOpen] = React.useState(false);
  const [tempSymbolFilter, setTempSymbolFilter] = React.useState(symbolFilter);
  const [tokenSearch, setTokenSearch] = React.useState("");
  const [assetPrices, setAssetPrices] = React.useState<Record<string, number>>({});

  const USD_STABLES = React.useMemo(() => new Set([
    "USDT", "USDC", "BUSD", "USD", "FDUSD", "TUSD", "DAI",
  ]), []);

  const nonTradeAssets = React.useMemo(() => {
    const set = new Set<string>();
    for (const tx of transactions) {
      if (tx.type === 'deposit' || tx.type === 'withdrawal') {
        const asset = tx.baseAsset?.toUpperCase();
        if (asset && !USD_STABLES.has(asset)) {
          set.add(asset);
        }
      }
    }
    return Array.from(set);
  }, [transactions, USD_STABLES]);

  React.useEffect(() => {
    if (nonTradeAssets.length === 0) return;
    let cancelled = false;
    const pairs = nonTradeAssets.map((asset) => `${asset}USDT`);

    fetch('/api/prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: pairs }),
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ symbol: string; price: string }>) => {
        if (cancelled) return;
        const prices: Record<string, number> = {};
        for (const item of data) {
          const pair = item.symbol.toUpperCase();
          if (pair.endsWith('USDT')) {
            const asset = pair.slice(0, -4);
            const parsed = parseFloat(item.price);
            if (!isNaN(parsed)) prices[asset] = parsed;
          }
        }
        setAssetPrices(prices);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [nonTradeAssets]);
  const allSymbols = React.useMemo(() => {
    const symbols = new Set<string>();
    for (const tx of transactions) {
      if (tx.baseAsset) symbols.add(tx.baseAsset);
      if (tx.type === 'trade') {
        symbols.add(extractQuoteAsset(tx.symbol));
      }
    }
    return [...symbols];
  }, [transactions]);
  const { getCmcIconUrl } = useCmcTokenMap(allSymbols);
  const itemsPerPage = 100;

  // Transformation des données pour l'affichage
  const mappedTransactions = React.useMemo(() => {
    return transactions.map(tx => {
      const dateObj = new Date(tx.type === 'trade' ? tx.executedAt : tx.timestamp);
      // Formatage français pour correspondre au design
      const date = dateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' });
      const time = dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      
      let label = "Transaction";
      let type: "trade" | "deposit" | "withdrawal" = "trade";
      type TxDisplay = { amount: string; currency: string; account: string; address?: string };
      let outTx: TxDisplay | undefined = undefined;
      let inTx: TxDisplay | undefined = undefined;

      if (tx.type === 'trade') {
        type = 'trade';
        const tradeType = tx.tradeType;
        if (tradeType === "CONVERT") {
          label = "Conversion";
        } else if (tradeType === "FIAT") {
          label = "Achat fiat";
        } else if (tradeType === "DUST") {
          label = "Dust";
        } else {
          label = "Trade spot";
        }
        const quoteAsset = extractQuoteAsset(tx.symbol);
        const quoteQty = tx.quoteQuantity ?? (tx.price * tx.quantity);

        if (tx.side === 'BUY') {
            // Achat: Sortie Quote -> Entrée Base
            outTx = { amount: numberFormatter.format(quoteQty), currency: quoteAsset, account: tx.providerDisplayName, address: undefined };
            inTx = { amount: numberFormatter.format(tx.quantity), currency: tx.baseAsset, account: tx.providerDisplayName, address: undefined };
        } else {
            // Vente: Sortie Base -> Entrée Quote
            outTx = { amount: numberFormatter.format(tx.quantity), currency: tx.baseAsset, account: tx.providerDisplayName, address: undefined };
            inTx = { amount: numberFormatter.format(quoteQty), currency: quoteAsset, account: tx.providerDisplayName, address: undefined };
        }
      } else if (tx.type === 'deposit') {
        type = 'deposit';
        label = "Entrée";
        inTx = { amount: numberFormatter.format(tx.amount), currency: tx.baseAsset, account: tx.providerDisplayName, address: undefined };
      } else if (tx.type === 'withdrawal') {
        type = 'withdrawal';
        label = "Sortie";
        outTx = { amount: numberFormatter.format(tx.amount), currency: tx.baseAsset, account: tx.providerDisplayName, address: undefined };
      }

      // Calculer le montant pour tri et affichage
      let amount = 0;
      let amountDisplay = "";
      let amountEur: number | null = null;
      const EUR_USD = 1 / 0.92; // taux approx EUR→USD

      if (tx.type === 'trade') {
        const quoteQty = tx.quoteQuantity ?? (tx.price * tx.quantity);
        const quoteAsset = extractQuoteAsset(tx.symbol ?? "");
        const quoteIsEur = quoteAsset === "EUR";
        if (quoteIsEur) {
          // quoteQty est en EUR : convertir en USD pour la colonne USD
          amount = quoteQty * EUR_USD;
          amountEur = quoteQty;
        } else {
          amount = quoteQty; // USD/stablecoin
          amountEur = quoteQty * 0.92;
        }
        amountDisplay = currencyFormatter.format(amount);
      } else if (tx.type === 'deposit' || tx.type === 'withdrawal') {
        const asset = tx.baseAsset?.toUpperCase() ?? "";
        const priceUsd = USD_STABLES.has(asset) ? 1 : assetPrices[asset];
        if (priceUsd !== undefined) {
          amount = tx.amount * priceUsd;
          amountDisplay = currencyFormatter.format(amount);
          amountEur = amount * 0.92;
        } else {
          amount = 0;
          amountDisplay = "-";
        }
      }

      const timestamp = tx.type === 'trade' ? tx.executedAt : tx.timestamp;

      // Get provider icon based on provider name
      const getProviderIcon = (provider: string) => {
        if (provider.toLowerCase().includes('binance')) {
          return '🟡'; // Binance yellow
        }
        return '⚪'; // Default white
      };

      // Price & fee details
      let price: number | undefined;
      let fee: number | undefined;
      let feeAsset: string | undefined;

      if (tx.type === 'trade') {
        price = tx.price;
        fee = tx.fee;
        feeAsset = tx.feeAsset;
      } else if (tx.type === 'withdrawal') {
        fee = tx.fee;
        feeAsset = tx.baseAsset;
      }

      return {
        id: tx.id,
        type,
        label,
        date,
        time,
        out: outTx,
        in: inTx,
        amount,
        amountDisplay,
        amountEur,
        timestamp,
        price,
        fee,
        feeAsset,
        provider: tx.type === 'trade' ? tx.providerDisplayName : (tx.type === 'deposit' ? tx.providerDisplayName : tx.providerDisplayName),
        providerIcon: getProviderIcon(tx.type === 'trade' ? tx.providerDisplayName : (tx.type === 'deposit' ? tx.providerDisplayName : tx.providerDisplayName)),
      };
    });
  }, [transactions, assetPrices, USD_STABLES]);

  // Appliquer la recherche par token puis le tri
  const sortedTransactions = React.useMemo(() => {
    let filtered = mappedTransactions;

    if (tokenSearch.trim()) {
      const search = tokenSearch.trim().toUpperCase();
      filtered = filtered.filter((tx) => {
        const outMatch = tx.out?.currency?.toUpperCase().includes(search);
        const inMatch = tx.in?.currency?.toUpperCase().includes(search);
        return outMatch || inMatch;
      });
    }

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      const diff = b.timestamp - a.timestamp;
      return sortOrder === 'asc' ? -diff : diff;
    });
    return sorted;
  }, [mappedTransactions, sortOrder, tokenSearch]);

  const toggleDateSort = () => {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
  };

  // Calculer la pagination
  const totalPages = Math.ceil(sortedTransactions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedTransactions = sortedTransactions.slice(startIndex, startIndex + itemsPerPage);

  const goToPreviousPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const goToNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  // Réinitialiser à la première page si le tri ou la recherche change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [sortOrder, tokenSearch]);

  const handleExport = () => {
    // Préparer les données pour l'export
    const exportData = sortedTransactions.map((tx) => ({
      'Date': tx.date,
      'Heure': tx.time,
      'Type de transaction': tx.label,
      'Sortie': tx.out ? `-${tx.out.amount} ${tx.out.currency}` : '',
      'Plateforme Sortie': tx.out?.account || '',
      'Entrée': tx.in ? `+${tx.in.amount} ${tx.in.currency}` : '',
      'Plateforme Entrée': tx.in?.account || '',
      'Prix unitaire': tx.price != null ? tx.price : '',
      'Fee': tx.fee != null ? tx.fee : '',
      'Fee Asset': tx.feeAsset || '',
      'Montant': tx.amountDisplay,
    }));

    // Créer un workbook et une feuille
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');

    // Ajuster la largeur des colonnes
    ws['!cols'] = [
      { wch: 12 }, // Date
      { wch: 10 }, // Heure
      { wch: 18 }, // Type
      { wch: 20 }, // Sortie
      { wch: 18 }, // Plateforme Sortie
      { wch: 20 }, // Entrée
      { wch: 18 }, // Plateforme Entrée
      { wch: 15 }, // Montant
    ];

    // Générer le fichier
    const filename = `transactions_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  return (
    <div className="flex flex-col h-full bg-muted/40 font-sans rounded-xl overflow-hidden border border-border">
      {/* Header Tabs & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between shrink-0 bg-muted/40">
        {/* Tabs */}
        <div className="flex border-b md:border-b-0 border-border w-full md:w-auto overflow-x-auto">
          <Tab label="Transactions" count={sortedTransactions.length} active />
          <Tab label="Transactions imposables" count={0} />
          <Tab label="Corrections" count={1} />
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-1 justify-end bg-muted/40">
          <Button
            variant="outline"
            className="bg-card border-border text-foreground hover:bg-muted h-9 text-sm font-medium shadow-sm"
            onClick={handleExport}
          >
            <Download className="w-4 h-4 mr-2 text-foreground" />
            Exporter
            <span className="ml-2 bg-muted/40 border border-border rounded-full px-2 py-0.5 text-xs text-foreground">{sortedTransactions.length}</span>
          </Button>
          <Button className="bg-primary/15 text-primary hover:bg-primary/25 border-none h-9 text-sm font-medium shadow-none">
            <Plus className="w-4 h-4 mr-2" />
            Ajouter des transactions
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex items-center justify-between px-5 h-14 bg-card border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          {/* Recherche par token */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher un token..."
              value={tokenSearch}
              onChange={(e) => setTokenSearch(e.target.value)}
              className="h-9 w-48 pl-8 pr-8 rounded border border-border bg-muted/40 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            {tokenSearch && (
              <button
                onClick={() => setTokenSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              setTempSymbolFilter(symbolFilter);
              setIsFilterDialogOpen(true);
            }}
            className="bg-muted/40 text-foreground hover:bg-muted h-9 text-sm font-medium border border-border"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filtres
            <span className="ml-2 bg-primary text-white rounded-full px-1.5 py-0.5 text-[10px] leading-none">
              {symbolFilter !== "all" || tokenSearch ? "1" : "0"}
            </span>
          </Button>
          <Button variant="ghost" className="bg-muted/40 text-foreground hover:bg-muted h-9 text-sm font-medium border border-border">
            <Eye className="w-4 h-4 mr-2" />
            Affichage
            <span className="ml-2 bg-primary text-white rounded-full px-1.5 py-0.5 text-[10px] leading-none">2</span>
          </Button>
        </div>
        
        {/* Pagination simple */}
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">Page {currentPage} sur {totalPages || 1}</span>
          <div className="flex items-center gap-1">
             <Button
               variant="ghost"
               size="icon"
               className="h-8 w-8"
               disabled={currentPage === 1}
               onClick={goToPreviousPage}
             >
               <ArrowRight className="w-4 h-4 rotate-180" />
             </Button>
             <Button
               variant="ghost"
               size="icon"
               className="h-8 w-8"
               disabled={currentPage === totalPages || totalPages === 0}
               onClick={goToNextPage}
             >
               <ArrowRight className="w-4 h-4" />
             </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card flex-1 min-h-0 overflow-auto">
        {isLoading ? (
            <div className="flex h-64 items-center justify-center">
                <LoaderCircle className="w-8 h-8 animate-spin text-primary" />
            </div>
        ) : sortedTransactions.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
                Aucune transaction trouvée.
            </div>
        ) : (
        <table className="w-full text-left border-collapse">
          <thead className="bg-card sticky top-0 z-10 shadow-sm">
            <tr className="border-b border-border h-10">
              <th className="w-12 px-4 py-2 bg-card"><Checkbox className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary" /></th>
              <th className="w-10 px-2 py-2 bg-card"></th>
              <th className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-card">Type de transaction</th>
              <th className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-card">
                <button
                  onClick={toggleDateSort}
                  className="flex items-center gap-1.5 hover:text-primary transition-colors"
                >
                  Date
                  <ArrowUpDown className="w-3.5 h-3.5 opacity-60" />
                </button>
              </th>
              <th className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-card">Sortie</th>
              <th className="w-10 px-2 py-2 bg-card"></th>
              <th className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-card">Entrée</th>
              <th className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right bg-card">Prix unitaire</th>
              <th className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right bg-card">Fee</th>
              <th className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right bg-card">Montant USD</th>
              <th className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right bg-card">Montant EUR</th>
            </tr>
          </thead>
          <tbody>
            {paginatedTransactions.map((tx) => (
              <tr key={tx.id} className="border-b border-border hover:bg-muted group cursor-pointer h-[52px] transition-colors">
                <td className="px-4 py-2"><Checkbox className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary" /></td>
                <td className="px-2 py-2">
                  {/* Warning icon placeholder if needed */}
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center bg-muted",
                        tx.type === 'trade' && "bg-blue-500/10",
                        tx.type === 'deposit' && "bg-emerald-500/10",
                        tx.type === 'withdrawal' && "bg-destructive/10"
                    )}>
                        {tx.type === 'trade' && <ArrowLeftRight className="w-4 h-4 text-blue-500 dark:text-blue-400" />}
                        {tx.type === 'deposit' && <ArrowRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400 rotate-90" />}
                        {tx.type === 'withdrawal' && <ArrowRight className="w-4 h-4 text-destructive -rotate-90" />}
                    </div>
                    <span className="text-sm font-bold text-foreground">{tx.label}</span>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-foreground">{tx.date}</span>
                    <span className="text-[11px] text-muted-foreground">{tx.time}</span>
                  </div>
                </td>
                <td className="px-4 py-2">
                  {tx.out && (
                    <div className="flex items-center gap-3">
                      {getCmcIconUrl(tx.out.currency) ? (
                        <Image
                          src={getCmcIconUrl(tx.out.currency)!}
                          alt={tx.out.currency}
                          width={32}
                          height={32}
                          className="rounded-full shrink-0 object-cover"
                        />
                      ) : null}
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-semibold text-foreground whitespace-nowrap">{`-${tx.out.amount} ${tx.out.currency}`}</span>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-[2px] bg-[#F3BA2F]" title="Binance"></div>
                          <span className="text-[11px] text-muted-foreground">{tx.out.account}</span>
                        </div>
                        {tx.out.address && (
                          <span className="text-[10px] text-muted-foreground font-mono">{tx.out.address.slice(0, 20)}...</span>
                        )}
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-2 py-2 text-center">
                    {tx.out && tx.in && <ArrowRight className="w-4 h-4 text-muted-foreground" />}
                </td>
                <td className="px-4 py-2">
                  {tx.in && (
                    <div className="flex items-center gap-3">
                      {getCmcIconUrl(tx.in.currency) ? (
                        <Image
                          src={getCmcIconUrl(tx.in.currency)!}
                          alt={tx.in.currency}
                          width={32}
                          height={32}
                          className="rounded-full shrink-0 object-cover"
                        />
                      ) : null}
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-semibold text-foreground whitespace-nowrap">{`+${tx.in.amount} ${tx.in.currency}`}</span>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-[2px] bg-[#F3BA2F]" title="Binance"></div>
                          <span className="text-[11px] text-muted-foreground">{tx.in.account}</span>
                        </div>
                        {tx.in.address && (
                          <span className="text-[10px] text-muted-foreground font-mono">{tx.in.address.slice(0, 20)}...</span>
                        )}
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <span className="text-sm font-medium text-foreground">
                    {tx.price != null ? numberFormatter.format(tx.price) : "-"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  {tx.fee != null ? (
                    <div className="flex flex-col items-end">
                      <span className="text-sm font-medium text-foreground">{numberFormatter.format(tx.fee)}</span>
                      {tx.feeAsset && <span className="text-[11px] text-muted-foreground">{tx.feeAsset}</span>}
                    </div>
                  ) : (
                    <span className="text-sm font-medium text-foreground">-</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <span className="text-sm font-medium text-foreground">{tx.amountDisplay}</span>
                </td>
                <td className="px-4 py-2 text-right">
                  <span className="text-sm font-medium text-foreground">
                    {tx.amountEur != null && tx.amountEur > 0 ? `€${tx.amountEur.toFixed(2)}` : "-"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>

      {/* Filters Modal Dialog */}
      <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
        <DialogContent className="sm:max-w-[500px] bg-card">
          <DialogHeader className="pb-4">
            <DialogTitle className="text-xl font-bold text-foreground">Filtres</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Filter Section - Jeton */}
            <div className="space-y-3">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Jeton</label>
              <select
                value={tempSymbolFilter}
                onChange={(e) => setTempSymbolFilter(e.target.value)}
                className="w-full h-10 px-3 rounded border border-border bg-card text-sm text-foreground hover:border-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="all">Tous les jetons</option>
                {availableSymbols.map((symbol) => (
                  <option key={symbol} value={symbol}>
                    {symbol}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Divider */}
          <div className="my-6 h-px bg-border" />

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => {
                setTempSymbolFilter("all");
                onSymbolFilterChange?.("all");
                setIsFilterDialogOpen(false);
              }}
              className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Effacer les filtres
            </button>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setIsFilterDialogOpen(false)}
                className="bg-card border-border text-foreground hover:bg-muted/40"
              >
                Annuler
              </Button>
              <Button
                onClick={() => {
                  onSymbolFilterChange?.(tempSymbolFilter);
                  setIsFilterDialogOpen(false);
                }}
                className="bg-primary hover:bg-primary/90 text-white"
              >
                Appliquer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Tab({ label, count, active }: { label: string, count: number, active?: boolean }) {
    return (
        <div className={cn(
            "flex flex-col justify-center h-14 px-5 border-r border-border cursor-pointer transition-colors relative min-w-fit", 
            active ? "bg-card" : "bg-muted/40 hover:bg-muted"
        )}>
            {active && (
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-primary/30 rounded-b-[5px]" />
            )}
            <div className="flex items-center gap-2 mt-1">
                <span className={cn("text-sm", active ? "font-medium text-foreground" : "text-muted-foreground")}>
                    {label}
                </span>
                <span className={cn(
                    "text-xs font-medium px-1.5 py-0.5 rounded-full border", 
                    active 
                        ? "bg-card border-primary/50 text-foreground" 
                        : "border-border text-muted-foreground"
                )}>
                    {count}
                </span>
            </div>
        </div>
    )
}