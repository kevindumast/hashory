"use client";

import { useMemo, useState } from "react";
import { useActiveQuery } from "@/hooks/usePageActivity";
import { api } from "@/convex/_generated/api";
import { isConvexConfigured } from "@/convex/client";
import { Reveal } from "@/components/motion";
import { useDashboardData } from "@/components/dashboard/dashboard-data-context";
import { Metric, Notice, SectionLabel } from "@/app/dashboard/performance/ui";
import {
  PFU_RATE,
  capitalShareOfSale,
  proceedsForNetTarget,
  taxOnSale,
  type PortfolioTaxState,
} from "@/lib/tax";
import { cn } from "@/lib/utils";

const money = (value: number) =>
  value.toLocaleString("fr-FR", { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 });
const share = (value: number, digits = 0) =>
  `${(value * 100).toLocaleString("fr-FR", { maximumFractionDigits: digits })} %`;

const PRESETS = [1_000, 5_000, 10_000, 25_000];

/** Actifs considérés comme réserve immédiatement mobilisable. */
const STABLECOINS = new Set(["USDT", "USDC", "BUSD", "USD", "FDUSD", "TUSD", "DAI", "EUR", "EURC"]);

type Mode = "net" | "gross";

/** Montant de départ lisible : environ un quart du portefeuille, arrondi. */
function defaultAmount(portfolioValue: number): number {
  if (portfolioValue <= 0) return 1_000;
  const target = portfolioValue / 4;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  return Math.max(100, Math.round(target / magnitude) * magnitude);
}

/**
 * Simulateur de cession.
 *
 * L'assiette du 150 VH bis étant proportionnelle au portefeuille entier, la
 * formule s'inverse analytiquement : on calcule exactement le montant à céder
 * pour encaisser une somme nette. C'est la question qu'on se pose en décembre,
 * et le rapport annuel n'y répond pas — il ne regarde que le passé.
 */
export function TaxSimulator({ index }: { index: string }) {
  const [mode, setMode] = useState<Mode>("net");
  const [chosenAmount, setChosenAmount] = useState<number | null>(null);

  const { portfolioTokens, currentPrices } = useDashboardData();
  const report = useActiveQuery(api.taxReport.computeTaxReport, isConvexConfigured ? {} : "skip");

  const portfolioValue = useMemo(
    () =>
      portfolioTokens.reduce(
        (sum, token) => sum + token.currentQuantity * (currentPrices[token.symbol] ?? 0),
        0
      ),
    [portfolioTokens, currentPrices]
  );
  // Tant que l'utilisateur n'a rien choisi, un montant à la mesure du portefeuille.
  const amount = chosenAmount ?? defaultAmount(portfolioValue);

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
  const inLoss = state.totalAcquisitionCost >= state.portfolioValue;
  const isLoading = report === undefined || portfolioValue <= 0;
  const presets = PRESETS.filter((preset) => preset < portfolioValue);

  /** Répartition de la cession : capital récupéré, plus-value, impôt. */
  const split =
    result && result.proceeds > 0
      ? {
          capital: Math.min(1, result.costBasis / result.proceeds),
          gainAfterTax: Math.max(0, result.gain - result.tax) / result.proceeds,
          tax: result.tax / result.proceeds,
        }
      : null;

  return (
    <section className="space-y-4">
      <Reveal>
        <SectionLabel index={index}>Simuler une vente</SectionLabel>
      </Reveal>

      <Reveal delay={40}>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          En France, une cession est imposée au prorata du portefeuille entier, pas sur le gain de
          l&apos;actif vendu.{" "}
          {isLoading ? null : inLoss ? (
            <>
              Votre portefeuille est aujourd&apos;hui en <span className="font-bold text-foreground">moins-value fiscale</span>{" "}
              : une vente ne déclencherait aucun impôt.
            </>
          ) : (
            <>
              Aujourd&apos;hui, <span className="num font-bold text-foreground">{share(capitalShare)}</span> de toute vente
              n&apos;est que la récupération de votre capital.
            </>
          )}
        </p>
      </Reveal>

      {yearToDate && yearToDate.estimatedTaxUsd > 0 && (
        <Reveal delay={60}>
          <div className="float-card overflow-hidden">
            <div className="grid gap-px bg-line sm:grid-cols-3">
              <Metric
                label={`Cessions ${currentYear}`}
                value={money(yearToDate.totalProceedsUsd)}
                hint={`${yearToDate.events.length} opération${yearToDate.events.length > 1 ? "s" : ""} imposable${yearToDate.events.length > 1 ? "s" : ""}`}
              />
              <Metric label="Plus-value imposable" value={money(yearToDate.netGainLossUsd)} hint="Cumul depuis le 1er janvier" />
              <Metric
                label="À provisionner"
                value={money(yearToDate.estimatedTaxUsd)}
                tone={stablecoinReserve < yearToDate.estimatedTaxUsd ? "negative" : "neutral"}
                hint={
                  stablecoinReserve >= yearToDate.estimatedTaxUsd
                    ? `Couvert par vos ${money(stablecoinReserve)} de stablecoins`
                    : `Votre réserve (${money(stablecoinReserve)}) ne suffit pas`
                }
              />
            </div>
          </div>
        </Reveal>
      )}

      {isLoading ? (
        <Notice>
          {portfolioValue <= 0 && report !== undefined
            ? "Aucune position valorisée : connectez une plateforme pour simuler une vente."
            : "Chargement de votre situation…"}
        </Notice>
      ) : (
        <Reveal delay={80}>
          <div className="float-card overflow-hidden">
            {/* Saisie */}
            <div className="flex flex-wrap items-end gap-x-6 gap-y-4 px-5 py-5">
              <div className="flex rounded-full bg-surface p-0.5" role="group" aria-label="Sens du calcul">
                {[
                  { id: "net" as Mode, label: "Je veux encaisser" },
                  { id: "gross" as Mode, label: "Je vends" },
                ].map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setMode(entry.id)}
                    aria-pressed={mode === entry.id}
                    className={cn(
                      "cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
                      mode === entry.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>

              <div className="min-w-[180px] flex-1">
                <label htmlFor="tax-amount" className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">
                  {mode === "net" ? "Montant net visé" : "Montant vendu"} (USD)
                </label>
                <input
                  id="tax-amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={100}
                  value={amount}
                  onChange={(event) => setChosenAmount(Math.max(0, Number(event.target.value)))}
                  className="num mt-1 w-full border-b border-border bg-transparent pb-1 text-3xl font-semibold tracking-[-0.02em] text-foreground outline-none focus:border-violet"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setChosenAmount(preset)}
                    className={cn(
                      "chip num cursor-pointer text-xs transition-colors",
                      amount === preset ? "chip-violet" : "hover:text-foreground"
                    )}
                  >
                    {preset.toLocaleString("fr-FR")}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setMode("gross");
                    setChosenAmount(Math.floor(portfolioValue));
                  }}
                  className="chip cursor-pointer text-xs font-bold transition-colors hover:text-foreground"
                >
                  Tout vendre
                </button>
              </div>
            </div>

            {result === null ? (
              <p className="border-t border-line bg-surface px-5 py-4 text-sm leading-relaxed text-muted-foreground">
                <span className="font-bold text-chart-4">Objectif hors d&apos;atteinte</span> —{" "}
                {amount >= portfolioValue ? (
                  // L'impôt n'y est pour rien : le portefeuille entier vaut moins que la somme visée.
                  <>votre portefeuille entier vaut {money(portfolioValue)}, moins que le montant visé.</>
                ) : (
                  <>
                    même en vendant tout ({money(portfolioValue)}), l&apos;impôt dû ne permet pas d&apos;encaisser cette
                    somme nette.
                  </>
                )}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-px border-t border-line bg-line lg:grid-cols-4">
                  <Metric label="À vendre" value={money(result.proceeds)} hint={`${share(result.proceeds / portfolioValue, 1)} du portefeuille`} />
                  <Metric
                    label="Capital récupéré"
                    value={money(Math.min(result.costBasis, result.proceeds))}
                    hint={
                      result.costBasis > result.proceeds
                        ? `Sur ${money(result.costBasis)} de mise imputée à cette vente`
                        : "Votre mise, non imposable"
                    }
                  />
                  <Metric
                    label={result.gain >= 0 ? "Plus-value imposable" : "Moins-value"}
                    value={money(result.gain)}
                    tone={result.gain >= 0 ? "neutral" : "positive"}
                    hint={result.gain >= 0 ? `Imposée à ${share(PFU_RATE)}` : "Aucun impôt sur cette vente"}
                  />
                  <Metric
                    label="Impôt estimé"
                    value={money(result.tax)}
                    tone={result.tax > 0 ? "negative" : "neutral"}
                    hint={`Soit ${share(result.effectiveRate, 1)} du montant vendu`}
                  />
                </div>

                <div className="flex flex-wrap items-end justify-between gap-4 border-t border-line px-5 py-5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">Vous encaissez</p>
                    <p className="num mt-1 text-3xl font-bold tracking-[-0.03em] text-foreground">{money(result.net)}</p>
                  </div>
                  {split && (
                    <div className="w-full max-w-md space-y-2">
                      <div
                        className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
                        role="img"
                        aria-label={`Capital ${share(split.capital)}, gain net ${share(split.gainAfterTax)}, impôt ${share(split.tax)}`}
                      >
                        <span className="bg-slate/40" style={{ width: `${split.capital * 100}%` }} />
                        <span className="bg-positive" style={{ width: `${split.gainAfterTax * 100}%` }} />
                        <span className="bg-negative" style={{ width: `${split.tax * 100}%` }} />
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground" aria-hidden>
                        <span className="flex items-center gap-1.5">
                          <span className="size-2 rounded-full bg-slate/40" /> Capital {share(split.capital)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="size-2 rounded-full bg-positive" /> Gain net {share(split.gainAfterTax)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="size-2 rounded-full bg-negative" /> Impôt {share(split.tax)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </Reveal>
      )}

      {!isLoading && (
        <p className="text-[11px] leading-relaxed text-faint">
          Vente réalisée aujourd&apos;hui, sur la valeur de marché de votre portefeuille ({money(portfolioValue)}) et un prix
          total d&apos;acquisition de {money(state.totalAcquisitionCost)}, au taux forfaitaire de {share(PFU_RATE)}. Ni vos
          autres revenus, ni les moins-values de l&apos;année, ni le seuil de 305 € ne sont pris en compte. Ce n&apos;est pas
          un conseil fiscal.
        </p>
      )}
    </section>
  );
}
