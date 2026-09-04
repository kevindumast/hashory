"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Mots dissimulés dans le bruit. Le curseur les « décode » en passant dessus.
 * Ils décrivent le produit : le survol raconte donc quelque chose.
 */
const HIDDEN_WORDS = [
  "PORTEFEUILLE",
  "BINANCE",
  "P&L REEL",
  "ETHEREUM",
  "LECTURE SEULE",
  "SOLANA",
  "150 VH BIS",
  "BITCOIN",
  "SHARPE",
  "OPEN SOURCE",
  "KASPA",
  "TEMPS REEL",
  "KUCOIN",
  "PLUS-VALUE",
  "BITTENSOR",
  "DRAWDOWN",
  "ALLOCATION",
  "SANS RESSAISIE",
];

/** Un dump de hash : le bruit de fond parle déjà de crypto. */
const NOISE_CHARS = "0123456789ABCDEF";

const CELL_WIDTH = 11;
const CELL_HEIGHT = 17;
const REVEAL_RADIUS = 160;
/** Au-delà de ce seuil de lumière, la lettre cesse de se brouiller. */
const LOCK_THRESHOLD = 0.55;
/** En dessous, la cellule est considérée éteinte et sort du circuit. */
const EXTINCT = 0.004;

type Cell = {
  noise: string;
  /** Lettre réelle si la cellule appartient à un mot caché. */
  letter: string | null;
  glow: number;
};

/** Générateur déterministe : la disposition ne saute pas d'un rendu à l'autre. */
function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function hexToRgbTriplet(value: string): string | null {
  const hex = value.trim().replace("#", "");
  if (hex.length !== 6) return null;
  const int = Number.parseInt(hex, 16);
  if (Number.isNaN(int)) return null;
  return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`;
}

/**
 * Champ de caractères réactif au curseur.
 *
 * Le bruit de fond est peint une seule fois ; chaque frame ne retouche que
 * les cellules concernées — celles sous le pointeur, plus celles encore
 * allumées qu'il vient de quitter, pour qu'aucune traînée ne subsiste.
 * Le composant s'efface entièrement sur écran tactile et si l'utilisateur
 * a demandé une réduction des animations.
 */
export function DecoderField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let cells: Cell[] = [];
    /** Indices des cellules encore allumées : elles doivent continuer à s'éteindre. */
    const litCells = new Set<number>();

    let columns = 0;
    let rows = 0;
    let width = 0;
    let height = 0;
    let ratio = 1;
    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;
    /** Faux dès que le pointeur quitte la page : toutes les cibles retombent à 0. */
    let pointerInside = false;

    // Couleurs et police viennent du thème, relues à chaque bascule clair/sombre.
    let baseColor = "180, 197, 255";
    let accentColor = "180, 197, 255";
    let fontFamily = "monospace";

    function readTheme() {
      const styles = getComputedStyle(host!);
      fontFamily = styles.fontFamily || "monospace";
      const parsed = styles.color.match(/\d+(\.\d+)?/g);
      if (parsed && parsed.length >= 3) {
        baseColor = `${parsed[0]}, ${parsed[1]}, ${parsed[2]}`;
      }
      const primary = getComputedStyle(document.documentElement).getPropertyValue("--primary");
      accentColor = hexToRgbTriplet(primary) ?? baseColor;
    }

    function applyTextStyle() {
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      context!.font = `12px ${fontFamily}`;
      context!.textBaseline = "top";
    }

    /** (Re)construit la grille, place les mots, puis peint le bruit de fond. */
    function build() {
      const rect = host!.getBoundingClientRect();
      width = Math.floor(rect.width);
      height = Math.floor(rect.height);
      if (width <= 0 || height <= 0) return;

      ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.floor(width * ratio);
      canvas!.height = Math.floor(height * ratio);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;

      columns = Math.ceil(width / CELL_WIDTH);
      rows = Math.ceil(height / CELL_HEIGHT);

      readTheme();
      litCells.clear();

      const random = createRandom(columns * 7919 + rows * 104729);
      cells = new Array(columns * rows);
      for (let index = 0; index < cells.length; index += 1) {
        cells[index] = {
          noise: NOISE_CHARS[Math.floor(random() * NOISE_CHARS.length)],
          letter: null,
          glow: 0,
        };
      }

      // Un mot par bande horizontale, jamais collé au bord.
      const usableRows = Math.max(rows - 2, 1);
      HIDDEN_WORDS.forEach((word, wordIndex) => {
        if (word.length + 4 >= columns) return;
        const row =
          1 + Math.floor(((wordIndex + random() * 0.6) / HIDDEN_WORDS.length) * usableRows);
        const column = 2 + Math.floor(random() * Math.max(columns - word.length - 4, 1));
        for (let offset = 0; offset < word.length; offset += 1) {
          const cell = cells[row * columns + column + offset];
          if (cell) cell.letter = word[offset];
        }
      });

      paintStatic();
    }

    /** Le bruit au repos : peint une fois, il ne bouge plus. */
    function paintStatic() {
      applyTextStyle();
      context!.clearRect(0, 0, width, height);
      context!.fillStyle = `rgba(${baseColor}, 0.07)`;
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const cell = cells[row * columns + column];
          if (cell) context!.fillText(cell.noise, column * CELL_WIDTH, row * CELL_HEIGHT);
        }
      }
    }

    function drawCell(index: number) {
      const cell = cells[index];
      if (!cell) return;

      const row = Math.floor(index / columns);
      const column = index % columns;
      const x = column * CELL_WIDTH;
      const y = row * CELL_HEIGHT;

      context!.clearRect(x, y, CELL_WIDTH, CELL_HEIGHT);

      const eased = cell.glow * cell.glow;
      if (cell.letter) {
        // Lettre cachée : elle se brouille, puis se verrouille sous la lumière.
        const locked = cell.glow > LOCK_THRESHOLD;
        const glyph = locked
          ? cell.letter
          : cell.glow > 0.18
            ? NOISE_CHARS[Math.floor(Math.random() * NOISE_CHARS.length)]
            : cell.noise;
        context!.fillStyle = `rgba(${accentColor}, ${0.07 + eased * 0.93})`;
        context!.fillText(glyph, x, y);
      } else {
        context!.fillStyle = `rgba(${baseColor}, ${0.07 + eased * 0.33})`;
        context!.fillText(cell.noise, x, y);
      }
    }

    /**
     * Met à jour l'union de deux ensembles : les cellules sous le pointeur et
     * celles encore allumées ailleurs. Sans cette union, un déplacement rapide
     * laisserait derrière lui des cellules figées en pleine lumière.
     */
    function tick() {
      frame = 0;

      const touched = new Set<number>(litCells);

      if (pointerInside) {
        const reach = REVEAL_RADIUS + CELL_WIDTH;
        const minColumn = Math.max(Math.floor((pointerX - reach) / CELL_WIDTH), 0);
        const maxColumn = Math.min(Math.ceil((pointerX + reach) / CELL_WIDTH), columns - 1);
        const minRow = Math.max(Math.floor((pointerY - reach) / CELL_HEIGHT), 0);
        const maxRow = Math.min(Math.ceil((pointerY + reach) / CELL_HEIGHT), rows - 1);
        for (let row = minRow; row <= maxRow; row += 1) {
          for (let column = minColumn; column <= maxColumn; column += 1) {
            touched.add(row * columns + column);
          }
        }
      }

      if (touched.size === 0) return;

      applyTextStyle();
      let stillAnimating = false;

      for (const index of touched) {
        const cell = cells[index];
        if (!cell) continue;

        let target = 0;
        if (pointerInside) {
          const row = Math.floor(index / columns);
          const column = index % columns;
          const dx = column * CELL_WIDTH + CELL_WIDTH / 2 - pointerX;
          const dy = row * CELL_HEIGHT + CELL_HEIGHT / 2 - pointerY;
          const distance = Math.hypot(dx, dy);
          if (distance < REVEAL_RADIUS) target = 1 - distance / REVEAL_RADIUS;
        }

        const settled = Math.abs(cell.glow - target) < EXTINCT;
        // Approche exponentielle : la lumière suit le curseur avec inertie.
        cell.glow = settled ? target : cell.glow + (target - cell.glow) * 0.18;

        if (cell.glow <= EXTINCT) {
          cell.glow = 0;
          litCells.delete(index);
        } else {
          litCells.add(index);
        }

        drawCell(index);

        // Une lettre en cours de brouillage doit continuer à s'agiter.
        const scrambling = cell.letter !== null && cell.glow > 0.18 && cell.glow <= LOCK_THRESHOLD;
        if (!settled || scrambling) stillAnimating = true;
      }

      if (stillAnimating) frame = requestAnimationFrame(tick);
    }

    function requestTick() {
      if (!frame) frame = requestAnimationFrame(tick);
    }

    function handlePointerMove(event: PointerEvent) {
      const rect = host!.getBoundingClientRect();
      pointerX = event.clientX - rect.left;
      pointerY = event.clientY - rect.top;
      pointerInside = true;
      requestTick();
    }

    function handlePointerLeave() {
      // On garde la dernière position : les cellules allumées s'éteignent
      // sur place au lieu de rester figées.
      pointerInside = false;
      requestTick();
    }

    build();

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(pointer: fine)");
    const interactive = finePointer.matches && !reduceMotion.matches;

    if (interactive) {
      window.addEventListener("pointermove", handlePointerMove, { passive: true });
      document.addEventListener("pointerleave", handlePointerLeave);
      window.addEventListener("blur", handlePointerLeave);
    }

    const resizeObserver = new ResizeObserver(() => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      build();
    });
    resizeObserver.observe(host);

    // next-themes bascule une classe sur <html> : on repeint aux bonnes couleurs.
    const themeObserver = new MutationObserver(() => {
      readTheme();
      litCells.clear();
      paintStatic();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("blur", handlePointerLeave);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={cn("num pointer-events-none absolute inset-0 text-foreground", className)}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
