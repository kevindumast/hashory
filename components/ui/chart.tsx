"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"
import { cn } from "@/lib/utils"

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
]

type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<string, string> }
  )
}

const ChartContext = React.createContext<{
  config: ChartConfig
} | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }

  return context
}

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    config: ChartConfig
    children: React.ReactNode
  }
>(({ id, className, children, config, ...props }, ref) => {
  return (
    <ChartContext.Provider value={{ config }}>
      <div
        ref={ref}
        className={cn(
          "w-full h-full",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </ChartContext.Provider>
  )
})
ChartContainer.displayName = "ChartContainer"

const ChartTooltip = RechartsPrimitive.Tooltip

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> &
    Pick<RechartsPrimitive.TooltipProps, "active" | "payload" | "label">
>(({ active, payload, label, className }, ref) => {
  const { config } = useChart()

  if (active && payload && payload.length) {
    return (
      <div
        ref={ref}
        className={cn(
          "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
          className
        )}
      >
        {label && (
          <div className="text-muted-foreground">{label}</div>
        )}
        {payload.map((item, index) => {
          const key = `${item.dataKey}`
          const itemConfig = config[key as keyof typeof config]
          const value = item.value

          return (
            <div
              key={`${key}-${index}`}
              className="flex w-full items-center gap-2"
            >
              {itemConfig?.theme ? (
                <div
                  className="shrink-0 rounded-full border-[--color-border]"
                  style={{
                    backgroundColor: item.color,
                  }}
                />
              ) : (
                <div
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{
                    backgroundColor: item.color,
                  }}
                />
              )}
              <div className="flex items-center justify-between gap-8">
                <span className="text-muted-foreground">
                  {itemConfig?.label || key}
                </span>
                <span className="font-mono font-medium text-foreground">
                  {value}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return null
})
ChartTooltipContent.displayName = "ChartTooltipContent"

const ChartLegend = RechartsPrimitive.Legend

const ChartLegendContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> &
    Pick<RechartsPrimitive.LegendProps, "payload" | "verticalAlign">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-wrap items-center justify-center gap-4 [&>*]:basis-[calc(var(--items,3)_*_25%)]",
      className
    )}
    {...props}
  />
))
ChartLegendContent.displayName = "ChartLegendContent"

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartContext,
  useChart,
  type ChartConfig,
  CHART_COLORS,
}
