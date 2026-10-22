"use client";

import { useId } from "react";

interface HashoryLogoProps {
  size?: number;
  className?: string;
}

/**
 * Marque Hashory : un « H » sur une tuile à l'encre, dont la barre passe du
 * violet au jade — les deux accents de la marque.
 *
 * Dessinée pour rester lisible à 22 px, sa taille dans la barre latérale :
 * le H occupe la moitié de la tuile, ses traits font 16 % de sa largeur
 * (3,5 px à cette taille), et la barre prend les accents clairs, qui
 * ressortent sur l'encre. Les couleurs sont fixes : la tuile reste foncée
 * en thème sombre, sans quoi la barre claire disparaissait sur une tuile
 * claire. Le tracé est identique à celui de `public/icons/` et du favicon.
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
          <stop offset="0%" stopColor="#a48ff0" />
          <stop offset="100%" stopColor="#4cc49e" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="#151b23" />
      <g fill="#ffffff">
        <rect x="16" y="15" width="10" height="34" rx="5" />
        <rect x="38" y="15" width="10" height="34" rx="5" />
      </g>
      <rect x="16" y="27" width="32" height="10" rx="5" fill={`url(#${gradientId})`} />
    </svg>
  );
}
