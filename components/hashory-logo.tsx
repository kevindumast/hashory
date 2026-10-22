"use client";

import { useId } from "react";

interface HashoryLogoProps {
  size?: number;
  className?: string;
}

/**
 * Marque Hashory : un « H » géométrique sur une tuile à l'encre, dont la
 * barre passe du violet au jade — les deux accents de la marque.
 * Le tracé est identique à celui des icônes de `public/icons/` pour que
 * l'identité soit la même dans l'application, l'onglet et l'écran d'accueil.
 */
export function HashoryLogo({ size = 64, className = "" }: HashoryLogoProps) {
  // Un dégradé par instance : deux logos sur la même page ne peuvent pas
  // partager un identifiant SVG sans que l'un écrase l'autre.
  const gradientId = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Hashory"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" style={{ stopColor: "var(--violet)" }} />
          <stop offset="100%" style={{ stopColor: "var(--jade)" }} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" style={{ fill: "var(--ink)" }} />
      <g style={{ fill: "var(--background)" }}>
        <rect x="18.75" y="16" width="6.5" height="32" rx="3.25" />
        <rect x="38.75" y="16" width="6.5" height="32" rx="3.25" />
      </g>
      <rect x="18.75" y="28.75" width="26.5" height="6.5" rx="3.25" fill={`url(#${gradientId})`} />
    </svg>
  );
}
