"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type NumberTickerProps = {
  value: number;
  className?: string;
  /** Durée du comptage, en millisecondes. */
  duration?: number;
  /** Texte collé avant la valeur (devise, signe…). */
  prefix?: string;
  /** Texte collé après la valeur (unité, pourcentage…). */
  suffix?: string;
  /** Nombre de décimales affichées. */
  decimals?: number;
  /** Déclenche le comptage à l'entrée dans le viewport plutôt qu'au montage. */
  onViewport?: boolean;
};

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Compteur animé pour les valeurs clés (P&L, valeur totale…).
 *
 * Les options de mise en forme sont volontairement des données et non une
 * fonction : ce composant est appelé depuis des pages serveur, et une
 * fonction ne franchit pas la frontière serveur → client.
 */
export function NumberTicker({
  value,
  className,
  duration = 1100,
  prefix = "",
  suffix = "",
  decimals = 0,
  onViewport = true,
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);

  const format = (input: number) =>
    `${prefix}${input.toLocaleString("fr-FR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}${suffix}`;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      previous.current = value;
      setDisplay(value);
      return;
    }

    let frame = 0;
    const from = previous.current;

    const run = () => {
      const start = performance.now();
      const step = (now: number) => {
        const progress = Math.min((now - start) / duration, 1);
        setDisplay(from + (value - from) * easeOut(progress));
        if (progress < 1) {
          frame = requestAnimationFrame(step);
        } else {
          previous.current = value;
        }
      };
      frame = requestAnimationFrame(step);
    };

    if (!onViewport || typeof IntersectionObserver === "undefined") {
      run();
      return () => cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          run();
          observer.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, duration, onViewport]);

  return (
    <span ref={ref} className={cn("num", className)}>
      <span aria-hidden="true">{format(display)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
