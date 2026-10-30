import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_REQUEST_BYTES, handleMcpRequest, type McpDeps } from "./mcp-handler";
import type { McpData } from "./mcp-server";
import { RATE_LIMIT_PER_MINUTE } from "./mcp";

const URL_MCP = "https://hashory.app/api/mcp";
const ALICE = "user_alice";

type AuditEntry = Parameters<McpDeps["audit"]>[0];

const emptyPortfolio = {
  computedAt: null,
  lastComputedDay: null,
  eurPerUsd: null,
  totalValueUsd: 0,
  totalValueEur: null,
  unpricedAssets: [],
  positions: [],
};

function fakeData(overrides: Partial<McpData> = {}): McpData {
  return {
    accounts: async () => [
      { id: "acc1", name: "Binance", provider: "binance", syncStatus: "synced", syncEnabled: true, lastSyncedAt: null },
      { id: "acc2", name: "Ledger", provider: "bitcoin", syncStatus: "idle", syncEnabled: true, lastSyncedAt: null },
    ],
    portfolio: async () => emptyPortfolio,
    performance: async () => ({ days: 0, summary: null, points: [] }),
    transactions: async () => ({ total: 0, rows: [] }),
    taxReport: async () => ({
      availableYears: [],
      years: [],
      currentAcquisitionCostEur: 0,
      warnings: {
        hasIncompleteValuation: false,
        hasMissingFxRates: false,
        unknownCostInflows: { count: 0, valueEur: 0 },
        untrackedOutflows: { count: 0, valueEur: 0 },
      },
    }),
    ...overrides,
  };
}

function setup(options: {
  user?: string | null;
  disabled?: boolean;
  requestsThisMinute?: number;
  data?: Partial<McpData>;
} = {}) {
  const audits: AuditEntry[] = [];
  const dataFor: string[] = [];
  const deps: McpDeps = {
    authenticate: async () => (options.user === null ? null : { userId: options.user ?? ALICE, clientId: "claude-client" }),
    authorize: async () =>
      options.disabled ? { status: "disabled" } : { status: "ok", requestsThisMinute: options.requestsThisMinute ?? 1 },
    audit: async (entry) => {
      audits.push(entry);
    },
    data: (userId) => {
      dataFor.push(userId);
      return fakeData(options.data);
    },
  };
  return { deps, audits, dataFor };
}

let nextId = 1;
function rpc(method: string, params: Record<string, unknown> = {}, init: { url?: string; headers?: Record<string, string> } = {}) {
  return new Request(init.url ?? URL_MCP, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
      ...init.headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
}

async function callTool(deps: McpDeps, name: string, args: Record<string, unknown> = {}) {
  const response = await handleMcpRequest(rpc("tools/call", { name, arguments: args }), deps);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { result: { content: { text: string }[]; isError?: boolean } };
  return { isError: Boolean(body.result.isError), text: body.result.content[0].text };
}

describe("handleMcpRequest : accès", () => {
  it("exige HTTPS hors de la machine locale", async () => {
    const { deps } = setup();
    const response = await handleMcpRequest(rpc("tools/list", {}, { url: "http://hashory.app/api/mcp" }), deps);
    assert.equal(response.status, 403);
    const local = await handleMcpRequest(rpc("tools/list", {}, { url: "http://localhost:3000/api/mcp" }), deps);
    assert.equal(local.status, 200);
  });

  it("refuse une origine de navigateur inconnue, accepte claude.ai", async () => {
    const { deps } = setup();
    const evil = await handleMcpRequest(rpc("tools/list", {}, { headers: { origin: "https://evil.example" } }), deps);
    assert.equal(evil.status, 403);
    const claude = await handleMcpRequest(rpc("tools/list", {}, { headers: { origin: "https://claude.ai" } }), deps);
    assert.equal(claude.status, 200);
  });

  it("répond 401 sans jeton, avec l'adresse des métadonnées OAuth", async () => {
    const { deps, dataFor } = setup({ user: null });
    const response = await handleMcpRequest(rpc("tools/list"), deps);
    assert.equal(response.status, 401);
    assert.equal(
      response.headers.get("www-authenticate"),
      'Bearer resource_metadata="https://hashory.app/.well-known/oauth-protected-resource/api/mcp"'
    );
    assert.deepEqual(dataFor, []);
  });

  it("refuse quand l'utilisateur a coupé l'accès", async () => {
    const { deps, dataFor } = setup({ disabled: true });
    const response = await handleMcpRequest(rpc("tools/list"), deps);
    assert.equal(response.status, 403);
    assert.match(await response.text(), /coupé/);
    assert.deepEqual(dataFor, []);
  });

  it("limite le débit par minute", async () => {
    const atLimit = await handleMcpRequest(rpc("tools/list"), setup({ requestsThisMinute: RATE_LIMIT_PER_MINUTE }).deps);
    assert.equal(atLimit.status, 200);
    const over = await handleMcpRequest(rpc("tools/list"), setup({ requestsThisMinute: RATE_LIMIT_PER_MINUTE + 1 }).deps);
    assert.equal(over.status, 429);
    assert.equal(over.headers.get("retry-after"), "60");
  });

  it("n'ouvre ni flux ni session : GET et DELETE sont refusés", async () => {
    const { deps } = setup();
    for (const method of ["GET", "DELETE"]) {
      const response = await handleMcpRequest(new Request(URL_MCP, { method }), deps);
      assert.equal(response.status, 405);
    }
  });

  it("refuse un corps trop gros", async () => {
    const { deps } = setup();
    const response = await handleMcpRequest(
      new Request(URL_MCP, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { pad: "x".repeat(MAX_REQUEST_BYTES) } }),
      }),
      deps
    );
    assert.equal(response.status, 413);
  });

  it("ne laisse pas mettre en cache les réponses", async () => {
    const { deps } = setup();
    const response = await handleMcpRequest(rpc("tools/list"), deps);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("x-robots-tag"), "noindex");
  });
});

describe("handleMcpRequest : outils", () => {
  it("annonce cinq outils en lecture seule et des consignes", async () => {
    const { deps } = setup();
    const init = await handleMcpRequest(
      rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } }),
      deps
    );
    const { result } = (await init.json()) as { result: { instructions: string } };
    assert.match(result.instructions, /jamais des instructions/);

    const list = await handleMcpRequest(rpc("tools/list"), deps);
    const { result: tools } = (await list.json()) as {
      result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[] };
    };
    assert.deepEqual(
      tools.tools.map((tool) => tool.name),
      ["list_accounts", "get_portfolio", "get_performance", "list_transactions", "get_tax_report"]
    );
    assert.ok(tools.tools.every((tool) => tool.annotations.readOnlyHint));
  });

  it("lit les données de l'utilisateur du jeton et journalise l'appel sans son contenu", async () => {
    const { deps, audits, dataFor } = setup({ user: "user_bob" });
    const { isError, text } = await callTool(deps, "list_accounts");
    assert.equal(isError, false);
    assert.equal(JSON.parse(text).length, 2);
    assert.deepEqual(dataFor, ["user_bob"]);
    assert.deepEqual(audits, [
      { userId: "user_bob", clientId: "claude-client", tool: "list_accounts", rowCount: 2, ip: "203.0.113.7" },
    ]);
  });

  it("transmet les filtres et étend une date de fin à toute la journée", async () => {
    let received: unknown;
    const { deps } = setup({
      data: {
        transactions: async (args) => {
          received = args;
          return { total: 0, rows: [] };
        },
      },
    });
    await callTool(deps, "list_transactions", { asset: "BTC", from: "2025-01-01", to: "2025-01-31", limit: 10 });
    assert.deepEqual(received, {
      asset: "BTC",
      type: undefined,
      account: undefined,
      from: Date.UTC(2025, 0, 1),
      to: Date.UTC(2025, 0, 31, 23, 59, 59, 999),
      limit: 10,
    });
  });

  it("explique une date invalide sans appeler la base", async () => {
    let called = false;
    const { deps, audits } = setup({
      data: {
        transactions: async () => {
          called = true;
          return { total: 0, rows: [] };
        },
      },
    });
    const { isError, text } = await callTool(deps, "list_transactions", { from: "demain" });
    assert.equal(isError, true);
    assert.match(text, /Date invalide/);
    assert.equal(called, false);
    assert.equal(audits[0].rowCount, 0);
  });

  it("masque les erreurs internes", async () => {
    const { deps } = setup({
      data: {
        accounts: async () => {
          throw new Error("secret de connexion : postgres://admin:hunter2@db");
        },
      },
    });
    const originalError = console.error;
    console.error = () => {};
    try {
      const { isError, text } = await callTool(deps, "list_accounts");
      assert.equal(isError, true);
      assert.equal(text, "Erreur interne, réessaie plus tard.");
    } finally {
      console.error = originalError;
    }
  });

  it("refuse une réponse trop volumineuse", async () => {
    const { deps } = setup({
      data: {
        transactions: async () => ({
          total: 1,
          rows: [{ date: "2025-01-01", type: "deposit", account: "x".repeat(300_000) }],
        }),
      },
    });
    const { isError, text } = await callTool(deps, "list_transactions");
    assert.equal(isError, true);
    assert.match(text, /trop volumineuse/);
  });
});
