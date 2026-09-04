import Image from "next/image";

/** Plateformes réellement branchées côté backend (convex/). */
const PLATFORMS = [
  { name: "Binance", icon: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/270.png", kind: "API" },
  { name: "KuCoin", icon: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/311.png", kind: "API" },
  { name: "Bitcoin", icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/1.png", kind: "Wallet" },
  { name: "Ethereum", icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png", kind: "Wallet" },
  { name: "Solana", icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png", kind: "Wallet" },
  { name: "Kaspa", icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/20396.png", kind: "Wallet" },
  { name: "Bittensor", icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/22974.png", kind: "Wallet" },
  { name: "Bitstack", icon: "https://bitcoin.fr/wp-content/uploads/2022/05/Bitstack.jpg", kind: "CSV" },
  { name: "Finary", icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/1.png", kind: "CSV" },
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
                  src={platform.icon}
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
