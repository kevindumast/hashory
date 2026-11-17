"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

type OdometerProps = {
  value: number;
  className?: string;
  /** Texte collé avant la valeur (devise, signe…). */
  prefix?: string;
  /** Texte collé après la valeur (unité, pourcentage…). */
  suffix?: string;
  /** Nombre de décimales affichées. */
  decimals?: number;
};

/** Deux tours de rouleau : chaque chiffre fait au moins un tour complet, zéro compris. */
const REEL = Array.from({ length: 20 }, (_, index) => String(index % 10));

/**
 * Valeur affichée comme un compteur mécanique : chaque chiffre est un
 * rouleau 0→9 qui tourne jusqu'à sa position à l'entrée dans le viewport.
 * Inspiré des compteurs de Skiper UI (« Animated number ») et React Bits
 * (« Counter »), réécrit en CSS (`.odometer`) : un seul `translate` par
 * rouleau, aucun re-render pendant l'animation.
 *
 * Les rouleaux de droite tournent un peu plus longtemps, comme les roues
 * d'un vrai compteur ; les séparateurs (espace fine, virgule) ne bougent pas.
 * Options sérialisables : utilisable depuis une page serveur.
 */
export function Odometer({ value, className, prefix = "", suffix = "", decimals = 0 }: OdometerProps) {
  const ref = useRef<HTMLSpanElement>(null);

  const formatted = value.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const characters = Array.from(formatted);
  const digitCount = characters.filter((character) => /\d/.test(character)).length;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      node.setAttribute("data-revealed", "true");
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          entry.target.setAttribute("data-revealed", "true");
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  let digitIndex = 0;

  return (
    <span ref={ref} className={cn("odometer num", className)} data-revealed="false">
      <span className="sr-only">{`${prefix}${formatted}${suffix}`}</span>
      <span aria-hidden="true" className="inline-flex items-end whitespace-pre">
        {prefix}
        {characters.map((character, index) => {
          if (!/\d/.test(character)) {
            return <span key={index}>{character}</span>;
          }
          // Rang depuis la droite : le chiffre des unités tourne le plus longtemps.
          const rank = digitCount - 1 - digitIndex++;
          return (
            <span key={index} className="odometer-window">
              <span
                className="odometer-reel"
                style={
                  {
                    "--digit": Number(character),
                    "--reel-rank": rank,
                  } as CSSProperties
                }
              >
                {REEL.map((digit, reelIndex) => (
                  <span key={reelIndex}>{digit}</span>
                ))}
              </span>
            </span>
          );
        })}
        {suffix}
      </span>
    </span>
  );
}
