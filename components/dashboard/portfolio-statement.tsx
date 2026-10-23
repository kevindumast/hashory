"use client";

import { useMemo } from "react";
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
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "positive" | "negative" | "muted";
}) {
  return (
    <div className="border-b border-border/60 px-5 py-5 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="num text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">{label}</p>
      <p
        className={cn(
          "num mt-2.5 text-2xl font-normal tracking-tight",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
          tone === "muted" && "text-muted-foreground",
          tone === "neutral" && "text-foreground"
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

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

  return (
    <section className="border-y border-border/60">
      {/* Valeur totale, en tête */}
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-border/60 px-5 py-6">
          <div>
            <p className="num text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">
              Valeur du portefeuille
            </p>
            <p className="num mt-3 text-5xl font-normal tracking-tight text-foreground">
              {hasPrices ? fmt.format(figures.value) : "—"}
            </p>
          </div>

          <div className="text-right">
            <div className="mb-2 flex items-center justify-end gap-2">
              <CurrencyToggle value={currency} onChange={onCurrencyChange} />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExport}
                disabled={tokens.length === 0}
                className="num h-7 cursor-pointer px-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
              >
                <Download className="mr-1.5 size-3" />
                Exporter
              </Button>
            </div>
            <p className="num text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">
              Résultat total
            </p>
            <p
              className={cn(
                "num mt-3 text-2xl font-normal",
                figures.total >= 0 ? "text-positive" : "text-negative"
              )}
            >
              {figures.total >= 0 ? "+" : ""}
              {fmt.format(figures.total)}
              <span className="ml-3 text-base">{percent(figures.percent)}</span>
            </p>
          </div>
        </div>
      </Reveal>

      {/* D'où vient ce montant */}
      <Reveal delay={60}>
        <div className="grid border-b border-border/60 sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            label="Capital investi"
            value={fmt.format(figures.cost)}
            hint="Prix de revient des positions détenues"
          />
          <Figure
            label="Plus-value latente"
            value={
              figures.unrealized === null
                ? "—"
                : `${figures.unrealized >= 0 ? "+" : ""}${fmt.format(figures.unrealized)}`
            }
            hint="Non réalisée : sensible au marché"
            tone={
              figures.unrealized === null ? "muted" : figures.unrealized >= 0 ? "positive" : "negative"
            }
          />
          <Figure
            label="Résultat réalisé"
            value={`${figures.realized >= 0 ? "+" : ""}${fmt.format(figures.realized)}`}
            hint="Déjà encaissé, définitivement acquis"
            tone={figures.realized >= 0 ? "positive" : "negative"}
          />
          <Figure
            label="Réserve mobilisable"
            value={fmt.format(stablecoinValueUsd * rate)}
            hint={`${(stablecoinShare * 100).toFixed(1)} % du portefeuille, sans vendre`}
            tone="muted"
          />
        </div>
      </Reveal>

      {/* Ce qui resterait réellement en poche */}
      {liquidation && liquidation.proceeds > 0 && (
        <Reveal delay={120}>
          <div className="px-5 py-6">
            <p className="num text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">
              Si vous liquidiez tout aujourd&apos;hui
            </p>

            <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <span className="num text-lg text-muted-foreground">
                {fmt.format(liquidation.proceeds)}
              </span>
              <span className="num text-xs text-muted-foreground/60">moins</span>
              <span className="num text-lg text-negative">{fmt.format(liquidation.tax)}</span>
              <span className="num text-xs text-muted-foreground/60">d&apos;impôt</span>
              <span className="num text-xs text-muted-foreground/60">soit</span>
              <span className="num text-3xl font-normal text-foreground">
                {fmt.format(liquidation.net)}
              </span>
              <span className="num text-xs text-muted-foreground/60">en poche</span>
            </div>

            {/* Composition : capital récupéré, gain net, impôt. */}
            <div
              className="mt-5 flex h-1.5 w-full overflow-hidden"
              role="img"
              aria-label={`Capital ${((liquidation.costBasis / liquidation.proceeds) * 100).toFixed(0)} %, gain net ${(((liquidation.gain - liquidation.tax) / liquidation.proceeds) * 100).toFixed(0)} %, impôt ${((liquidation.tax / liquidation.proceeds) * 100).toFixed(0)} %`}
            >
              <span
                className="bg-muted-foreground/40"
                style={{ width: `${(liquidation.costBasis / liquidation.proceeds) * 100}%` }}
              />
              <span
                className="bg-positive"
                style={{
                  width: `${(Math.max(0, liquidation.gain - liquidation.tax) / liquidation.proceeds) * 100}%`,
                }}
              />
              <span
                className="bg-negative"
                style={{ width: `${(liquidation.tax / liquidation.proceeds) * 100}%` }}
              />
            </div>

            <p className="mt-4 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              Estimation au taux forfaitaire de {(PFU_RATE * 100).toFixed(0)} %, selon
              l&apos;article 150 VH bis du CGI. Une plus-value latente n&apos;est pas de
              l&apos;argent disponible : {(liquidation.effectiveRate * 100).toFixed(1)} % de toute
              vente partirait en impôt aux conditions actuelles.
            </p>
          </div>
        </Reveal>
      )}
    </section>
  );
}
