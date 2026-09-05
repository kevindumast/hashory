import { query } from "./_generated/server";
import { computeCessionChain } from "../lib/tax";
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

/** Ramène un horodatage au début de sa journée UTC. */
function startOfUtcDay(timestamp: number): number {
  return Math.floor(timestamp / 86_400_000) * 86_400_000;
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
  /**
   * Vrai si au moins une cession a dû être valorisée en partie au prix de
   * revient, faute de cours historique. La plus-value est alors minorée.
   */
  hasIncompleteValuation: boolean;
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
      hasIncompleteValuation: false,
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

    // ── Calcul fiscal : article 150 VH bis du CGI ───────────────────────
    //
    // La logique vit dans `lib/tax.ts`, où elle est pure et couverte par des
    // tests. Ce fichier ne fait que réunir les données : les événements, et
    // l'historique de cours nécessaire pour établir la valeur globale du
    // portefeuille à chaque cession.
    // ────────────────────────────────────────────────────────────────────

    events.sort((a, b) => a.timestamp - b.timestamp);

    const assets = Array.from(new Set(events.map((ev) => ev.asset)));
    const fromDay = events.length > 0 ? startOfUtcDay(events[0].timestamp) : 0;
    const toDay = events.length > 0 ? startOfUtcDay(events[events.length - 1].timestamp) : 0;

    // Un seul balayage par actif : les cessions sont déjà triées, donc un
    // curseur par symbole suffit à retrouver le cours du jour.
    const priceSeries = new Map<string, { dayUtc: number; closeUsd: number }[]>();
    for (const asset of assets) {
      if (STABLECOINS.has(asset)) continue;
      const rows = await ctx.db
        .query("tokenPriceHistory")
        .withIndex("by_symbol_day", (q) =>
          q.eq("symbol", asset).gte("dayUtc", fromDay).lte("dayUtc", toDay)
        )
        .collect();
      if (rows.length > 0) {
        priceSeries.set(
          asset,
          rows
            .map((row) => ({ dayUtc: row.dayUtc, closeUsd: row.closeUsd }))
            .sort((a, b) => a.dayUtc - b.dayUtc)
        );
      }
    }

    // Les cessions sont parcourues dans l'ordre chronologique : un curseur
    // par actif évite de re-balayer la série entière à chaque appel, ce qui
    // ferait un coût quadratique sur un historique long.
    const priceCursors = new Map<string, number>();

    const priceAt = (asset: string, timestamp: number): number | null => {
      if (STABLECOINS.has(asset)) return 1;
      const series = priceSeries.get(asset);
      if (!series || series.length === 0) return null;

      const day = startOfUtcDay(timestamp);
      let index = priceCursors.get(asset) ?? -1;

      // Le curseur ne recule jamais ; on le remet à zéro dans le cas
      // improbable d'un appel antidaté.
      if (index >= 0 && series[index].dayUtc > day) index = -1;
      while (index + 1 < series.length && series[index + 1].dayUtc <= day) {
        index += 1;
      }
      priceCursors.set(asset, index);

      // Dernier cours connu à cette date, sans extrapoler vers le futur.
      return index >= 0 ? series[index].closeUsd : null;
    };

    const chain = computeCessionChain(events, priceAt);

    const taxableByYear = new Map<number, TaxableEvent[]>();
    for (const cession of chain.cessions) {
      const year = new Date(cession.date).getUTCFullYear();
      if (!taxableByYear.has(year)) taxableByYear.set(year, []);
      taxableByYear.get(year)!.push({
        date: cession.date,
        asset: cession.asset,
        quantity: cession.quantity,
        proceedsUsd: cession.proceedsUsd,
        costBasisUsd: cession.costBasisUsd,
        gainLossUsd: cession.gainLossUsd,
        source: cession.source,
      });
    }

    const totalAcquisitionCost = chain.finalAcquisitionCost;

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
      hasIncompleteValuation: chain.hasIncompleteValuation,
    };
  },
});
