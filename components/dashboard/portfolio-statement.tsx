"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { isConvexConfigured } from "@/convex/client";
import { Reveal } from "@/components/motion";
import { PFU_RATE, taxOnSale } from "@/lib/tax";
import type { PortfolioToken } from "@/hooks/dashboard/useDashboardMetrics";
import { cn } from "@/lib/utils";

const usd = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

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
}: PortfolioStatementProps) {
  const report = useQuery(api.taxReport.computeTaxReport, isConvexConfigured ? {} : "skip");

  const stablecoinValueUsd = useMemo(
    () =>
      tokens
        .filter((token) => STABLECOINS.has(token.symbol))
        .reduce((sum, token) => sum + token.currentQuantity * (currentPrices[token.symbol] ?? 0), 0),
    [tokens, currentPrices]
  );

  // Le prix d'acquisition fiscal vient du rapport, seule source qui tienne
  // compte des réintégrations opérées lors des cessions passées.
  const liquidation = useMemo(() => {
    if (!hasPrices || totalValueUsd <= 0 || report === undefined) return null;
    return taxOnSale(totalValueUsd, {
      portfolioValue: totalValueUsd,
      totalAcquisitionCost: report.currentAcquisitionCost,
    });
  }, [hasPrices, totalValueUsd, report]);

  const stablecoinShare = totalValueUsd > 0 ? stablecoinValueUsd / totalValueUsd : 0;

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
              {hasPrices ? usd.format(totalValueUsd) : "—"}
            </p>
          </div>

          <div className="text-right">
            <p className="num text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">
              Résultat total
            </p>
            <p
              className={cn(
                "num mt-3 text-2xl font-normal",
                totalProfitUsd >= 0 ? "text-positive" : "text-negative"
              )}
            >
              {totalProfitUsd >= 0 ? "+" : ""}
              {usd.format(totalProfitUsd)}
              <span className="ml-3 text-base">{percent(profitPercent)}</span>
            </p>
          </div>
        </div>
      </Reveal>

      {/* D'où vient ce montant */}
      <Reveal delay={60}>
        <div className="grid border-b border-border/60 sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            label="Capital investi"
            value={usd.format(costBasisUsd)}
            hint="Prix de revient des positions détenues"
          />
          <Figure
            label="Plus-value latente"
            value={
              unrealizedPnlUsd === null
                ? "—"
                : `${unrealizedPnlUsd >= 0 ? "+" : ""}${usd.format(unrealizedPnlUsd)}`
            }
            hint="Non réalisée : sensible au marché"
            tone={
              unrealizedPnlUsd === null ? "muted" : unrealizedPnlUsd >= 0 ? "positive" : "negative"
            }
          />
          <Figure
            label="Résultat réalisé"
            value={`${realizedPnlUsd >= 0 ? "+" : ""}${usd.format(realizedPnlUsd)}`}
            hint="Déjà encaissé, définitivement acquis"
            tone={realizedPnlUsd >= 0 ? "positive" : "negative"}
          />
          <Figure
            label="Réserve mobilisable"
            value={usd.format(stablecoinValueUsd)}
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
                {usd.format(liquidation.proceeds)}
              </span>
              <span className="num text-xs text-muted-foreground/60">moins</span>
              <span className="num text-lg text-negative">{usd.format(liquidation.tax)}</span>
              <span className="num text-xs text-muted-foreground/60">d&apos;impôt</span>
              <span className="num text-xs text-muted-foreground/60">soit</span>
              <span className="num text-3xl font-normal text-foreground">
                {usd.format(liquidation.net)}
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
