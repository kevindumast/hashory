import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

type RollingTextProps = {
  text: string;
  className?: string;
};

/**
 * Libellé dont les lettres roulent d'une ligne au survol de son parent
 * (`group`) : la lettre visible monte et sort, sa copie arrive par le bas.
 * Inspiré du « Rolling text » de Skiper UI, réécrit en CSS pur (`.rolling-text`) :
 * aucun state, utilisable depuis une page serveur.
 *
 * Le parent doit porter `group`. Le texte reste lu d'un bloc : seules les
 * deux copies découpées sont masquées aux lecteurs d'écran.
 */
export function RollingText({ text, className }: RollingTextProps) {
  const letters = Array.from(text);

  return (
    <span className={cn("rolling-text", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="rolling-text-track">
        {letters.map((letter, index) => (
          <span
            key={index}
            className="rolling-text-letter"
            data-letter={letter === " " ? " " : letter}
            style={{ "--letter-index": index } as CSSProperties}
          >
            {letter === " " ? " " : letter}
          </span>
        ))}
      </span>
    </span>
  );
}
