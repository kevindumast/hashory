/**
 * Nombre de transactions par année civile, ventilé par nature. L'année est
 * celle du fuseau de l'utilisateur, comme les dates affichées partout.
 */

export type YearlyTransactionCount = {
  year: number;
  trades: number;
  deposits: number;
  withdrawals: number;
  total: number;
};

type Entry =
  | { type: "trade"; executedAt: number }
  | { type: "deposit" | "withdrawal"; timestamp: number };

/** Années de la plus récente à la plus ancienne. */
export function countTransactionsByYear(entries: Entry[]): YearlyTransactionCount[] {
  const byYear = new Map<number, YearlyTransactionCount>();
  for (const entry of entries) {
    const time = entry.type === "trade" ? entry.executedAt : entry.timestamp;
    if (!Number.isFinite(time) || time <= 0) continue;
    const year = new Date(time).getFullYear();
    const row = byYear.get(year) ?? { year, trades: 0, deposits: 0, withdrawals: 0, total: 0 };
    if (entry.type === "trade") row.trades += 1;
    else if (entry.type === "deposit") row.deposits += 1;
    else row.withdrawals += 1;
    row.total += 1;
    byYear.set(year, row);
  }
  return [...byYear.values()].sort((a, b) => b.year - a.year);
}
