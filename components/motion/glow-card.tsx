"use client";

import { useCallback, useRef, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type GlowCardProps = {
  children: ReactNode;
  className?: string;
  /** Ajoute une inclinaison 3D suivant le pointeur. */
  tilt?: boolean;
  as?: ElementType;
};

/**
 * Carte dont la bordure et le halo s'illuminent sous le curseur.
 * Les coordonnées sont écrites directement en CSS custom properties,
 * donc aucun state React n'est touché au mousemove.
 */
export function GlowCard({ children, className, tilt = false, as: Tag = "div" }: GlowCardProps) {
  const ref = useRef<HTMLElement>(null);
  const frame = useRef(0);

  const handleMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const node = ref.current;
      if (!node) return;

      const { clientX, clientY } = event;
      if (frame.current) return;

      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        const rect = node.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        node.style.setProperty("--mx", `${x}px`);
        node.style.setProperty("--my", `${y}px`);
        if (tilt) {
          node.style.setProperty("--tx", (x / rect.width).toFixed(4));
          node.style.setProperty("--ty", (y / rect.height).toFixed(4));
        }
      });
    },
    [tilt]
  );

  const handleLeave = useCallback(() => {
    const node = ref.current;
    if (!node || !tilt) return;
    node.style.setProperty("--tx", "0.5");
    node.style.setProperty("--ty", "0.5");
  }, [tilt]);

  return (
    <Tag
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className={cn("glow-card", tilt && "tilt", className)}
    >
      {children}
    </Tag>
  );
}
