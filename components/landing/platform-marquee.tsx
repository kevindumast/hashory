import Image from "next/image";
import { providerIcon } from "@/lib/provider-icons";
import { cn } from "@/lib/utils";

/** Plateformes réellement branchées côté backend (convex/). */
const PLATFORMS = [
  { name: "Binance", id: "binance", kind: "API" },
  { name: "KuCoin", id: "kucoin", kind: "API" },
  { name: "Kraken", id: "kraken", kind: "API" },
  { name: "Bitcoin", id: "bitcoin", kind: "Wallet" },
  { name: "Ethereum", id: "ethereum", kind: "Wallet" },
  { name: "Solana", id: "solana", kind: "Wallet" },
  { name: "Kaspa", id: "kaspa", kind: "Wallet" },
  { name: "Bittensor", id: "tao", kind: "Wallet" },
  { name: "Bitstack", id: "bitstack", kind: "CSV" },
  { name: "Finary", id: "finary", kind: "CSV" },
  { name: "Strike", id: "strike", kind: "CSV" },
];

/**
 * Bandeau défilant des sources supportées : une pastille par source,
 * violette pour les API, jade pour les wallets, neutre pour les fichiers.
 * La piste est dupliquée pour boucler sans couture ; la copie est masquée
 * aux lecteurs d'écran.
 */
export function PlatformMarquee() {
  return (
    <div className="marquee-host marquee-mask relative w-full overflow-hidden">
      <div className="marquee-track flex w-max items-center [--marquee-duration:44s]">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center gap-3 pr-3" aria-hidden={copy === 1}>
            {PLATFORMS.map((platform) => (
              <div
                key={`${copy}-${platform.name}`}
                className={cn(
                  "chip shrink-0 gap-2.5 bg-card px-4 py-2 ring-1 ring-line",
                  platform.kind === "API" && "text-violet",
                  platform.kind === "Wallet" && "text-jade"
                )}
              >
                <Image
                  src={providerIcon(platform.id)}
                  alt=""
                  width={18}
                  height={18}
                  className="size-[18px] rounded-full"
                  unoptimized
                />
                <span className="text-sm text-foreground">{platform.name}</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.16em]">
                  {platform.kind}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
