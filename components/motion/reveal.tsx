"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Décalage d'apparition, en millisecondes. */
  delay?: number;
  as?: ElementType;
  /** Ancre de navigation posée sur l'élément rendu. */
  id?: string;
};

/**
 * Fait apparaître son contenu à l'entrée dans le viewport.
 * L'animation elle-même est en CSS (`.reveal`) : ce composant ne fait
 * que basculer un attribut, une seule fois, puis se déconnecte.
 */
export function Reveal({ children, className, delay = 0, as: Tag = "div", id }: RevealProps) {
  const ref = useRef<HTMLElement>(null);

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
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      id={id}
      className={cn("reveal", className)}
      data-revealed="false"
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}
