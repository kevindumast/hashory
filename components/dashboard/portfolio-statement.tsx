"use client";

import { useMemo, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { isConvexConfigured } from "@/convex/client";
import { Reveal } from "@/components/motion";
import { PFU_RATE, taxOnSale } from "@/lib/tax";
import { portfolioSheet } from "@/lib/export";
import { downloadCsv } from "@/lib/download";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PortfolioToken } from "@/hooks/dashboard/useDashboardMetrics";
import { CurrencyToggle, type DisplayCurrency } from "@/components/dashboard/currency-toggle";
import { cn } from "@/lib/utils";

const formatters: Record<DisplayCurrency, Intl.NumberFormat> = {
  USD: new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: 0 }),
  EUR: new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }),
};

/** Somme d'un montant tenu en euros par le grand livre ; null si une ligne en manque. */
function sumEur(values: (number | null)[]): number | null {
  let total = 0;
  for (const value of values) {
    if (value === null) return null;
    total += value;
  }
  return total;
}

const percent = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toLocaleString("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} %`;

/** Actifs qui constituent la réserve immédiatement mobilisable. */
const STABLECOINS = new Set(["USDT", "USDC", "BUSD", "USD", "FDUSD", "TUSD", "DAI", "EUR", "EURC"]);

type PortfolioStatementProps = {
  tokens: PortfolioToken[];
  currentPrices: Record<string, number>;
  hasPrices: boolean;
  totalValueUsd: number;
  costBasisUsd: number;
  unrealizedPnlUsd: number | null;
  realizedPnlUsd: number;
  totalProfitUsd: number;
  profitPercent: number;
  currency: DisplayCurrency;
  onCurrencyChange: (currency: DisplayCurrency) => void;
  /** Taux du jour ; null tant qu'il n'est pas chargé. */
  eurPerUsd: number | null;
};

function Figure({
  label,
  value,
  hint,
  tone = "neutral",
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "positive" | "negative" | "muted";
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 bg-card px-5 py-4">
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">{label}</span>
      <span
        className={cn(
          "num text-lg font-semibold tracking-[-0.02em] sm:text-xl",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
          tone === "muted" && "text-muted-foreground",
          tone === "neutral" && "text-foreground"
        )}
      >
        {value}
      </span>
      {children}
      {hint && <span className="text-xs leading-snug text-muted-foreground">{hint}</span>}
    </div>
  );
}

const signed = (fmt: Intl.NumberFormat, value: number) => `${value >= 0 ? "+" : ""}${fmt.format(value)}`;

/**
 * Relevé de position.
 *
 * Trois lectures, du général au concret : ce que vaut le portefeuille, d'où
 * vient ce montant, et ce qu'il resterait réellement en poche après impôt.
 *
 * Ce dernier point est l'apport principal. Une plus-value latente n'est pas
 * de l'argent disponible : en France, la liquider déclenche une imposition
 * assise sur le portefeuille entier. Afficher la valeur brute sans son coût
 * fiscal donne une image fausse de ce dont on dispose.
 *
 * En euros, le capital investi et le résultat réalisé sont les montants
 * historiques du grand livre — les euros réellement payés et encaissés —,
 * et non leur contre-valeur en dollars reconvertie au change du jour. Seule
 * la valeur actuelle passe par le taux du jour. L'impôt est calculé sur le
 * prix d'acquisition fiscal en euros : c'est celui que retient l'article
 * 150 VH bis.
 */
export function PortfolioStatement({
  tokens,
  currentPrices,
  hasPrices,
  totalValueUsd,
  costBasisUsd,
  unrealizedPnlUsd,
  realizedPnlUsd,
  totalProfitUsd,
  profitPercent,
  currency: requestedCurrency,
  onCurrencyChange,
  eurPerUsd,
}: PortfolioStatementProps) {
  const report = useQuery(api.taxReport.computeTaxReport, isConvexConfigured ? {} : "skip");

  // Sans taux du jour, on reste en dollars plutôt que d'afficher un faux montant.
  const currency: DisplayCurrency = requestedCurrency === "EUR" && eurPerUsd ? "EUR" : "USD";
  const rate = currency === "EUR" ? eurPerUsd! : 1;
  const fmt = formatters[currency];

  const stablecoinValueUsd = useMemo(
    () =>
      tokens
        .filter((token) => STABLECOINS.has(token.symbol))
        .reduce((sum, token) => sum + token.currentQuantity * (currentPrices[token.symbol] ?? 0), 0),
    [tokens, currentPrices]
  );

  // Le prix d'acquisition fiscal vient du rapport, seule source qui tienne
  // compte des réintégrations opérées lors des cessions passées.
  // Chiffres du relevé dans la devise affichée.
  const figures = useMemo(() => {
    const held = tokens.filter((token) => token.currentQuantity > 0);
    const costEur =
      currency === "EUR"
        ? sumEur(held.map((t) => (t.avgCostBasisEur === null ? null : t.avgCostBasisEur * t.currentQuantity)))
        : null;
    const realizedEur = currency === "EUR" ? sumEur(tokens.map((t) => t.realizedPnlEur)) : null;

    const value = totalValueUsd * rate;
    const cost = costEur ?? costBasisUsd * rate;
    const realized = realizedEur ?? realizedPnlUsd * rate;
    if (currency === "USD") {
      return {
        value,
        cost,
        realized,
        unrealized: unrealizedPnlUsd,
        total: totalProfitUsd,
        percent: profitPercent,
      };
    }
    const unrealized = hasPrices ? value - cost : null;
    const total = hasPrices ? value - cost + realized : totalProfitUsd * rate;
    return {
      value,
      cost,
      realized,
      unrealized,
      total,
      percent: cost > 0 ? (total / cost) * 100 : profitPercent,
    };
  }, [tokens, currency, rate, totalValueUsd, costBasisUsd, realizedPnlUsd, unrealizedPnlUsd, totalProfitUsd, profitPercent, hasPrices]);

  const liquidation = useMemo(() => {
    if (!hasPrices || figures.value <= 0 || report === undefined) return null;
    return taxOnSale(figures.value, {
      portfolioValue: figures.value,
      totalAcquisitionCost:
        currency === "EUR" ? report.currentAcquisitionCostEur : report.currentAcquisitionCost,
    });
  }, [hasPrices, figures.value, report, currency]);

  const stablecoinShare = totalValueUsd > 0 ? stablecoinValueUsd / totalValueUsd : 0;

  const handleExport = () => {
    const positions = tokens
      .filter((token) => token.currentQuantity > 0)
      .map((token) => {
        const priceUsd = currentPrices[token.symbol] ?? null;
        const price = priceUsd === null ? null : priceUsd * rate;
        const value = price !== null ? token.currentQuantity * price : null;
        // En euros, le coût et le réalisé historiques du grand livre ; à défaut,
        // la contre-valeur au taux du jour.
        const avgCostBasis =
          currency === "EUR" && token.avgCostBasisEur !== null
            ? token.avgCostBasisEur
            : token.avgCostBasis * rate;
        const realizedPnl =
          currency === "EUR" && token.realizedPnlEur !== null
            ? token.realizedPnlEur
            : token.realizedPnlAvco * rate;
        const cost = token.currentQuantity * avgCostBasis;
        return {
          symbol: token.symbol,
          quantity: token.currentQuantity,
          avgCostBasis,
          currentPrice: price,
          value,
          cost,
          realizedPnl,
          unrealizedPnl: value === null ? null : value - cost,
          weight: priceUsd !== null && totalValueUsd > 0 ? (token.currentQuantity * priceUsd) / totalValueUsd : 0,
          // Le détail par source est déjà réconcilié : on l'emporte tel quel.
          sources: token.quantityBySource
            .map((source) => source.providerDisplayName)
            .join(" · "),
        };
      })
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    downloadCsv(portfolioSheet(positions, Date.now(), currency));
  };

  const liquidationShare = (part: number) =>
    liquidation && liquidation.proceeds > 0 ? (part / liquidation.proceeds) * 100 : 0;

  return (
    <Reveal>
      <section className="float-card overflow-hidden">
        {/* En-tête : valeur totale et résultat */}
        <div className="px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow">Valeur totale</p>
            <div className="flex items-center gap-1.5">
              <CurrencyToggle value={currency} onChange={onCurrencyChange} />
              <Button
                variant="ghost"
                size="icon"
                onClick={handleExport}
                disabled={tokens.length === 0}
                aria-label="Exporter les positions en CSV"
                title="Exporter les positions en CSV"
                className="size-8 cursor-pointer rounded-full text-muted-foreground hover:text-foreground"
              >
                <Download className="size-4" />
              </Button>
            </div>
          </div>

          <p className="num mt-3 text-4xl font-bold tracking-[-0.035em] text-foreground sm:text-5xl">
            {hasPrices ? fmt.format(figures.value) : "—"}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "chip num",
                figures.total >= 0 ? "chip-jade" : "bg-negative/10 text-negative"
              )}
            >
              {signed(fmt, figures.total)}
              <span className="opacity-60">·</span>
              {percent(figures.percent)}
            </span>
            <span className="text-xs text-muted-foreground">Résultat total</span>
          </div>
        </div>

        {/* D'où vient ce montant */}
        <div className="grid grid-cols-2 gap-px border-y border-line bg-line lg:grid-cols-4">
          <Figure
            label="Capital investi"
            value={fmt.format(figures.cost)}
            hint="Prix de revient des positions"
          />
          <Figure
            label="Latent"
            value={figures.unrealized === null ? "—" : signed(fmt, figures.unrealized)}
            hint="Non réalisé, suit le marché"
            tone={
              figures.unrealized === null ? "muted" : figures.unrealized >= 0 ? "positive" : "negative"
            }
          />
          <Figure
            label="Réalisé"
            value={signed(fmt, figures.realized)}
            hint="Encaissé, définitivement acquis"
            tone={figures.realized >= 0 ? "positive" : "negative"}
          />
          <Figure
            label="Réserve stable"
            value={fmt.format(stablecoinValueUsd * rate)}
            hint={`${(stablecoinShare * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % mobilisable sans vendre`}
            tone={stablecoinValueUsd > 0 ? "neutral" : "muted"}
          >
            <span className="my-1 h-1 w-full overflow-hidden rounded-full bg-surface">
              <span
                className="block h-full rounded-full bg-violet"
                style={{ width: `${Math.min(100, stablecoinShare * 100)}%` }}
              />
            </span>
          </Figure>
        </div>

        {/* Ce qui resterait réellement en poche */}
        {liquidation && liquidation.proceeds > 0 && (
          <div className="p-3 sm:p-4">
            <div className="rounded-2xl bg-surface px-4 py-4 sm:px-5">
              <p className="eyebrow text-jade">Si vous liquidiez tout aujourd&apos;hui</p>

              <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="num text-3xl font-bold tracking-[-0.03em] text-foreground">
                  {fmt.format(liquidation.net)}
                </span>
                <span className="text-sm text-muted-foreground">en poche</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="num text-foreground">{fmt.format(liquidation.proceeds)}</span> de
                vente, moins <span className="num text-negative">{fmt.format(liquidation.tax)}</span>{" "}
                d&apos;impôt
              </p>

              {/* Composition : capital récupéré, gain net, impôt. */}
              <div
                className="mt-4 flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
                role="img"
                aria-label={`Capital ${liquidationShare(liquidation.costBasis).toFixed(0)} %, gain net ${liquidationShare(Math.max(0, liquidation.gain - liquidation.tax)).toFixed(0)} %, impôt ${liquidationShare(liquidation.tax).toFixed(0)} %`}
              >
                <span className="bg-slate/40" style={{ width: `${liquidationShare(liquidation.costBasis)}%` }} />
                <span
                  className="bg-positive"
                  style={{ width: `${liquidationShare(Math.max(0, liquidation.gain - liquidation.tax))}%` }}
                />
                <span className="bg-negative" style={{ width: `${liquidationShare(liquidation.tax)}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground" aria-hidden>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-slate/40" /> Capital
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-positive" /> Gain net
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-negative" /> Impôt
                </span>
              </div>

              <p className="mt-4 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                Estimation au taux forfaitaire de {(PFU_RATE * 100).toFixed(0)} % (art. 150 VH bis
                du CGI) : {(liquidation.effectiveRate * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
                de toute vente partirait en impôt aux conditions actuelles.
              </p>
            </div>
          </div>
        )}
      </section>
    </Reveal>
  );
}
