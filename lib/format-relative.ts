const relativeTime = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" })

/** « il y a 5 minutes », « hier »… à partir d'un horodatage en millisecondes. */
export function formatRelative(timestamp: number, now: number = Date.now()): string {
  const diff = timestamp - now
  const minutes = Math.round(diff / 60000)
  if (Math.abs(minutes) < 60) return relativeTime.format(minutes, "minute")
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return relativeTime.format(hours, "hour")
  return relativeTime.format(Math.round(hours / 24), "day")
}
