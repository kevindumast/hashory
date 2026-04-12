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

      if (tx.type === 'trade') {
        const quoteQty = tx.quoteQuantity ?? (tx.price * tx.quantity);
        amount = quoteQty;
        amountDisplay = currencyFormatter.format(quoteQty);
      } else if (tx.type === 'deposit' || tx.type === 'withdrawal') {
        amount = tx.amount;
        amountDisplay = currencyFormatter.format(tx.amount);
      }

      const timestamp = tx.type === 'trade' ? tx.executedAt : tx.timestamp;

      // Get provider icon based on provider name
      const getProviderIcon = (provider: string) => {
        if (provider.toLowerCase().includes('binance')) {
          return '🟡'; // Binance yellow
        }
        return '⚪'; // Default white
      };

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
        timestamp,
        provider: tx.type === 'trade' ? tx.providerDisplayName : (tx.type === 'deposit' ? tx.providerDisplayName : tx.providerDisplayName),
        providerIcon: getProviderIcon(tx.type === 'trade' ? tx.providerDisplayName : (tx.type === 'deposit' ? tx.providerDisplayName : tx.providerDisplayName)),
      };
    });
  }, [transactions]);

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
    <div className="flex flex-col h-full bg-[#f8f9fc] font-sans rounded-xl overflow-hidden border border-[#d4d8e1]">
      {/* Header Tabs & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between shrink-0 bg-[#f8f9fc]">
        {/* Tabs */}
        <div className="flex border-b md:border-b-0 border-[#d4d8e1] w-full md:w-auto overflow-x-auto">
          <Tab label="Transactions" count={sortedTransactions.length} active />
          <Tab label="Transactions imposables" count={0} />
          <Tab label="Corrections" count={1} />
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#d4d8e1] flex-1 justify-end bg-[#f8f9fc]">
          <Button
            variant="outline"
            className="bg-white border-[#d4d8e1] text-[#1e2029] hover:bg-[#eff0f3] h-9 text-sm font-medium shadow-sm"
            onClick={handleExport}
          >
            <Download className="w-4 h-4 mr-2 text-[#1e2029]" />
            Exporter
            <span className="ml-2 bg-[#f8f9fc] border border-[#d4d8e1] rounded-full px-2 py-0.5 text-xs text-[#3b414f]">{sortedTransactions.length}</span>
          </Button>
          <Button className="bg-[#e0dcff] text-[#503bff] hover:bg-[#d0ccff] border-none h-9 text-sm font-medium shadow-none">
            <Plus className="w-4 h-4 mr-2" />
            Ajouter des transactions
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex items-center justify-between px-5 h-14 bg-white border-b border-[#d4d8e1] shrink-0">
        <div className="flex items-center gap-2">
          {/* Recherche par token */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#808594]" />
            <input
              type="text"
              placeholder="Rechercher un token..."
              value={tokenSearch}
              onChange={(e) => setTokenSearch(e.target.value)}
              className="h-9 w-48 pl-8 pr-8 rounded border border-[#d4d8e1] bg-[#f8f9fc] text-sm text-[#1e2029] placeholder:text-[#808594] focus:outline-none focus:ring-2 focus:ring-[#503bff]/20 focus:border-[#503bff]"
            />
            {tokenSearch && (
              <button
                onClick={() => setTokenSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#808594] hover:text-[#1e2029]"
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
            className="bg-[#f8f9fc] text-[#1e2029] hover:bg-[#eff0f3] h-9 text-sm font-medium border border-[#d4d8e1]"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filtres
            <span className="ml-2 bg-[#503bff] text-white rounded-full px-1.5 py-0.5 text-[10px] leading-none">
              {symbolFilter !== "all" || tokenSearch ? "1" : "0"}
            </span>
          </Button>
          <Button variant="ghost" className="bg-[#f8f9fc] text-[#1e2029] hover:bg-[#eff0f3] h-9 text-sm font-medium border border-[#d4d8e1]">
            <Eye className="w-4 h-4 mr-2" />
            Affichage
            <span className="ml-2 bg-[#503bff] text-white rounded-full px-1.5 py-0.5 text-[10px] leading-none">2</span>
          </Button>
        </div>
        
        {/* Pagination simple */}
        <div className="flex items-center gap-3 text-sm">
          <span className="text-[#808594]">Page {currentPage} sur {totalPages || 1}</span>
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
      <div className="bg-white flex-1 min-h-0 overflow-auto">
        {isLoading ? (
            <div className="flex h-64 items-center justify-center">
                <LoaderCircle className="w-8 h-8 animate-spin text-[#503bff]" />
            </div>
        ) : sortedTransactions.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-[#808594] text-sm">
                Aucune transaction trouvée.
            </div>
        ) : (
        <table className="w-full text-left border-collapse">
          <thead className="bg-white sticky top-0 z-10 shadow-sm">
            <tr className="border-b border-[#d4d8e1] h-10">
              <th className="w-12 px-4 py-2 bg-white"><Checkbox className="border-[#d4d8e1] data-[state=checked]:bg-[#503bff] data-[state=checked]:border-[#503bff]" /></th>
              <th className="w-10 px-2 py-2 bg-white"></th>
              <th className="px-4 py-2 text-xs font-medium text-[#808594] uppercase tracking-wider bg-white">Type de transaction</th>
              <th className="px-4 py-2 text-xs font-medium text-[#808594] uppercase tracking-wider bg-white">
                <button
                  onClick={toggleDateSort}
                  className="flex items-center gap-1.5 hover:text-[#503bff] transition-colors"
                >
                  Date
                  <ArrowUpDown className="w-3.5 h-3.5 opacity-60" />
                </button>
              </th>
              <th className="px-4 py-2 text-xs font-medium text-[#808594] uppercase tracking-wider bg-white">Sortie</th>
              <th className="w-10 px-2 py-2 bg-white"></th>
              <th className="px-4 py-2 text-xs font-medium text-[#808594] uppercase tracking-wider bg-white">Entrée</th>
              <th className="px-4 py-2 text-xs font-medium text-[#808594] uppercase tracking-wider text-right bg-white">Montant USD</th>
              <th className="px-4 py-2 text-xs font-medium text-[#808594] uppercase tracking-wider text-right bg-white">Montant EUR</th>
            </tr>
          </thead>
          <tbody>
            {paginatedTransactions.map((tx) => (
              <tr key={tx.id} className="border-b border-[#d4d8e1] hover:bg-[#eff0f3] group cursor-pointer h-[52px] transition-colors">
                <td className="px-4 py-2"><Checkbox className="border-[#d4d8e1] data-[state=checked]:bg-[#503bff] data-[state=checked]:border-[#503bff]" /></td>
                <td className="px-2 py-2">
                  {/* Warning icon placeholder if needed */}
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center bg-gray-100", 
                        tx.type === 'trade' && "bg-blue-50",
                        tx.type === 'deposit' && "bg-green-50",
                        tx.type === 'withdrawal' && "bg-red-50"
                    )}>
                        {/* Icons mimicking the style */}
                        {tx.type === 'trade' && <ArrowLeftRight className="w-4 h-4 text-blue-600" />}
                        {tx.type === 'deposit' && <ArrowRight className="w-4 h-4 text-green-600 rotate-90" />}
                        {tx.type === 'withdrawal' && <ArrowRight className="w-4 h-4 text-red-600 -rotate-90" />}
                    </div>
                    <span className="text-sm font-bold text-[#1e2029]">{tx.label}</span>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-[#1e2029]">{tx.date}</span>
                    <span className="text-[11px] text-[#808594]">{tx.time}</span>
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
                      ) : (
                        <img
                          src={`https://icons.waltio.com/token/${tx.out.currency.toLowerCase()}`}
                          alt={tx.out.currency}
                          width={32}
                          height={32}
                          className="rounded-full shrink-0 object-cover"
                        />
                      )}
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-semibold text-[#1e2029] whitespace-nowrap">{`-${tx.out.amount} ${tx.out.currency}`}</span>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-[2px] bg-[#F3BA2F]" title="Binance"></div>
                          <span className="text-[11px] text-[#808594]">{tx.out.account}</span>
                        </div>
                        {tx.out.address && (
                          <span className="text-[10px] text-[#808594] font-mono">{tx.out.address.slice(0, 20)}...</span>
                        )}
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-2 py-2 text-center">
                    {tx.out && tx.in && <ArrowRight className="w-4 h-4 text-[#808594]" />}
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
                      ) : (
                        <img
                          src={`https://icons.waltio.com/token/${tx.in.currency.toLowerCase()}`}
                          alt={tx.in.currency}
                          width={32}
                          height={32}
                          className="rounded-full shrink-0 object-cover"
                        />
                      )}
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-semibold text-[#1e2029] whitespace-nowrap">{`+${tx.in.amount} ${tx.in.currency}`}</span>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-[2px] bg-[#F3BA2F]" title="Binance"></div>
                          <span className="text-[11px] text-[#808594]">{tx.in.account}</span>
                        </div>
                        {tx.in.address && (
                          <span className="text-[10px] text-[#808594] font-mono">{tx.in.address.slice(0, 20)}...</span>
                        )}
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <span className="text-sm font-medium text-[#1e2029]">{tx.amountDisplay}</span>
                </td>
                <td className="px-4 py-2 text-right">
                  <span className="text-sm font-medium text-[#1e2029]">
                    {tx.amount > 0 ? `€${(tx.amount * 0.92).toFixed(2)}` : "-"}
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
        <DialogContent className="sm:max-w-[500px] bg-white">
          <DialogHeader className="pb-4">
            <DialogTitle className="text-xl font-bold text-[#1e2029]">Filtres</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Filter Section - Jeton */}
            <div className="space-y-3">
              <label className="text-xs font-medium text-[#808594] uppercase tracking-wider">Jeton</label>
              <select
                value={tempSymbolFilter}
                onChange={(e) => setTempSymbolFilter(e.target.value)}
                className="w-full h-10 px-3 rounded border border-[#d4d8e1] bg-white text-sm text-[#1e2029] hover:border-[#808594] focus:outline-none focus:ring-2 focus:ring-[#503bff]/20"
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
          <div className="my-6 h-px bg-[#d4d8e1]" />

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => {
                setTempSymbolFilter("all");
                onSymbolFilterChange?.("all");
                setIsFilterDialogOpen(false);
              }}
              className="text-sm font-medium text-[#503bff] hover:text-[#402fd0] transition-colors"
            >
              Effacer les filtres
            </button>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setIsFilterDialogOpen(false)}
                className="bg-white border-[#d4d8e1] text-[#1e2029] hover:bg-[#f8f9fc]"
              >
                Annuler
              </Button>
              <Button
                onClick={() => {
                  onSymbolFilterChange?.(tempSymbolFilter);
                  setIsFilterDialogOpen(false);
                }}
                className="bg-[#503bff] hover:bg-[#402fd0] text-white"
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
            "flex flex-col justify-center h-14 px-5 border-r border-[#d4d8e1] cursor-pointer transition-colors relative min-w-fit", 
            active ? "bg-white" : "bg-[#f8f9fc] hover:bg-[#eff0f3]"
        )}>
            {active && (
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#503bff]/30 rounded-b-[5px]" />
            )}
            <div className="flex items-center gap-2 mt-1">
                <span className={cn("text-sm", active ? "font-medium text-[#1e2029]" : "text-[#808594]")}>
                    {label}
                </span>
                <span className={cn(
                    "text-xs font-medium px-1.5 py-0.5 rounded-full border", 
                    active 
                        ? "bg-white border-[#8678ff] text-[#3b414f]" 
                        : "border-[#d4d8e1] text-[#808594]"
                )}>
                    {count}
                </span>
            </div>
        </div>
    )
}