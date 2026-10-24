import { auth } from "@clerk/nextjs/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { NextRequest, NextResponse } from "next/server";
import { protectedResourceMetadataUrl } from "@/lib/mcp-auth";
import { createHashoryMcpServer } from "@/lib/mcp-server";

/**
 * Point d'entrée MCP (transport HTTP « streamable », sans session).
 *
 * Chaque requête porte un jeton OAuth émis par Clerk. Sans jeton valide, la
 * réponse 401 indique où trouver le serveur d'autorisation : c'est ce qui
 * déclenche la connexion côté Claude.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function unauthorized(request: NextRequest) {
  return NextResponse.json(
    { error: "invalid_token", error_description: "Connexion à Hashory requise." },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="${protectedResourceMetadataUrl(request.nextUrl.origin)}"`,
      },
    }
  );
}

async function handle(request: NextRequest) {
  const { isAuthenticated, userId } = await auth({ acceptsToken: "oauth_token" });
  if (!isAuthenticated || !userId) return unauthorized(request);

  const server = createHashoryMcpServer(userId);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}

export const POST = handle;

/** Sans session, pas de flux à ouvrir ni à fermer. */
function methodNotAllowed() {
  return NextResponse.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Méthode non prise en charge." }, id: null },
    { status: 405, headers: { Allow: "POST" } }
  );
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
