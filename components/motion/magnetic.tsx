"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type MagneticProps = {
  children: ReactNode;
  className?: string;
  /** Amplitude maximale du décalage, en pixels. */
  strength?: number;
};

/**
 * Enveloppe un élément interactif qui « attire » légèrement le curseur.
 * Le décalage revient à zéro dès que le pointeur sort de la zone.
 */
export function Magnetic({ children, className, strength = 10 }: MagneticProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const frame = useRef(0);

  const handleMove = useCallback(
    (event: React.PointerEvent<HTMLSpanElement>) => {
      const node = ref.current;
      if (!node || frame.current) return;
      const { clientX, clientY } = event;

      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        const rect = node.getBoundingClientRect();
        const dx = (clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
        const dy = (clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
        node.style.setProperty("--dx", `${(dx * strength).toFixed(2)}px`);
        node.style.setProperty("--dy", `${(dy * strength).toFixed(2)}px`);
      });
    },
    [strength]
  );

  const handleLeave = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    node.style.setProperty("--dx", "0px");
    node.style.setProperty("--dy", "0px");
  }, []);

  return (
    <span
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className={cn("magnetic inline-flex", className)}
    >
      {children}
    </span>
  );
}
