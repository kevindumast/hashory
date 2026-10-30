import { NextRequest, NextResponse } from "next/server";
import { METADATA_CORS_HEADERS, protectedResourceMetadata } from "@/lib/mcp-auth";

/** Métadonnées de la ressource protégée `/api/mcp` (RFC 9728). */
export function GET(request: NextRequest) {
  return NextResponse.json(protectedResourceMetadata(request.nextUrl.origin), { headers: METADATA_CORS_HEADERS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: METADATA_CORS_HEADERS });
}
