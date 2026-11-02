import { cn } from "@/lib/utils";

/** Une valeur chiffrée avec son libellé et sa lecture. */
export function Metric({
  label,
  value,
  hint,
  tone = "neutral",
  large = false,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "positive" | "negative";
  large?: boolean;
}) {
  return (
    <div className="flex h-full flex-col gap-1 bg-card px-5 py-4">
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">{label}</span>
      <span
        className={cn(
          "num font-semibold tracking-[-0.02em]",
          large ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
          tone === "neutral" && "text-foreground"
        )}
      >
        {value}
      </span>
      {hint && <span className="text-xs leading-snug text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function SectionLabel({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="chip chip-violet num px-2 py-0.5 text-[11px]">{index}</span>
      <h2 className="title text-xl text-foreground sm:text-2xl">{children}</h2>
    </div>
  );
}

/** Grille de cellules séparées par un filet, posée dans une carte. */
export function MetricGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="float-card overflow-hidden">
      <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">{children}</div>
    </div>
  );
}

/** Avertissement doux : bloc gris, mention en ambre. */
export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl bg-surface px-4 py-3 text-sm leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}
