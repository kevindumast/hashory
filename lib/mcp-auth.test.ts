import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { clerkIssuer, domainFromPublishableKey } from "./mcp-auth";

const KEYS = ["CLERK_JWT_ISSUER_DOMAIN", "CLERK_ISSUER_URL", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const publishableKey = (domain: string) => `pk_live_${Buffer.from(`${domain}$`).toString("base64")}`;

describe("clerkIssuer", () => {
  it("lit le domaine de la clé publique quand aucune variable d'émetteur n'existe (cas Vercel)", () => {
    for (const key of KEYS) delete process.env[key];
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = publishableKey("clerk.example.com");
    assert.equal(clerkIssuer(), "https://clerk.example.com");
  });

  it("préfère les variables explicites", () => {
    process.env.CLERK_JWT_ISSUER_DOMAIN = "";
    process.env.CLERK_ISSUER_URL = "https://issuer.example.com/";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = publishableKey("clerk.example.com");
    assert.equal(clerkIssuer(), "https://issuer.example.com");
  });
});

describe("domainFromPublishableKey", () => {
  it("rejette une clé mal formée", () => {
    assert.equal(domainFromPublishableKey(undefined), null);
    assert.equal(domainFromPublishableKey("sk_live_abc"), null);
    assert.equal(domainFromPublishableKey(`pk_test_${Buffer.from("sans-dollar").toString("base64")}`), null);
  });
});
