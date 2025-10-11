import { ReactNode } from "react";

type MetricPoint = {
  label: string;
  value: number;
};

type MetricChartProps = {
  title: string;
  description?: string;
  points: MetricPoint[];
  footer?: ReactNode;
};

export function MetricChart({ title, description, points, footer }: MetricChartProps) {
  const maxValue = points.length > 0 ? Math.max(...points.map((point) => point.value)) : 1;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card/80 p-6 shadow-sm backdrop-blur">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">{title}</p>
        {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex h-40 items-end gap-2">
        {points.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            Aucune donnée. Connectez Binance pour commencer la synchronisation.
          </div>
        ) : (
          points.map((point) => (
            <div key={point.label} className="flex w-full flex-col items-center">
              <div
                className="w-4 rounded-full bg-primary transition-all"
                style={{
                  height: `${Math.max(8, Math.round((point.value / maxValue) * 100))}%`,
                }}
              />
              <span className="mt-2 text-xs text-muted-foreground">{point.label}</span>
            </div>
          ))
        )}
      </div>
      {footer}
    </div>
  );
}
