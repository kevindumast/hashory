"use client";

import { Children, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ScrollStackProps = {
  children: ReactNode;
  className?: string;
  /** Décalage vertical entre deux cartes empilées, en rem. */
  offset?: number;
};

/**
 * Cartes collées les unes sur les autres au défilement : chacune se fige
 * un cran sous la précédente, qui recule légèrement quand la suivante la
 * recouvre. Inspiré de « ScrollStack » (React Bits) et « Card stack scroll »
 * (Skiper UI), sans bibliothèque de défilement : l'empilement est un
 * `position: sticky` CSS, et le recul un seul `scale` écrit par image.
 *
 * Sans JavaScript ou en mouvement réduit, il reste l'empilement sticky.
 */
export function ScrollStack({ children, className, offset = 1.25 }: ScrollStackProps) {
  const ref = useRef<HTMLOListElement>(null);
  const items = Children.toArray(children);

  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const cards = Array.from(list.querySelectorAll<HTMLElement>("[data-stack-card]"));
    let frame = 0;

    const update = () => {
      frame = 0;
      cards.forEach((card, index) => {
        const next = cards[index + 1];
        if (!next) return;
        const cardRect = card.getBoundingClientRect();
        const nextRect = next.getBoundingClientRect();
        // 0 quand la suivante est encore sous la carte, 1 quand elle l'a recouverte.
        const covered = Math.min(1, Math.max(0, (cardRect.bottom - nextRect.top) / cardRect.height));
        const depth = cards.length - 1 - index;
        card.style.scale = String(1 - covered * 0.04 * depth);
        card.style.setProperty("--stack-dim", String(covered));
      });
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <ol ref={ref} className={cn("scroll-stack", className)}>
      {items.map((child, index) => (
        <li
          key={index}
          data-stack-card
          className="scroll-stack-card"
          style={{ "--stack-top": `calc(6rem + ${index * offset}rem)` } as CSSProperties}
        >
          {child}
        </li>
      ))}
    </ol>
  );
}
