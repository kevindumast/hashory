"use client";

import { useCallback, useEffect, useRef } from "react";
import { animate, type AnimationPlaybackControls } from "motion";
import {
  overlayOpacity,
  releaseVelocity,
  rubberband,
  shouldDismiss,
  type PointerSample,
} from "@/lib/gesture";

/** Distance (px) avant de décider qu'un appui est un glisser et non un tap. */
const DRAG_THRESHOLD = 10;

type SheetDragOptions = {
  enabled: boolean;
  /** Appelé une fois la feuille sortie de l'écran : ferme réellement le dialogue. */
  onDismiss: () => void;
};

/**
 * Glisser-pour-fermer d'une feuille du bas.
 *
 * - Pendant le geste, la feuille suit le doigt 1:1 (écriture directe de
 *   `transform`, aucun rendu React) en respectant l'endroit saisi.
 * - Vers le haut, elle résiste de plus en plus (rubber band).
 * - Le voile est lié au glisser : son opacité est dérivée de la position.
 * - Au relâcher, l'élan est projeté : une pichenette ferme, un geste court
 *   revient. Le ressort part de la vitesse du doigt.
 * - Le geste est interruptible : on peut rattraper la feuille en vol.
 *
 * Les éléments manipulés sont lus dans le DOM (`data-slot`), pour ne pas
 * imposer de refs aux composants Radix.
 */
export function useSheetDrag({ enabled, onDismiss }: SheetDragOptions) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const state = useRef({
    pointerId: null as number | null,
    committed: false,
    startX: 0,
    startY: 0,
    baseOffset: 0,
    offset: 0,
    samples: [] as PointerSample[],
    suppressClick: false,
    animation: null as AnimationPlaybackControls | null,
  });

  // Le voile est rendu juste avant la feuille, dans le même portail.
  const overlay = () => {
    const previous = contentRef.current?.previousElementSibling;
    return previous instanceof HTMLElement && previous.dataset.slot === "sheet-overlay" ? previous : null;
  };

  const render = useCallback((offset: number) => {
    const node = contentRef.current;
    if (!node) return;
    const s = state.current;
    s.offset = offset;
    node.style.transform = offset === 0 ? "" : `translate3d(0, ${offset}px, 0)`;
    const scrim = overlay();
    if (scrim) {
      const opacity = overlayOpacity(offset, node.offsetHeight);
      scrim.style.opacity = opacity === 1 ? "" : String(opacity);
    }
  }, []);

  /** Position réellement affichée (pendant une animation CSS ou un ressort). */
  const presentationOffset = (node: HTMLElement) => {
    const transform = getComputedStyle(node).transform;
    if (!transform || transform === "none") return 0;
    return new DOMMatrixReadOnly(transform).m42;
  };

  const settle = useCallback(
    (dismiss: boolean, velocity: number) => {
      const node = contentRef.current;
      if (!node) return;
      const s = state.current;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const target = dismiss ? node.offsetHeight + 24 : 0;

      s.animation?.stop();
      s.animation = animate(s.offset, target, {
        // Fermeture : pas de rebond. Retour : un léger rebond, parce que le
        // doigt a donné de l'élan. Animations réduites : court, sans ressort.
        ...(reduce
          ? { duration: 0.15, ease: [0.23, 1, 0.32, 1] as const }
          : { type: "spring" as const, bounce: dismiss ? 0 : 0.15, duration: dismiss ? 0.35 : 0.4, velocity }),
        onUpdate: render,
        onComplete: () => {
          s.animation = null;
          if (!dismiss) return;
          // La fermeture passe par un clic programmatique : il ne doit pas
          // être pris pour la fin d'un glisser.
          s.suppressClick = false;
          // Radix rejoue sinon son animation de sortie depuis la position 0.
          node.dataset.dragDismissed = "true";
          const scrim = overlay();
          if (scrim) scrim.dataset.dragDismissed = "true";
          onDismissRef.current();
        },
      });
    },
    [render]
  );

  useEffect(() => {
    if (!enabled) return;
    const s = state.current;
    return () => {
      s.animation?.stop();
      s.animation = null;
    };
  }, [enabled]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const s = state.current;
      // Un seul doigt : un second contact pendant le geste est ignoré.
      if (!enabled || s.pointerId !== null) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      // Les éléments marqués gardent leurs propres gestes (curseurs, listes…).
      if ((event.target as HTMLElement).closest("[data-sheet-no-drag]")) return;

      s.pointerId = event.pointerId;
      s.committed = false;
      s.startX = event.clientX;
      s.startY = event.clientY;
      s.samples = [];
      s.suppressClick = false;

      // La feuille est peut-être encore en mouvement : on la rattrape là où
      // elle est affichée, pas là où elle devait aller.
      const node = contentRef.current;
      if (node && (s.animation || node.getAnimations().length > 0)) {
        const current = presentationOffset(node);
        s.animation?.stop();
        s.animation = null;
        node.getAnimations().forEach((animation) => animation.cancel());
        render(current);
      }
      s.baseOffset = s.offset;
    },
    [enabled, render]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const s = state.current;
      const node = contentRef.current;
      if (!enabled || s.pointerId !== event.pointerId || !node) return;

      const dx = event.clientX - s.startX;
      const dy = event.clientY - s.startY;

      if (!s.committed) {
        if (Math.abs(dy) < DRAG_THRESHOLD || Math.abs(dy) < Math.abs(dx)) return;
        s.committed = true;
        s.suppressClick = true;
        node.setPointerCapture(event.pointerId);
        node.dataset.dragging = "true";
      }

      // Mesuré depuis le point de contact : la feuille reste collée à
      // l'endroit saisi, seuil compris.
      const raw = s.baseOffset + (event.clientY - s.startY);
      const offset = raw < 0 ? rubberband(raw, node.offsetHeight) : raw;
      s.samples.push({ t: event.timeStamp, y: offset });
      if (s.samples.length > 20) s.samples.shift();
      render(offset);
    },
    [enabled, render]
  );

  const end = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
      const s = state.current;
      const node = contentRef.current;
      if (s.pointerId !== event.pointerId) return;
      s.pointerId = null;
      if (!node) return;
      if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
      delete node.dataset.dragging;

      if (!s.committed) {
        // Simple tap pendant un retour en vol : on termine le retour.
        if (s.offset !== 0) settle(false, 0);
        return;
      }
      // Le clic qui suit un glisser à la souris est avalé ; au toucher il
      // n'y en a pas : le verrou tombe de lui-même.
      window.setTimeout(() => {
        s.suppressClick = false;
      }, 120);
      const velocity = cancelled ? 0 : releaseVelocity(s.samples, event.timeStamp);
      settle(!cancelled && shouldDismiss(s.offset, velocity, node.offsetHeight), velocity);
    },
    [settle]
  );

  /** Un glisser qui finit sur un lien ne doit pas le déclencher. */
  const onClickCapture = useCallback((event: React.MouseEvent) => {
    const s = state.current;
    if (s.suppressClick) {
      s.suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  return {
    ref: contentRef,
    handlers: enabled
      ? {
          onPointerDown,
          onPointerMove,
          onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => end(event, false),
          onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => end(event, true),
          onClickCapture,
        }
      : {},
  };
}
