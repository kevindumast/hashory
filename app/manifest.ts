import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Oracly",
    short_name: "Oracly",
    description:
      "Predict. Optimize. Master your crypto portfolio with Oracly's real-time intelligence across devices.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8fb",
    theme_color: "#2563eb",
    scope: "/",
    orientation: "portrait",
    lang: "fr-FR",
    dir: "ltr",
    icons: [
      {
        src: "/icons/oracly-icon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
      {
        src: "/icons/oracly-icon-maskable.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "maskable",
      },
    ],
  };
}
