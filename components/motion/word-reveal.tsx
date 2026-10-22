"use client";

import { Fragment, useEffect, useRef, type ElementType } from "react";
import { cn } from "@/lib/utils";

/** Un fragment de titre et sa teinte : encre par défaut, ou un des accents. */
export type WordRevealSegment = {
  text: string;
  tone?: "ink" | "violet" | "jade" | "muted";
};

const TONES: Record<NonNullable<WordRevealSegment["tone"]>, string> = {
  ink: "",
  violet: "text-violet",
  jade: "text-jade",
  muted: "text-faint",
};

type WordRevealProps = {
  segments: WordRevealSegment[];
  className?: string;
  as?: ElementType;
  /** Décalage avant le premier mot, en millisecondes. */
  delay?: number;
};

/**
 * Titre dont chaque mot monte depuis sous sa ligne, en cascade, à l'entrée
 * dans le viewport. Les segments permettent de teinter certains mots.
 * L'animation est en CSS (`.word-reveal`) ; ce composant ne fait que poser
 * l'attribut une fois. Le texte reste lisible tel quel par les lecteurs
 * d'écran et les moteurs : seul l'habillage est découpé.
 */
export function WordReveal({ segments, className, as: Tag = "h2", delay = 0 }: WordRevealProps) {
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
      { threshold: 0.2 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  let index = 0;

  return (
    <Tag
      ref={ref}
      className={cn("word-reveal", className)}
      data-revealed="false"
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
    >
      {segments.map((segment, segmentIndex) => {
        const words = segment.text.split(" ").filter(Boolean);
        return (
          <Fragment key={segmentIndex}>
            {words.map((word, wordIndex) => (
              <Fragment key={wordIndex}>
                <span className="word">
                  <span
                    className={TONES[segment.tone ?? "ink"]}
                    style={{ "--word-index": index++ } as React.CSSProperties}
                  >
                    {word}
                  </span>
                </span>{" "}
              </Fragment>
            ))}
          </Fragment>
        );
      })}
    </Tag>
  );
}
