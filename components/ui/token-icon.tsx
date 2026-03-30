"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useCmcTokenMap } from "@/hooks/useCmcTokenMap";

interface TokenIconProps {
  symbol: string;
  className?: string;
  size?: 64 | 128 | 200;
}

export function TokenIcon({ symbol, className, size = 64 }: TokenIconProps) {
  const { getCmcIconUrl } = useCmcTokenMap();

  const cmcUrl = getCmcIconUrl(symbol);

  // Fallback vers CoinCap si CMC n'a pas le token
  const fallbackUrl = `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`;

  return (
    <Avatar className={cn("h-8 w-8", className)}>
      <AvatarImage src={cmcUrl ?? fallbackUrl} alt={symbol} />
      <AvatarFallback className="text-[9px] font-bold">
        {symbol.slice(0, 3).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
