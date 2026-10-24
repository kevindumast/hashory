import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { MAX_PERFORMANCE_POINTS, MAX_TRANSACTIONS, parseDay } from "./mcp";

/**
 * Serveur MCP de Hashory : les outils que Claude peut appeler pour lire le
 * portefeuille de l'utilisateur connecté.
 *
 * Un serveur est créé par requête, lié à l'utilisateur dont le jeton OAuth
 * vient d'être vérifié. Aucun outil n'écrit : Hashory reste en lecture
 * seule, jusque dans ce qu'il expose à un assistant.
 */

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

export function createHashoryMcpServer(clerkId: string): McpServer {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = process.env.MCP_SERVER_SECRET;
  if (!convexUrl || !secret) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL et MCP_SERVER_SECRET doivent être définis.");
  }
  const convex = new ConvexHttpClient(convexUrl);
  const caller = { secret, clerkId };

  const server = new McpServer({ name: "hashory", version: "1.0.0" });

  server.registerTool(
    "list_accounts",
    {
      title: "Comptes reliés",
      description:
        "Liste les comptes reliés à Hashory (exchanges, wallets on-chain, imports CSV) avec leur état de synchronisation. " +
        "L'identifiant `id` sert de filtre `account` aux autres outils.",
      annotations: READ_ONLY,
    },
    async () => json(await convex.query(api.mcp.accounts, caller))
  );

  server.registerTool(
    "get_portfolio",
    {
      title: "Portefeuille",
      description:
        "Positions actuelles : quantité, dernier cours de clôture connu, valeur en USD et EUR, prix de revient, " +
        "plus-value latente et résultat réalisé. Les positions datent du dernier recalcul du portefeuille " +
        "(`computedAt`), déclenché quand l'utilisateur ouvre son dashboard.",
      inputSchema: {
        by_account: z.boolean().optional().describe("Ajoute le détail des positions compte par compte."),
      },
      annotations: READ_ONLY,
    },
    async ({ by_account }) => json(await convex.query(api.mcp.portfolio, { ...caller, byAccount: by_account }))
  );

  server.registerTool(
    "get_performance",
    {
      title: "Performance",
      description:
        "Évolution quotidienne de la valeur du portefeuille : valeur, apports nets, rendement pondéré par le temps (TWR) " +
        "et comparaison au Bitcoin sur la même période. La série est échantillonnée ; le résumé donne les valeurs exactes " +
        "de début et de fin.",
      inputSchema: {
        account: z.string().optional().describe("Identifiant d'un compte (voir list_accounts). Portefeuille entier par défaut."),
        from: z.string().optional().describe("Début de période, AAAA-MM-JJ."),
        to: z.string().optional().describe("Fin de période, AAAA-MM-JJ."),
        max_points: z
          .number()
          .int()
          .min(2)
          .max(MAX_PERFORMANCE_POINTS * 3)
          .optional()
          .describe(`Nombre maximal de points de la série (${MAX_PERFORMANCE_POINTS} par défaut).`),
      },
      annotations: READ_ONLY,
    },
    async ({ account, from, to, max_points }) =>
      json(
        await convex.query(api.mcp.performance, {
          ...caller,
          account,
          from: parseDay(from),
          to: parseDay(to),
          maxPoints: max_points,
        })
      )
  );

  server.registerTool(
    "list_transactions",
    {
      title: "Transactions",
      description:
        "Historique des opérations, des plus récentes aux plus anciennes : échanges (achats, ventes, conversions), " +
        "dépôts et retraits. `total` indique le nombre de correspondances, même au-delà de la limite. " +
        "`internal: true` marque un transfert entre deux comptes de l'utilisateur.",
      inputSchema: {
        asset: z.string().optional().describe("Symbole d'un actif, par exemple BTC. Retient les échanges où il part ou arrive."),
        type: z.enum(["exchange", "deposit", "withdrawal"]).optional(),
        account: z.string().optional().describe("Identifiant d'un compte (voir list_accounts)."),
        from: z.string().optional().describe("Début de période, AAAA-MM-JJ."),
        to: z.string().optional().describe("Fin de période incluse, AAAA-MM-JJ."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_TRANSACTIONS)
          .optional()
          .describe("Nombre maximal de lignes (50 par défaut)."),
      },
      annotations: READ_ONLY,
    },
    async ({ asset, type, account, from, to, limit }) => {
      const end = parseDay(to);
      return json(
        await convex.query(api.mcp.transactions, {
          ...caller,
          asset,
          type,
          account,
          from: parseDay(from),
          // Une date seule couvre toute la journée.
          to: end !== undefined && to?.length === 10 ? end + 86_400_000 - 1 : end,
          limit,
        })
      );
    }
  );

  server.registerTool(
    "get_tax_report",
    {
      title: "Rapport fiscal",
      description:
        "Plus-values de cession d'actifs numériques calculées selon l'article 150 VH bis du CGI (formulaire 2086), " +
        "par année : prix de cession, prix d'acquisition imputé, plus-value nette et impôt estimé au PFU. " +
        "Indicatif : ce n'est pas un conseil fiscal. Les avertissements signalent les données incomplètes.",
      inputSchema: {
        year: z.number().int().min(2009).max(2100).optional().describe("Année fiscale. Toutes par défaut."),
        include_events: z.boolean().optional().describe("Ajoute le détail cession par cession."),
      },
      annotations: READ_ONLY,
    },
    async ({ year, include_events }) =>
      json(await convex.query(api.mcp.taxReport, { ...caller, year, includeEvents: include_events }))
  );

  return server;
}
