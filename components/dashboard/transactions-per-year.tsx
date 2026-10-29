"use client"

import * as React from "react"

import { countTransactionsByYear } from "@/lib/transactions-by-year"
import type { TransactionEntry } from "@/hooks/dashboard/useDashboardMetrics"

const format = (value: number) => value.toLocaleString("fr-FR")

/** Nombre de transactions par année, tous comptes confondus. */
export function TransactionsPerYear({ transactions }: { transactions: TransactionEntry[] }) {
  const rows = React.useMemo(() => countTransactionsByYear(transactions), [transactions])
  if (rows.length === 0) return null

  const max = Math.max(...rows.map((row) => row.total))

  return (
    <section className="mt-9 rounded-lg border border-border bg-card">
      <div className="px-5 pt-4 pb-3">
        <p className="num text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Activité</p>
        <h2 className="title text-lg leading-tight text-foreground">Transactions par an</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-border">
              <th className="px-5 py-2 text-left num text-[10px] uppercase tracking-[0.24em] text-muted-foreground font-normal">Année</th>
              <th className="px-3 py-2 text-right num text-[10px] uppercase tracking-[0.24em] text-muted-foreground font-normal">Trades</th>
              <th className="px-3 py-2 text-right num text-[10px] uppercase tracking-[0.24em] text-muted-foreground font-normal">Dépôts</th>
              <th className="px-3 py-2 text-right num text-[10px] uppercase tracking-[0.24em] text-muted-foreground font-normal">Retraits</th>
              <th className="px-5 py-2 text-right num text-[10px] uppercase tracking-[0.24em] text-muted-foreground font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.year} className="border-b border-border/60 last:border-b-0">
                <td className="px-5 py-2.5 num font-semibold text-foreground">{row.year}</td>
                <td className="px-3 py-2.5 text-right num text-muted-foreground">{format(row.trades)}</td>
                <td className="px-3 py-2.5 text-right num text-muted-foreground">{format(row.deposits)}</td>
                <td className="px-3 py-2.5 text-right num text-muted-foreground">{format(row.withdrawals)}</td>
                <td className="px-5 py-2.5">
                  <div className="flex items-center justify-end gap-3">
                    <span className="hidden sm:block h-1.5 w-24 rounded-full bg-muted" aria-hidden>
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${(row.total / max) * 100}%` }} />
                    </span>
                    <span className="num font-bold text-foreground">{format(row.total)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
