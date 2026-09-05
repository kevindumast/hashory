import Image from "next/image";
import { providerIcon } from "@/lib/provider-icons";

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
];

/**
 * Bandeau défilant des sources supportées, traité comme une ligne de terminal
 * plutôt que comme une rangée de logos : pas de pastilles, juste des filets.
 * La piste est dupliquée pour boucler sans couture ; la copie est masquée
 * aux lecteurs d'écran.
 */
export function PlatformMarquee() {
  return (
    <div className="marquee-host marquee-mask relative w-full overflow-hidden">
      <div className="marquee-track flex w-max items-stretch [--marquee-duration:44s]">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-stretch" aria-hidden={copy === 1}>
            {PLATFORMS.map((platform) => (
              <div
                key={`${copy}-${platform.name}`}
                className="flex shrink-0 items-center gap-2.5 border-r border-border/50 px-6 py-3"
              >
                <Image
                  src={providerIcon(platform.id)}
                  alt=""
                  width={18}
                  height={18}
                  className="size-[18px] rounded-full opacity-70"
                  unoptimized
                />
                <span className="text-sm text-foreground/70">{platform.name}</span>
                <span className="num text-[10px] uppercase tracking-widest text-muted-foreground/50">
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
