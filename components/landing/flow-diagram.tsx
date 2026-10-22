import Image from "next/image";
import { HashoryLogo } from "@/components/hashory-logo";
import { providerIcon } from "@/lib/provider-icons";

/** Sources à gauche (côté collecte), lectures à droite (côté restitution). */
const SOURCES = [
  { id: "binance", label: "Binance", y: 12 },
  { id: "kraken", label: "Kraken", y: 30 },
  { id: "bitcoin", label: "Bitcoin", y: 48 },
  { id: "ethereum", label: "Ethereum", y: 66 },
  { id: "finary", label: "Export CSV", y: 84 },
];

const OUTPUTS = [
  { label: "P&L par actif", y: 18 },
  { label: "Répartition", y: 36 },
  { label: "Plus-values 150 VH bis", y: 54 },
];

// Points d'ancrage dans le repère 0→100 du schéma.
const LEFT_X = 31;
const RIGHT_X = 66;
const HUB = { x: 50, y: 42 };

/** Courbe horizontale douce entre deux points (tangentes à plat). */
function curve(x1: number, y1: number, x2: number, y2: number) {
  const mid = (x1 + x2) / 2;
  return `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`;
}

/**
 * Schéma du hero : les sources convergent vers Hashory, qui restitue des
 * lectures. Tout est positionné en pourcentage pour suivre la taille du
 * conteneur ; les flux sont animés en CSS (`.dash-flow`).
 */
export function FlowDiagram() {
  return (
    <div className="relative h-full w-full" aria-hidden="true">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        {SOURCES.map((source) => (
          <path
            key={source.id}
            d={curve(LEFT_X, source.y, HUB.x - 4, HUB.y)}
            fill="none"
            className="dash-flow stroke-violet/50"
            strokeWidth={1.25}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {OUTPUTS.map((output) => (
          <path
            key={output.label}
            d={curve(HUB.x + 4, HUB.y, RIGHT_X, output.y)}
            fill="none"
            className="dash-flow stroke-jade/60"
            strokeWidth={1.25}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {/* Libellés de colonne */}
      <span className="eyebrow absolute left-0 top-0 -translate-y-8 text-[11px]">Sources</span>
      <span className="eyebrow absolute right-0 top-0 -translate-y-8 text-[11px] text-jade">
        Lectures
      </span>

      {SOURCES.map((source) => (
        <div
          key={source.id}
          className="chip chip-violet absolute left-0 -translate-y-1/2 bg-card shadow-[0_8px_24px_-16px_rgba(21,27,35,0.4)] ring-1 ring-line"
          style={{ top: `${source.y}%`, width: `${LEFT_X}%` }}
        >
          <Image
            src={providerIcon(source.id)}
            alt=""
            width={16}
            height={16}
            className="size-4 rounded-full"
            unoptimized
          />
          <span className="truncate text-foreground">{source.label}</span>
        </div>
      ))}

      {/* Le moyeu : Hashory, avec son halo */}
      <div
        className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3"
        style={{ left: `${HUB.x}%`, top: `${HUB.y}%` }}
      >
        <div className="relative">
          <div className="absolute -inset-10 rounded-full bg-violet/15 blur-2xl" />
          <HashoryLogo size={52} className="relative" />
        </div>
        <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-foreground">
          Hashory
        </span>
      </div>

      {OUTPUTS.map((output) => (
        <div
          key={output.label}
          className="chip chip-jade absolute right-0 -translate-y-1/2 justify-center whitespace-nowrap"
          style={{ top: `${output.y}%`, left: `${RIGHT_X}%` }}
        >
          {output.label}
        </div>
      ))}

      {/* Carte d'état, comme un relevé de terminal */}
      <div className="float-card absolute bottom-0 right-0 w-[min(100%,15rem)] rounded-2xl px-4 py-3.5">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-jade">
          <span className="pulse-ring size-1.5 rounded-full bg-jade" />
          Synchronisation active
        </p>
        <div className="mt-2 space-y-1 text-[13px] text-muted-foreground">
          <div>
            Sources : <span className="text-slate">exchanges, wallets, CSV</span>
          </div>
          <div>
            Historique : <span className="text-slate">depuis le premier achat</span>
          </div>
          <div>
            Accès : <span className="text-slate">lecture seule</span>
          </div>
        </div>
      </div>
    </div>
  );
}
