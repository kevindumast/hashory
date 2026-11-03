import { cn } from "@/lib/utils"

/**
 * Devises fiat : aucune icône CMC, on dessine le signe monétaire sur une
 * pastille aux couleurs de la devise.
 */
const FIAT_ICONS: Record<string, { glyph: string; bg: string }> = {
  EUR: { glyph: "€", bg: "#003399" },
  USD: { glyph: "$", bg: "#2E7D32" },
  GBP: { glyph: "£", bg: "#5B2C83" },
  CHF: { glyph: "₣", bg: "#D52B1E" },
  JPY: { glyph: "¥", bg: "#BC002D" },
}

export function hasFiatIcon(symbol: string): boolean {
  return symbol.toUpperCase() in FIAT_ICONS
}

export function FiatIcon({ symbol, size = 28, className }: { symbol: string; size?: number; className?: string }) {
  const fiat = FIAT_ICONS[symbol.toUpperCase()]
  if (!fiat) return null
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, backgroundColor: fiat.bg, fontSize: Math.round(size * 0.55) }}
      className={cn("flex shrink-0 items-center justify-center rounded-full font-bold leading-none text-white", className)}
    >
      {fiat.glyph}
    </span>
  )
}
