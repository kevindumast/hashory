"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { isConvexConfigured } from "@/convex/client";
import { Reveal } from "@/components/motion";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";
import {
  PFU_RATE,
  capitalShareOfSale,
  proceedsForNetTarget,
  taxOnSale,
  type PortfolioTaxState,
} from "@/lib/tax";
import { cn } from "@/lib/utils";

const money = (value: number) =>
  value.toLocaleString("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const NET_PRESETS = [1_000, 5_000, 10_000, 25_000];

/** Actifs considérés comme réserve immédiatement mobilisable. */
const STABLECOINS = new Set(["USDT", "USDC", "BUSD", "USD", "FDUSD", "TUSD", "DAI", "EUR", "EURC"]);

type Mode = "net" | "gross";

/**
 * Simulateur de cession.
 *
 * L'assiette du 150 VH bis étant proportionnelle au portefeuille entier, la
 * formule s'inverse analytiquement : on calcule exactement le montant à céder
 * pour encaisser une somme nette. C'est la question qu'on se pose en décembre,
 * et le rapport annuel n'y répond pas — il ne regarde que le passé.
 */
export function TaxSimulator() {
  const [mode, setMode] = useState<Mode>("net");
  const [amount, setAmount] = useState<number>(10_000);

  const { portfolioTokens, currentPrices } = useDashboardData();
  const report = useQuery(api.taxReport.computeTaxReport, isConvexConfigured ? {} : "skip");

  const portfolioValue = useMemo(
    () =>
      portfolioTokens.reduce(
        (sum, token) => sum + token.currentQuantity * (currentPrices[token.symbol] ?? 0),
        0
      ),
    [portfolioTokens, currentPrices]
  );

  // Mémoïsé pour rester une référence stable : sans cela, le calcul se
  // relancerait à chaque rendu.
  const state = useMemo<PortfolioTaxState>(
    () => ({ portfolioValue, totalAcquisitionCost: report?.currentAcquisitionCost ?? 0 }),
    [portfolioValue, report?.currentAcquisitionCost]
  );

  const result = useMemo(() => {
    if (state.portfolioValue <= 0) return null;
    return mode === "net" ? proceedsForNetTarget(amount, state) : taxOnSale(amount, state);
  }, [mode, amount, state]);

  // Ce qui est déjà dû au titre de l'année en cours : la mauvaise surprise
  // de mai se prépare en décembre.
  const currentYear = new Date().getUTCFullYear();
  const yearToDate = report?.reports.find((entry) => entry.year === currentYear) ?? null;

  const stablecoinReserve = useMemo(
    () =>
      portfolioTokens
        .filter((token) => STABLECOINS.has(token.symbol))
        .reduce((sum, token) => sum + token.currentQuantity * (currentPrices[token.symbol] ?? 0), 0),
    [portfolioTokens, currentPrices]
  );

  const capitalShare = capitalShareOfSale(state);
  const isLoading = report === undefined || portfolioValue <= 0;

  /** Répartition de la cession : capital récupéré, plus-value, impôt. */
  const split = result
    ? {
        capital: result.proceeds > 0 ? result.costBasis / result.proceeds : 0,
        gainAfterTax:
          result.proceeds > 0 ? Math.max(0, result.gain - result.tax) / result.proceeds : 0,
        tax: result.proceeds > 0 ? result.tax / result.proceeds : 0,
      }
    : null;

  return (
    <section className="space-y-6">
      <Reveal>
        <div className="flex items-baseline gap-4 border-b border-border/60 pb-4">
          <span className="num text-xs text-primary">→</span>
          <span className="num text-xs uppercase tracking-[0.28em] text-muted-foreground">
            Simulateur de cession
          </span>
        </div>
      </Reveal>

      <Reveal delay={60}>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          En France, une cession n&apos;est pas imposée sur le gain de l&apos;actif vendu mais au
          prorata du portefeuille entier. Une part de ce que vous encaissez n&apos;est donc que la
          récupération de votre capital — aujourd&apos;hui{" "}
          <span className="num text-foreground">{(capitalShare * 100).toFixed(0)} %</span> de toute
          vente.
        </p>
      </Reveal>

      {yearToDate && yearToDate.estimatedTaxUsd > 0 && (
        <Reveal delay={90}>
          <div className="border-y border-border/60">
            <div className="grid sm:grid-cols-3">
              {[
                {
                  label: `Cessions ${currentYear}`,
                  value: money(yearToDate.totalProceedsUsd),
                  hint: `${yearToDate.events.length} opération${yearToDate.events.length > 1 ? "s" : ""} imposable${yearToDate.events.length > 1 ? "s" : ""}`,
                },
                {
                  label: "Plus-value imposable",
                  value: money(yearToDate.netGainLossUsd),
                  hint: "Cumul depuis le 1er janvier",
                },
                {
                  label: "À provisionner",
                  value: money(yearToDate.estimatedTaxUsd),
                  hint:
                    stablecoinReserve >= yearToDate.estimatedTaxUsd
                      ? `Couvert par vos ${money(stablecoinReserve)} de stablecoins`
                      : `Votre réserve (${money(stablecoinReserve)}) ne suffit pas`,
                  alert: stablecoinReserve < yearToDate.estimatedTaxUsd,
                },
              ].map((item) => (
                <div key={item.label} className="border-b border-border/60 px-6 py-5 sm:border-b-0 sm:border-r sm:last:border-r-0">
                  <p className="num text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">
                    {item.label}
                  </p>
                  <p
                    className={cn(
                      "num mt-2 text-xl font-normal text-foreground",
                      item.alert && "text-chart-4"
                    )}
                  >
                    {item.value}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">{item.hint}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      )}

      {isLoading ? (
        <p className="border-t border-border/60 py-8 text-sm text-muted-foreground">
          {portfolioValue <= 0 && report !== undefined
            ? "Aucune position valorisée : connectez une plateforme pour simuler une cession."
            : "Chargement de votre situation…"}
        </p>
      ) : (
        <>
          <Reveal delay={120}>
            <div className="flex flex-wrap items-end gap-6 border-t border-border/60 pt-6">
              <div className="flex border border-border/60" role="group" aria-label="Sens du calcul">
                {(
                  [
                    { id: "net" as Mode, label: "Je veux encaisser" },
                    { id: "gross" as Mode, label: "Je vends" },
                  ]
                ).map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setMode(entry.id)}
                    aria-pressed={mode === entry.id}
                    className={cn(
                      "num cursor-pointer px-4 py-2 text-[11px] uppercase tracking-[0.16em] transition-colors",
                      mode === entry.id
                        ? "bg-muted/40 text-foreground"
                        : "text-muted-foreground hover:bg-muted/20 hover:text-foreground"
                    )}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 min-w-[200px]">
                <label
                  htmlFor="tax-amount"
                  className="num block text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70"
                >
                  {mode === "net" ? "Montant net visé" : "Montant cédé"}
                </label>
                <input
                  id="tax-amount"
                  type="number"
                  min={0}
                  step={500}
                  value={amount}
                  onChange={(event) => setAmount(Math.max(0, Number(event.target.value)))}
                  className="num mt-2 w-full border-b border-border bg-transparent pb-2 text-3xl text-foreground outline-none focus:border-primary"
                />
              </div>

              <div className="flex gap-2">
                {NET_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmount(preset)}
                    className="num cursor-pointer border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                  >
                    {preset.toLocaleString("fr-FR")}
                  </button>
                ))}
              </div>
            </div>
          </Reveal>

          {result === null ? (
            <Reveal delay={180}>
              <p className="border-l-2 border-chart-4 py-3 pl-4 text-sm leading-relaxed text-muted-foreground">
                <span className="text-chart-4">Objectif hors d&apos;atteinte</span> — même en cédant
                l&apos;intégralité du portefeuille ({money(portfolioValue)}), l&apos;impôt dû ne
                permet pas d&apos;encaisser cette somme nette.
              </p>
            </Reveal>
          ) : (
            <>
              <Reveal delay={180}>
                <div className="grid border-t border-border/60 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    {
                      label: "À céder",
                      value: money(result.proceeds),
                      hint: `${((result.proceeds / portfolioValue) * 100).toFixed(1)} % du portefeuille`,
                      tone: "neutral" as const,
                    },
                    {
                      label: "Dont capital récupéré",
                      value: money(result.costBasis),
                      hint: "Votre mise, non imposable",
                      tone: "neutral" as const,
                    },
                    {
                      label: "Plus-value imposable",
                      value: money(result.gain),
                      hint: `Assiette au taux de ${(PFU_RATE * 100).toFixed(0)} %`,
                      tone: result.gain >= 0 ? ("neutral" as const) : ("positive" as const),
                    },
                    {
                      label: "Impôt estimé",
                      value: money(result.tax),
                      hint: `Taux effectif : ${(result.effectiveRate * 100).toFixed(1)} % du montant cédé`,
                      tone: "negative" as const,
                    },
                  ].map((metric) => (
                    <div key={metric.label} className="border-b border-border/60 px-6 py-6">
                      <p className="num text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">
                        {metric.label}
                      </p>
                      <p
                        className={cn(
                          "num mt-3 text-2xl font-normal tracking-tight",
                          metric.tone === "negative" && "text-negative",
                          metric.tone === "positive" && "text-positive",
                          metric.tone === "neutral" && "text-foreground"
                        )}
                      >
                        {metric.value}
                      </p>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {metric.hint}
                      </p>
                    </div>
                  ))}
                </div>
              </Reveal>

              {split && (
                <Reveal delay={240}>
                  <div className="border-b border-border/60 pb-6">
                    <p className="num mb-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">
                      Composition de la cession
                    </p>
                    <div
                      className="flex h-1.5 w-full overflow-hidden"
                      role="img"
                      aria-label={`Capital ${(split.capital * 100).toFixed(0)} %, gain net ${(split.gainAfterTax * 100).toFixed(0)} %, impôt ${(split.tax * 100).toFixed(0)} %`}
                    >
                      <span
                        className="bg-muted-foreground/40"
                        style={{ width: `${split.capital * 100}%` }}
                      />
                      <span
                        className="bg-positive"
                        style={{ width: `${split.gainAfterTax * 100}%` }}
                      />
                      <span className="bg-negative" style={{ width: `${split.tax * 100}%` }} />
                    </div>
                    <div className="num mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[10px] uppercase tracking-[0.16em]">
                      <span className="text-muted-foreground">
                        Capital {(split.capital * 100).toFixed(0)} %
                      </span>
                      <span className="text-positive">
                        Gain net {(split.gainAfterTax * 100).toFixed(0)} %
                      </span>
                      <span className="text-negative">Impôt {(split.tax * 100).toFixed(0)} %</span>
                    </div>
                  </div>
                </Reveal>
              )}

              <Reveal delay={300}>
                <p className="num text-2xl font-normal text-foreground">
                  <span className="num text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">
                    Vous encaissez
                  </span>
                  <br />
                  {money(result.net)}
                </p>
              </Reveal>
            </>
          )}

          <Reveal delay={360}>
            <p className="border-t border-border/60 pt-6 text-xs leading-relaxed text-muted-foreground">
              Simulation d&apos;une cession réalisée aujourd&apos;hui, sur la base de la valeur de
              marché actuelle de votre portefeuille ({money(portfolioValue)}) et d&apos;un prix
              total d&apos;acquisition de {money(state.totalAcquisitionCost)}. Le calcul suit
              l&apos;article 150 VH bis du CGI au taux forfaitaire de {(PFU_RATE * 100).toFixed(0)} %.
              Il ne tient pas compte de vos autres revenus, d&apos;éventuelles moins-values
              reportables ni du seuil annuel d&apos;exonération. Ce n&apos;est pas un conseil
              fiscal.
            </p>
          </Reveal>
        </>
      )}
    </section>
  );
}
