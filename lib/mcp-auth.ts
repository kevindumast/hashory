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
 */
export function clerkIssuer(): string {
  const domain = process.env.CLERK_JWT_ISSUER_DOMAIN;
  if (!domain) throw new Error("CLERK_JWT_ISSUER_DOMAIN n'est pas défini.");
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
