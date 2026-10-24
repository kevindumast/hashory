import { createMcpDeps } from "@/lib/mcp-deps";
import { handleMcpRequest } from "@/lib/mcp-handler";

// Serveur MCP distant : Claude consulte le portefeuille en lecture seule,
// authentifié par OAuth avec le compte Hashory (Clerk). Voir lib/mcp-handler.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handle = (request: Request) => handleMcpRequest(request, createMcpDeps());

export { handle as GET, handle as POST, handle as DELETE };
