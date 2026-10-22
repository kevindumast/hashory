"use client";

import { motion } from "motion/react";
import { NumberTicker } from "@/components/motion";

const METRICS = [
  { label: "Valeur totale", value: 48290, prefix: "€ ", decimals: 0, delta: "+12,4 %", positive: true },
  { label: "P&L du mois", value: 5320, prefix: "+€ ", decimals: 0, delta: "+11,0 %", positive: true },
  { label: "Ratio de Sharpe", value: 1.82, prefix: "", decimals: 2, delta: "Excellent", positive: true },
];

const ALLOCATION = [
  { asset: "BTC", pct: 42, value: 20281 },
  { asset: "ETH", pct: 31, value: 14969 },
  { asset: "Autres", pct: 27, value: 13038 },
];

const SOURCES = ["Binance", "KuCoin", "0x7f…3a2c", "sol:9K…mR"];

const SPARKLINE =
  "M0,65 L50,58 L100,52 L150,60 L200,45 L250,38 L300,42 L350,30 L400,25 L450,18 L500,22 L550,12 L600,8";

/**
 * Aperçu du portefeuille affiché sur la page d'accueil.
 *
 * Les valeurs se comptent à l'apparition et la courbe se dessine — le tout
 * sans jamais bloquer le premier rendu.
 */
export function HeroPreview() {
  return (
    <div className="float-card w-full overflow-hidden">
      <div>
        {/* Barre de fenêtre */}
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-violet-soft text-[11px] font-bold text-violet">
              PF
            </span>
            <div>
              <p className="text-sm font-bold leading-tight text-foreground">Portefeuille global</p>
              <p className="text-xs text-muted-foreground">Toutes sources confondues</p>
            </div>
          </div>
          <span className="chip py-1 text-[10px] uppercase tracking-[0.16em] text-faint">
            Démo illustrative
          </span>
        </div>

        {/* Sources connectées */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          {SOURCES.map((source, index) => (
            <motion.span
              key={source}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 + index * 0.08, duration: 0.4 }}
              className="chip chip-violet py-0.5 text-[11px]"
            >
              {source}
            </motion.span>
          ))}
          <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-positive">
            <span className="size-1.5 rounded-full bg-positive pulse-ring" />
            Synchronisé
          </span>
        </div>

        {/* Indicateurs */}
        <div className="grid grid-cols-3 gap-px bg-line">
          {METRICS.map((metric, index) => (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + index * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col gap-1 bg-card px-5 py-4"
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">
                {metric.label}
              </span>
              <span className="text-xl font-bold tracking-[-0.02em] text-foreground sm:text-2xl">
                <NumberTicker
                  value={metric.value}
                  onViewport={false}
                  duration={1400}
                  prefix={metric.prefix}
                  decimals={metric.decimals}
                />
              </span>
              <span
                className={`text-xs font-bold ${metric.positive ? "text-positive" : "text-negative"}`}
              >
                {metric.delta}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Courbe de performance — tracé animé */}
        <div className="px-5 py-4 text-violet">
          <svg
            viewBox="0 0 600 80"
            className="w-full"
            role="img"
            aria-label="Courbe de performance du portefeuille, en hausse sur la période"
          >
            <defs>
              <linearGradient id="hero-spark" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <motion.path
              d={`${SPARKLINE} L600,80 L0,80 Z`}
              fill="url(#hero-spark)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.1, duration: 0.8 }}
            />
            <motion.path
              d={SPARKLINE}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.6, duration: 1.4, ease: "easeInOut" }}
            />
          </svg>
        </div>

        {/* Répartition */}
        <div className="mx-5 mb-5 grid grid-cols-3 gap-2">
          {ALLOCATION.map((item, index) => (
            <motion.div
              key={item.asset}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 + index * 0.08, duration: 0.5 }}
              className="rounded-xl bg-surface px-3 py-2.5 text-left"
            >
              <p className="text-xs font-bold text-slate">{item.asset}</p>
              <p className="num text-sm font-semibold text-foreground">{item.pct} %</p>
              <p className="num text-[10px] text-muted-foreground">
                € {item.value.toLocaleString("fr-FR")}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
