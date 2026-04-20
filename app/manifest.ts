import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Termenva",
    short_name: "Termenva",
    description:
      "Predict. Optimize. Master your crypto portfolio with Termenva's real-time intelligence across devices.",
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
        src: "/icons/termenva-icon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
      {
        src: "/icons/termenva-icon-maskable.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "maskable",
      },
    ],
  };
}
