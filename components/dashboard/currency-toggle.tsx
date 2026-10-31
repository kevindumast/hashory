"use client";

import { cn } from "@/lib/utils";

export type DisplayCurrency = "USD" | "EUR";

/** Bascule USD / EUR, partagée par le relevé et le tableau des positions. */
export function CurrencyToggle({
  value,
  onChange,
  className,
}: {
  value: DisplayCurrency;
  onChange: (currency: DisplayCurrency) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex rounded-full bg-surface p-0.5", className)} role="group" aria-label="Devise d'affichage">
      {(["USD", "EUR"] as const).map((currency) => (
        <button
          key={currency}
          type="button"
          onClick={() => onChange(currency)}
          aria-pressed={value === currency}
          title={
            currency === "EUR"
              ? "Coûts et résultats en euros historiques, valeur au taux du jour publié par la BCE"
              : "Devise de référence des calculs"
          }
          className={cn(
            "num cursor-pointer rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] transition-colors",
            value === currency
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {currency}
        </button>
      ))}
    </div>
  );
}
