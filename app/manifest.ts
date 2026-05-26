import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hashory",
    short_name: "Hashory",
    description:
      "Predict. Optimize. Master your crypto portfolio with Hashory's real-time intelligence across devices.",
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
