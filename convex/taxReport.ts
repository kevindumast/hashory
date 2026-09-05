import { query } from "./_generated/server";
import { optionalUserId } from "./auth";

// Currencies that trigger a taxable "cession" in France (article 150 VH bis CGI)
// Only selling crypto for legal tender = taxable event
const FIAT_CURRENCIES = new Set([
  "EUR", "USD", "GBP", "AUD", "CAD", "BRL", "ARS", "TRY", "CHF", "JPY",
  "MXN", "INR", "KRW", "SGD", "HKD", "NOK", "SEK", "DKK", "NZD", "ZAR",
  "CZK", "PLN", "HUF", "RON", "RUB", "UAH", "NGN", "COP", "PEN",
]);

// Stablecoins: crypto-to-stablecoin is NOT a taxable event in France
const STABLECOINS = new Set([
  "USDT", "USDC", "BUSD", "FDUSD", "TUSD", "DAI", "USDD", "FRAX", "USDP",
  "GUSD", "LUSD", "CRVUSD", "PYUSD", "USDE", "SUSDE",
]);

const KNOWN_QUOTES = [
  "USDT", "USDC", "BUSD", "USD", "FDUSD", "TUSD", "DAI",
  "BTC", "ETH", "BNB", "EUR", "GBP", "TRY", "AUD", "CAD", "BRL", "ARS",
];

function extractBaseQuote(symbol: string): { base: string; quote: string } | null {
  const upper = symbol.toUpperCase();
  for (const quote of KNOWN_QUOTES) {
    if (upper.endsWith(quote)) {
      const base = upper.slice(0, upper.length - quote.length);
      if (base) return { base, quote };
    }
  }
  return null;
}

export type TaxableEvent = {
  date: number;
  asset: string;
  quantity: number;
  proceedsUsd: number;
  costBasisUsd: number;
  gainLossUsd: number;
  source: "trade" | "fiat" | "convert";
};

export type TaxYearReport = {
  year: number;
  totalProceedsUsd: number;
  totalCostBasisUsd: number;
  netGainLossUsd: number;
  estimatedTaxUsd: number;
  isBelowThreshold: boolean;
  events: TaxableEvent[];
};

export type TaxReportResult = {
  reports: TaxYearReport[];
  availableYears: number[];
  tradeCountByYear: Record<number, number>;
  hasOnlyStablecoinTrades: boolean;
  /**
   * Prix total d'acquisition restant, net des réintégrations déjà opérées.
   * C'est le terme « prix total d'acquisition » du 150 VH bis pour une
   * prochaine cession : le simulateur s'appuie dessus plutôt que de le
   * ré-estimer de son côté.
   */
  currentAcquisitionCost: number;
};

// PFU flat tax rate (Prélèvement Forfaitaire Unique)
const PFU_RATE = 0.30;

// 305 EUR exemption threshold (approximate in USD; user should verify in EUR)
const THRESHOLD_USD = 340;

export const computeTaxReport = query({
  args: {},
  handler: async (ctx): Promise<TaxReportResult> => {
    const empty: TaxReportResult = {
      reports: [],
      availableYears: [],
      tradeCountByYear: {},
      hasOnlyStablecoinTrades: false,
      currentAcquisitionCost: 0,
    };
    const clerkId = await optionalUserId(ctx);
    if (!clerkId) return empty;

    const integrations = await ctx.db
      .query("integrations")
      .withIndex("by_user", (q) => q.eq("clerkUserId", clerkId))
      .collect();

    if (integrations.length === 0) return empty;

    const integrationIds = integrations.map((i) => i._id);

    const [allTrades, allFiat] = await Promise.all([
      Promise.all(
        integrationIds.map((id) =>
          ctx.db
            .query("trades")
            .withIndex("by_integration", (q) => q.eq("integrationId", id))
            .collect()
        )
      ).then((r) => r.flat()),
      Promise.all(
        integrationIds.map((id) =>
          ctx.db
            .query("fiatTransactions")
            .withIndex("by_integration", (q) => q.eq("integrationId", id))
            .collect()
        )
      ).then((r) => r.flat()),
    ]);

    type PortfolioEvent = {
      timestamp: number;
      asset: string;
      qtyDelta: number;
      valueUsd: number;
      isTaxableSell: boolean;
      source: "trade" | "fiat" | "convert";
    };

    const events: PortfolioEvent[] = [];

    for (const trade of allTrades) {
      if (trade.tradeType === "CONVERT") {
        // crypto-to-crypto: NOT taxable in France, but we track cost basis movement
        const fromIsStable = STABLECOINS.has((trade.fromAsset ?? "").toUpperCase());
        const toIsStable = STABLECOINS.has((trade.toAsset ?? "").toUpperCase());
        const valueUsd = fromIsStable
          ? (trade.fromAmount ?? 0)
          : toIsStable
            ? (trade.toAmount ?? 0)
            : (trade.quoteQuantity ?? trade.price * trade.quantity);

        if (trade.fromAsset && trade.fromAmount) {
          events.push({
            timestamp: trade.executedAt,
            asset: trade.fromAsset.toUpperCase(),
            qtyDelta: -trade.fromAmount,
            valueUsd,
            isTaxableSell: false,
            source: "convert",
          });
        }
        if (trade.toAsset && trade.toAmount) {
          events.push({
            timestamp: trade.executedAt,
            asset: trade.toAsset.toUpperCase(),
            qtyDelta: trade.toAmount,
            valueUsd,
            isTaxableSell: false,
            source: "convert",
          });
        }
        continue;
      }

      const parsed = extractBaseQuote(trade.symbol);
      if (!parsed) continue;
      const { base, quote } = parsed;
      const valueUsd = trade.quoteQuantity ?? trade.price * trade.quantity;
      const isFiatQuote = FIAT_CURRENCIES.has(quote);
      const isTaxableSell = trade.side === "SELL" && isFiatQuote;

      const feeInBase =
        trade.fee && trade.feeAsset?.toUpperCase() === base ? trade.fee : 0;
      const qty =
        trade.side === "BUY"
          ? trade.quantity - feeInBase
          : -(trade.quantity + feeInBase);

      events.push({
        timestamp: trade.executedAt,
        asset: base,
        qtyDelta: qty,
        valueUsd,
        isTaxableSell,
        source: "trade",
      });
    }

    for (const fiat of allFiat) {
      const status = (fiat.status ?? "").toUpperCase();
      if (status.includes("FAIL")) continue;
      if (!fiat.cryptoCurrency || !fiat.cryptoAmount || fiat.cryptoAmount <= 0) continue;

      const isBuy = fiat.txType === "0";
      const valueUsd = fiat.price
        ? fiat.price * fiat.cryptoAmount
        : fiat.fiatAmount;

      events.push({
        timestamp: fiat.updateTime,
        asset: fiat.cryptoCurrency.toUpperCase(),
        qtyDelta: isBuy ? fiat.cryptoAmount : -fiat.cryptoAmount,
        valueUsd,
        isTaxableSell: !isBuy,
        source: "fiat",
      });
    }

    events.sort((a, b) => a.timestamp - b.timestamp);

    // ── French tax computation: article 150 VH bis CGI ──────────────────
    //
    // At each taxable "cession":
    //   Prix de revient = totalAcquisitionCost × P / (P + V_résiduel)
    //   Plus-value = P - Prix de revient
    //
    // where:
    //   P              = proceeds from the sale (USD)
    //   V_résiduel     = market value of remaining portfolio after sale
    //                    (approximated here with cost basis of remaining holdings)
    //   totalAcquisitionCost = running sum of all crypto acquisitions
    //
    // After each cession: totalAcquisitionCost -= Prix de revient
    // ────────────────────────────────────────────────────────────────────

    const holdings = new Map<string, { qty: number; avgCostUsd: number }>();
    let totalAcquisitionCost = 0;

    const taxableByYear = new Map<number, TaxableEvent[]>();

    for (const ev of events) {
      const prev = holdings.get(ev.asset) ?? { qty: 0, avgCostUsd: 0 };

      if (ev.qtyDelta > 0) {
        const newQty = prev.qty + ev.qtyDelta;
        const newAvgCost =
          newQty > 0
            ? (prev.qty * prev.avgCostUsd + ev.valueUsd) / newQty
            : 0;
        holdings.set(ev.asset, { qty: newQty, avgCostUsd: newAvgCost });
        totalAcquisitionCost += ev.valueUsd;
      } else if (ev.qtyDelta < 0) {
        const soldQty = Math.min(Math.abs(ev.qtyDelta), prev.qty);

        if (ev.isTaxableSell && soldQty > 0) {
          const P = ev.valueUsd;

          // APPROXIMATION CONNUE — le texte retient la *valeur globale* du
          // portefeuille au jour de la cession. On lui substitue ici le prix
          // de revient des positions restantes, faute d'historique de prix
          // par actif à chaque date de cession.
          //
          // Conséquence : sur un portefeuille en plus-value latente, ce
          // dénominateur est sous-estimé, donc le prix de revient imputé est
          // surestimé et la plus-value déclarée est INFÉRIEURE à la réalité.
          // Le montant affiché est donc un plancher, jamais un plafond.
          // Le simulateur de cession, lui, dispose des prix courants et
          // applique la formule exacte (voir lib/tax.ts).
          const soldCost = soldQty * prev.avgCostUsd;
          const residualCost = Math.max(0, totalAcquisitionCost - soldCost);

          const denom = P + residualCost;
          const prixDeRevient =
            denom > 0
              ? (totalAcquisitionCost * P) / denom
              : soldCost;

          const gainLoss = P - prixDeRevient;

          const year = new Date(ev.timestamp).getUTCFullYear();
          if (!taxableByYear.has(year)) taxableByYear.set(year, []);
          taxableByYear.get(year)!.push({
            date: ev.timestamp,
            asset: ev.asset,
            quantity: soldQty,
            proceedsUsd: P,
            costBasisUsd: prixDeRevient,
            gainLossUsd: gainLoss,
            source: ev.source,
          });

          totalAcquisitionCost = Math.max(0, totalAcquisitionCost - prixDeRevient);
        } else {
          // Non-taxable exit (crypto-to-crypto): proportionally reduce acquisition cost
          const exitCost = soldQty * prev.avgCostUsd;
          totalAcquisitionCost = Math.max(0, totalAcquisitionCost - exitCost);
        }

        const newQty = Math.max(0, prev.qty - soldQty);
        holdings.set(ev.asset, { qty: newQty, avgCostUsd: prev.avgCostUsd });
      }
    }

    // Build per-year trade counts from all events (including non-taxable)
    const tradeCountByYear: Record<number, number> = {};
    for (const ev of events) {
      const year = new Date(ev.timestamp).getUTCFullYear();
      tradeCountByYear[year] = (tradeCountByYear[year] ?? 0) + 1;
    }

    const allYears = Object.keys(tradeCountByYear)
      .map(Number)
      .sort((a, b) => b - a);

    // Detect if user only has stablecoin/crypto-to-crypto trades
    const hasOnlyStablecoinTrades =
      allYears.length > 0 && taxableByYear.size === 0;

    const reports = Array.from(taxableByYear.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, yearEvents]) => {
        const sortedEvents = yearEvents.sort((a, b) => a.date - b.date);
        const totalProceeds = sortedEvents.reduce((s, e) => s + e.proceedsUsd, 0);
        const totalCost = sortedEvents.reduce((s, e) => s + e.costBasisUsd, 0);
        const netGain = totalProceeds - totalCost;
        const isBelowThreshold = totalProceeds < THRESHOLD_USD;

        return {
          year,
          totalProceedsUsd: totalProceeds,
          totalCostBasisUsd: totalCost,
          netGainLossUsd: netGain,
          estimatedTaxUsd: isBelowThreshold ? 0 : Math.max(0, netGain * PFU_RATE),
          isBelowThreshold,
          events: sortedEvents,
        };
      });

    return {
      reports,
      availableYears: allYears,
      tradeCountByYear,
      hasOnlyStablecoinTrades,
      currentAcquisitionCost: totalAcquisitionCost,
    };
  },
});
