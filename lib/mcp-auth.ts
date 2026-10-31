/**
 * Métadonnées OAuth du serveur MCP (RFC 9728).
 *
 * Clerk joue le serveur d'autorisation : Claude y inscrit son client
 * (inscription dynamique), l'utilisateur s'y connecte avec son compte
 * Hashory, et le jeton obtenu est vérifié par `auth()` dans la route MCP.
 */

/** Chemin public du serveur MCP. */
export const MCP_PATH = "/api/mcp";

/** Portées OAuth demandées : l'identité suffit, les données passent par Hashory. */
export const MCP_SCOPES = ["profile", "email"];

/**
 * Domaine Clerk (Frontend API) encodé dans la clé publishable :
 * `pk_live_<base64("clerk.exemple.com$")>`.
 */
export function frontendApiFromPublishableKey(key: string | undefined): string | null {
  const match = key?.match(/^pk_(?:test|live)_(.+)$/);
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const host = decoded.endsWith("$") ? decoded.slice(0, -1) : "";
    return /^[a-z0-9.-]+$/i.test(host) ? host : null;
  } catch {
    return null;
  }
}

/**
 * URL du domaine Clerk (Frontend API), qui émet les jetons OAuth. C'est le
 * même domaine que l'émetteur des jetons Convex.
 *
 * `CLERK_JWT_ISSUER_DOMAIN` est souvent défini côté Convex seulement : à
 * défaut, le domaine est lu dans la clé publishable, toujours présente côté
 * Next.js. Sans cela, les métadonnées OAuth répondaient en erreur et Claude ne
 * pouvait pas se connecter.
 */
export function clerkIssuer(): string {
  const domain =
    process.env.CLERK_JWT_ISSUER_DOMAIN?.trim() ||
    frontendApiFromPublishableKey(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  if (!domain) {
    throw new Error("Domaine Clerk introuvable : définissez CLERK_JWT_ISSUER_DOMAIN ou NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.");
  }
  const url = domain.startsWith("http") ? domain : `https://${domain}`;
  return url.replace(/\/+$/, "");
}

/** Métadonnées de la ressource protégée, servies sous `/.well-known`. */
export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}${MCP_PATH}`,
    authorization_servers: [clerkIssuer()],
    scopes_supported: MCP_SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "Hashory",
  };
}

export const METADATA_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Cache-Control": "public, max-age=3600",
};
