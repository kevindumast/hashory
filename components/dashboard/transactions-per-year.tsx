"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { countTransactionsByYear } from "@/lib/transactions-by-year"
import type { TransactionEntry } from "@/hooks/dashboard/useDashboardMetrics"

const format = (value: number) => value.toLocaleString("fr-FR")

/** Années affichées avant de déplier : la liste des comptes reste à portée sur mobile. */
const VISIBLE_YEARS = 5

const headCell = "py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.16em] text-faint"

/** Nombre de transactions par année, tous comptes confondus. */
export function TransactionsPerYear({
  transactions,
  className,
}: {
  transactions: TransactionEntry[]
  className?: string
}) {
  const rows = React.useMemo(() => countTransactionsByYear(transactions), [transactions])
  const [expanded, setExpanded] = React.useState(false)
  if (rows.length === 0) return null

  const hiddenCount = rows.length - VISIBLE_YEARS
  const visibleRows = expanded || hiddenCount <= 0 ? rows : rows.slice(0, VISIBLE_YEARS)

  const max = Math.max(...rows.map((row) => row.total))
  const totals = rows.reduce(
    (acc, row) => ({
      trades: acc.trades + row.trades,
      deposits: acc.deposits + row.deposits,
      withdrawals: acc.withdrawals + row.withdrawals,
      total: acc.total + row.total,
    }),
    { trades: 0, deposits: 0, withdrawals: 0, total: 0 }
  )

  return (
    <section className={cn("float-card overflow-hidden", className)} aria-labelledby="tx-per-year-title">
      <div className="flex items-end justify-between gap-3 px-4 pt-4 pb-3 sm:px-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">Activité</p>
          <h2 id="tx-per-year-title" className="title mt-1 text-lg text-foreground">
            Transactions par an
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {rows.length} année{rows.length > 1 ? "s" : ""}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-line bg-surface/60">
              <th scope="col" className={cn(headCell, "pl-4 pr-2 text-left sm:pl-5")}>Année</th>
              <th scope="col" className={cn(headCell, "px-2")}>Trades</th>
              <th scope="col" className={cn(headCell, "px-2")}>Dépôts</th>
              <th scope="col" className={cn(headCell, "px-2")}>Retraits</th>
              <th scope="col" className={cn(headCell, "pl-2 pr-4 sm:pr-5")}>Total</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.year} className="border-b border-line/70 last:border-b-0">
                <th scope="row" className="py-2.5 pl-4 pr-2 text-left num font-semibold text-foreground sm:pl-5">
                  {row.year}
                </th>
                <td className="px-2 py-2.5 text-right num text-muted-foreground">{format(row.trades)}</td>
                <td className="px-2 py-2.5 text-right num text-muted-foreground">{format(row.deposits)}</td>
                <td className="px-2 py-2.5 text-right num text-muted-foreground">{format(row.withdrawals)}</td>
                <td className="py-2.5 pl-2 pr-4 sm:pr-5">
                  <div className="flex items-center justify-end gap-3">
                    <span className="hidden h-1.5 w-24 rounded-full bg-muted sm:block" aria-hidden>
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${(row.total / max) * 100}%` }}
                      />
                    </span>
                    <span className="num font-bold text-foreground">{format(row.total)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 1 && (
            <tfoot>
              <tr className="border-t border-line bg-surface/60">
                <th scope="row" className="py-2.5 pl-4 pr-2 text-left text-[10px] font-bold uppercase tracking-[0.16em] text-faint sm:pl-5">
                  Total
                </th>
                <td className="px-2 py-2.5 text-right num font-semibold text-foreground">{format(totals.trades)}</td>
                <td className="px-2 py-2.5 text-right num font-semibold text-foreground">{format(totals.deposits)}</td>
                <td className="px-2 py-2.5 text-right num font-semibold text-foreground">{format(totals.withdrawals)}</td>
                <td className="py-2.5 pl-2 pr-4 text-right num font-bold text-foreground sm:pr-5">{format(totals.total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex w-full cursor-pointer items-center justify-center gap-1.5 border-t border-line py-2.5 text-xs font-bold text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
        >
          {expanded ? "Afficher moins" : `Afficher les ${rows.length} années`}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
        </button>
      )}
    </section>
  )
}
