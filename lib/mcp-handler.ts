import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { RATE_LIMIT_PER_MINUTE } from "./mcp";
import { createHashoryMcpServer, type McpData } from "./mcp-server";

/**
 * Point d'entrée du serveur MCP (transport HTTP « streamable », sans
 * session, réponses JSON). Les dépendances sont injectées : la route branche
 * Clerk et Convex (`lib/mcp-deps.ts`), les tests des doublures.
 */

export type AuthenticatedUser = {
  userId: string;
  /** Client OAuth (application Claude) qui a obtenu le jeton. */
  clientId: string | null;
};

export type McpDeps = {
  /** Utilisateur du jeton OAuth de la requête, ou null s'il est absent ou invalide. */
  authenticate(request: Request): Promise<AuthenticatedUser | null>;
  /** Refus si l'utilisateur a coupé l'accès ; sinon compte la requête dans la minute. */
  authorize(userId: string): Promise<{ status: "ok"; requestsThisMinute: number } | { status: "disabled" }>;
  audit(entry: { userId: string; clientId: string | null; tool: string; rowCount: number; ip: string | null }): Promise<void>;
  data(userId: string): McpData;
};

/** Corps de requête accepté (un appel d'outil ne fait que quelques centaines d'octets). */
export const MAX_REQUEST_BYTES = 64 * 1024;
/** Durée maximale de traitement d'une requête. */
export const REQUEST_TIMEOUT_MS = 25_000;

// Clients navigateur autorisés ; les serveurs de Claude et les clients locaux n'envoient pas d'en-tête Origin.
const ALLOWED_ORIGINS = ["https://claude.ai", "https://claude.com"];

const SECURITY_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex",
  "X-Content-Type-Options": "nosniff",
};

function error(status: number, message: string, headers: Record<string, string> = {}) {
  return Response.json({ error: message }, { status, headers: { ...SECURITY_HEADERS, ...headers } });
}

function isLocal(url: URL) {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || null;
}

/** URL des métadonnées OAuth, annoncée dans l'en-tête d'un refus 401. */
export function resourceMetadataUrl(url: URL) {
  return `${url.origin}/.well-known/oauth-protected-resource${url.pathname}`;
}

export async function handleMcpRequest(request: Request, deps: McpDeps): Promise<Response> {
  const url = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if ((url.protocol !== "https:" || forwardedProto === "http") && !isLocal(url)) {
    return error(403, "HTTPS requis.");
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin && !ALLOWED_ORIGINS.includes(origin)) {
    return error(403, "Origine non autorisée.");
  }

  // Authentification avant tout le reste : sans jeton, rien n'est révélé sur le serveur.
  const user = await deps.authenticate(request);
  if (!user) {
    return error(401, "Connexion à Hashory requise.", {
      "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl(url)}"`,
    });
  }

  const access = await deps.authorize(user.userId);
  if (access.status === "disabled") {
    return error(403, "L'accès de Claude est coupé. Réactivez-le dans Hashory, Réglages › Connecter Claude.");
  }
  if (access.requestsThisMinute > RATE_LIMIT_PER_MINUTE) {
    return error(429, "Trop de requêtes : réessayez dans une minute.", { "Retry-After": "60" });
  }

  // Transport sans état : ni flux SSE à ouvrir (GET) ni session à fermer (DELETE).
  if (request.method !== "POST") return error(405, "Méthode non autorisée.", { Allow: "POST" });

  const ip = clientIp(request);
  const server = createHashoryMcpServer(
    {
      audit: (tool, rowCount) => deps.audit({ userId: user.userId, clientId: user.clientId, tool, rowCount, ip }),
    },
    deps.data(user.userId)
  );
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: MAX_REQUEST_BYTES,
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await server.connect(transport);
    const timeout = new Promise<Response>((resolve) => {
      timer = setTimeout(() => resolve(error(504, "Délai dépassé.")), REQUEST_TIMEOUT_MS);
    });
    const response = await Promise.race([transport.handleRequest(request), timeout]);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
    return new Response(response.body, { status: response.status, headers });
  } finally {
    clearTimeout(timer);
    await server.close();
  }
}
