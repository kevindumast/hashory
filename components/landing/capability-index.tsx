"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

export type Capability = {
  tag: string;
  tone: "violet" | "jade";
  title: string;
  description: string;
};

/**
 * Les fonctionnalités en index de sommaire plutôt qu'en grille de cartes.
 * Inspiré de « Image reveal list » (Vengeance UI) et « Hover expand »
 * (Skiper UI).
 *
 * - Grand écran : la liste à gauche, un panneau fixe à droite qui change
 *   de contenu au survol. Rien ne bouge dans la liste, donc le survol ne
 *   peut pas faire glisser une autre ligne sous le curseur.
 * - Petit écran : un accordéon au toucher ; la hauteur s'ouvre par
 *   `grid-template-rows: 0fr → 1fr`, l'exception prévue pour les accordéons.
 */
export function CapabilityIndex({ items }: { items: readonly Capability[] }) {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const current = items[active];

  return (
    <div className="grid gap-12 lg:grid-cols-12">
      <ul className="border-t border-line lg:col-span-7">
        {items.map((item, index) => {
          const open = index === active;
          const panelId = `${baseId}-panel-${index}`;
          const triggerId = `${baseId}-trigger-${index}`;
          return (
            <li
              key={item.title}
              className="capability-row border-b border-line"
              data-open={open}
              data-tone={item.tone}
              onPointerEnter={(event) => {
                // Survol : pointeur précis et mise en page à panneau seulement.
                if (event.pointerType === "mouse" && window.matchMedia("(min-width: 1024px)").matches) {
                  setActive(index);
                }
              }}
            >
              <button
                type="button"
                id={triggerId}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setActive(index)}
                onFocus={() => setActive(index)}
                className="capability-trigger grid w-full grid-cols-[2.25rem_1fr] items-baseline gap-3 py-5 text-left sm:grid-cols-[3.5rem_1fr_auto] sm:gap-4 sm:py-6"
              >
                <span className="num text-sm text-faint">{String(index + 1).padStart(2, "0")}</span>
                <span className="capability-title text-2xl font-bold tracking-[-0.02em] sm:text-[2rem] sm:leading-tight">
                  {item.title}
                </span>
                <span
                  className={cn(
                    "chip hidden sm:inline-flex",
                    item.tone === "violet" ? "chip-violet" : "chip-jade"
                  )}
                >
                  {item.tag}
                </span>
              </button>
              {/* Petit écran : la description s'ouvre sous sa ligne. */}
              <div id={panelId} role="region" aria-labelledby={triggerId} className="capability-panel">
                <div className="overflow-hidden">
                  <p className="max-w-2xl pb-6 pl-[calc(2.25rem+0.75rem)] text-base leading-relaxed text-muted-foreground sm:pl-[calc(3.5rem+1rem)]">
                    {item.description}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Grand écran : un panneau fixe qui lit la ligne active. */}
      <div className="hidden lg:col-span-5 lg:block">
        <div className="sticky top-28 rounded-3xl border border-line bg-card p-9" data-tone={current.tone}>
          {/* La clé remonte le contenu : il entre en fondu à chaque changement. */}
          <div key={active} className="capability-aside">
            <div className="flex items-center justify-between">
              <span className={cn("chip", current.tone === "violet" ? "chip-violet" : "chip-jade")}>
                {current.tag}
              </span>
              <span className="num text-sm text-faint">
                {String(active + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
              </span>
            </div>
            <p className="mt-10 text-2xl font-bold leading-snug tracking-[-0.015em] text-foreground">
              {current.title}
            </p>
            <p className="mt-4 min-h-[7.5em] text-[17px] leading-relaxed text-muted-foreground">
              {current.description}
            </p>
          </div>
          <div className="capability-meter mt-8 h-0.5 w-full bg-line" aria-hidden="true">
            <span className="block h-0.5 origin-left" style={{ scale: `${(active + 1) / items.length} 1` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
