import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { McpDeps } from "./mcp-handler";

/**
 * Dépendances réelles du serveur MCP.
 *
 * Le jeton OAuth est vérifié par Clerk. Convex est ensuite interrogé avec
 * l'identifiant vérifié et le secret partagé `MCP_SERVER_SECRET` : le
 * serveur ne détient pas de jeton Convex au nom de l'utilisateur.
 */
export function createMcpDeps(): McpDeps {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = process.env.MCP_SERVER_SECRET;
  if (!convexUrl || !secret) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL et MCP_SERVER_SECRET doivent être définis.");
  }
  const convex = new ConvexHttpClient(convexUrl);

  return {
    authenticate: async () => {
      const { isAuthenticated, userId, clientId } = await auth({ acceptsToken: "oauth_token" });
      return isAuthenticated && userId ? { userId, clientId: clientId ?? null } : null;
    },
    authorize: (clerkId) => convex.mutation(api.mcp.authorize, { secret, clerkId }),
    audit: async ({ userId, clientId, tool, rowCount, ip }) => {
      await convex.mutation(api.mcp.audit, {
        secret,
        clerkId: userId,
        tool,
        rowCount,
        ip: ip ?? undefined,
        clientId: clientId ?? undefined,
      });
    },
    data: (clerkId) => {
      const caller = { secret, clerkId };
      return {
        accounts: () => convex.query(api.mcp.accounts, caller),
        portfolio: (args) => convex.query(api.mcp.portfolio, { ...caller, ...args }),
        performance: (args) => convex.query(api.mcp.performance, { ...caller, ...args }),
        transactions: (args) => convex.query(api.mcp.transactions, { ...caller, ...args }),
        taxReport: (args) => convex.query(api.mcp.taxReport, { ...caller, ...args }),
      };
    },
  };
}
