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
 * URL du domaine Clerk (Frontend API), qui émet les jetons OAuth. C'est le
 * même domaine que l'émetteur des jetons Convex.
 *
 * `CLERK_JWT_ISSUER_DOMAIN` n'existe que côté Convex : sur Vercel, l'absence
 * de cette variable faisait échouer toutes les métadonnées OAuth, et Claude
 * ne pouvait pas s'inscrire. On se rabat donc sur `CLERK_ISSUER_URL`, puis
 * sur le domaine encodé dans la clé publique Clerk (`pk_…_<base64>$`).
 */
export function clerkIssuer(): string {
  const domain =
    process.env.CLERK_JWT_ISSUER_DOMAIN ||
    process.env.CLERK_ISSUER_URL ||
    domainFromPublishableKey(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  if (!domain) throw new Error("Domaine Clerk introuvable : définir CLERK_JWT_ISSUER_DOMAIN.");
  const url = domain.startsWith("http") ? domain : `https://${domain}`;
  return url.replace(/\/+$/, "");
}

/** Domaine Frontend API encodé dans une clé publique Clerk, ou null. */
export function domainFromPublishableKey(key: string | undefined): string | null {
  const encoded = key?.match(/^pk_(?:test|live)_(.+)$/)?.[1];
  if (!encoded) return null;
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  return decoded.endsWith("$") ? decoded.slice(0, -1) : null;
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
