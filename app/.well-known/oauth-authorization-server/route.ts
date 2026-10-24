import { NextResponse } from "next/server";
import { METADATA_CORS_HEADERS, clerkIssuer } from "@/lib/mcp-auth";

/**
 * Métadonnées du serveur d'autorisation, relayées depuis Clerk.
 *
 * Les clients MCP récents les lisent chez Clerk directement ; les plus
 * anciens les cherchent sur le domaine du serveur MCP.
 */
export async function GET() {
  const response = await fetch(`${clerkIssuer()}/.well-known/oauth-authorization-server`, {
    next: { revalidate: 3600 },
  });
  if (!response.ok) {
    return NextResponse.json({ error: "Métadonnées Clerk indisponibles." }, { status: 502 });
  }
  return NextResponse.json(await response.json(), { headers: METADATA_CORS_HEADERS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: METADATA_CORS_HEADERS });
}
