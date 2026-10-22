import assert from "node:assert/strict";
import { describe, it } from "node:test";

import nextConfig from "../next.config";
import { PROVIDER_ICONS } from "./provider-icons";
import { PROVIDERS } from "./providers";

describe("icônes des sources", () => {
  it("ne servent que depuis des domaines autorisés par next/image", () => {
    // Un domaine oublié dans next.config fait planter toute page qui
    // affiche l'icône : c'est arrivé avec Strike.
    const allowed = new Set(
      (nextConfig.images?.remotePatterns ?? []).map((pattern) =>
        pattern instanceof URL ? pattern.hostname : pattern.hostname
      )
    );
    for (const [provider, src] of Object.entries(PROVIDER_ICONS)) {
      if (src.startsWith("data:")) continue;
      const { hostname } = new URL(src);
      assert.ok(allowed.has(hostname), `${provider} : ${hostname} absent de next.config`);
    }
  });

  it("existent pour chaque source connectable", () => {
    for (const provider of PROVIDERS) {
      assert.ok(PROVIDER_ICONS[provider.id], `${provider.id} sans icône`);
    }
  });
});
