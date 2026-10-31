import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { clerkIssuer, frontendApiFromPublishableKey, protectedResourceMetadata } from "./mcp-auth";

const key = (host: string, env = "live") => `pk_${env}_${Buffer.from(`${host}$`).toString("base64")}`;

const saved = {
  issuer: process.env.CLERK_JWT_ISSUER_DOMAIN,
  publishable: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
};

function setEnv(issuer: string | undefined, publishable: string | undefined) {
  if (issuer === undefined) delete process.env.CLERK_JWT_ISSUER_DOMAIN;
  else process.env.CLERK_JWT_ISSUER_DOMAIN = issuer;
  if (publishable === undefined) delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  else process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = publishable;
}

afterEach(() => setEnv(saved.issuer, saved.publishable));

describe("frontendApiFromPublishableKey", () => {
  it("décode le domaine Clerk d'une clé de production ou de test", () => {
    assert.equal(frontendApiFromPublishableKey(key("clerk.hashory.app")), "clerk.hashory.app");
    assert.equal(
      frontendApiFromPublishableKey(key("fine-cat-12.clerk.accounts.dev", "test")),
      "fine-cat-12.clerk.accounts.dev"
    );
  });

  it("rejette une clé absente ou mal formée", () => {
    assert.equal(frontendApiFromPublishableKey(undefined), null);
    assert.equal(frontendApiFromPublishableKey("sk_live_abc"), null);
    assert.equal(frontendApiFromPublishableKey(`pk_live_${Buffer.from("pas un domaine").toString("base64")}`), null);
  });
});

describe("clerkIssuer", () => {
  it("préfère CLERK_JWT_ISSUER_DOMAIN", () => {
    setEnv("https://clerk.exemple.com/", key("autre.exemple.com"));
    assert.equal(clerkIssuer(), "https://clerk.exemple.com");
  });

  it("se rabat sur la clé publishable quand la variable n'existe que côté Convex", () => {
    setEnv(undefined, key("clerk.hashory.app"));
    assert.equal(clerkIssuer(), "https://clerk.hashory.app");
    assert.deepEqual(protectedResourceMetadata("https://hashory.app").authorization_servers, [
      "https://clerk.hashory.app",
    ]);
  });

  it("échoue clairement sans aucune des deux", () => {
    setEnv(undefined, undefined);
    assert.throws(() => clerkIssuer(), /Domaine Clerk introuvable/);
  });
});
