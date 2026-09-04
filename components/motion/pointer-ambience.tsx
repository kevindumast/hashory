"use client";

import { useEffect, useRef } from "react";

/**
 * Diffuse la position du curseur dans le CSS et affiche un halo qui le suit.
 *
 * Deux jeux de variables sont posés sur <html> :
 *   --px / --py             position normalisée 0→1 dans la fenêtre
 *   --cursor-x / --cursor-y position absolue en px (pour le halo)
 *
 * Tout est écrit dans une frame d'animation : les mousemove ne déclenchent
 * aucun rendu React, ce qui garde la page à 60 fps même avec plusieurs
 * effets branchés dessus.
 */
export function PointerAmbience() {
  const auraRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(pointer: fine)");
    if (reduceMotion.matches || !finePointer.matches) return;

    const root = document.documentElement;
    let frame = 0;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 3;

    const paint = () => {
      frame = 0;
      root.style.setProperty("--px", (x / window.innerWidth).toFixed(4));
      root.style.setProperty("--py", (y / window.innerHeight).toFixed(4));
      root.style.setProperty("--cursor-x", `${x}px`);
      root.style.setProperty("--cursor-y", `${y}px`);
      auraRef.current?.setAttribute("data-active", "true");
    };

    const handleMove = (event: PointerEvent) => {
      x = event.clientX;
      y = event.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    };

    const handleLeave = () => {
      auraRef.current?.setAttribute("data-active", "false");
    };

    window.addEventListener("pointermove", handleMove, { passive: true });
    document.addEventListener("pointerleave", handleLeave);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerleave", handleLeave);
      if (frame) cancelAnimationFrame(frame);
      root.style.removeProperty("--px");
      root.style.removeProperty("--py");
      root.style.removeProperty("--cursor-x");
      root.style.removeProperty("--cursor-y");
    };
  }, []);

  return <div ref={auraRef} className="cursor-aura" data-active="false" aria-hidden="true" />;
}
