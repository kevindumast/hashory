import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hashory",
    short_name: "Hashory",
    description:
      "Tous vos actifs crypto — CEX, DEX et wallets on-chain — dans un seul terminal.",
    start_url: "/",
    display: "standalone",
    background_color: "#070d1f",
    theme_color: "#070d1f",
    scope: "/",
    orientation: "portrait",
    lang: "fr-FR",
    dir: "ltr",
    icons: [
      {
        src: "/icons/hashory-icon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
      {
        src: "/icons/hashory-icon-maskable.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "maskable",
      },
    ],
  };
}
