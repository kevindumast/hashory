"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useCmcTokenMap } from "@/hooks/useCmcTokenMap";

interface TokenIconProps {
  symbol: string;
  className?: string;
}

export function TokenIcon({ symbol, className }: TokenIconProps) {
  const { getCmcIconUrl } = useCmcTokenMap([symbol]);

  const cmcUrl = getCmcIconUrl(symbol);

  return (
    <Avatar className={cn("h-8 w-8", className)}>
      {cmcUrl && <AvatarImage src={cmcUrl} alt={symbol} />}
      <AvatarFallback className="text-[9px] font-bold">
        {symbol.slice(0, 3).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
