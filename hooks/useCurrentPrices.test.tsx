import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();

import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

import type { PortfolioToken } from "@/hooks/dashboard/useDashboardMetrics";
import { useCurrentPrices } from "./useCurrentPrices";

// Le hook ne lit que ces champs des jetons.
const token = (symbol: string, tradeSymbols: string[] = []) => ({ symbol, tradeSymbols }) as unknown as PortfolioToken;

let calls: string[][] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
    const symbols = (JSON.parse(init?.body ?? "{}") as { symbols: string[] }).symbols;
    calls.push(symbols);
    return new Response(JSON.stringify(symbols.map((symbol) => ({ symbol, price: "1" }))), { status: 200 });
  }) as typeof fetch;
});

afterEach(() => cleanup());
// Le DOM reste en place : chaque fichier de test tourne dans son propre
// processus, et le retirer pendant qu'une tâche React est encore planifiée
// faisait échouer le fichier au hasard.
after(() => {
  globalThis.fetch = realFetch;
});

describe("useCurrentPrices", () => {
  // Régression #88 → #90 : un tableau de jetons recréé à chaque rendu (mêmes
  // jetons, autre identité) relançait /api/prices à chaque rendu, en boucle.
  it("ne relance pas la requête pour les mêmes jetons dans un nouveau tableau", async () => {
    const { result, rerender } = renderHook(({ tokens }) => useCurrentPrices(tokens), {
      initialProps: { tokens: [token("BTC"), token("ETH", ["ETHUSDC"])] },
    });
    await waitFor(() => assert.equal(result.current.loading, false));

    for (let i = 0; i < 5; i++) {
      rerender({ tokens: [token("BTC"), token("ETH", ["ETHUSDC"])] });
    }
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(calls.length, 1);
    assert.deepEqual(result.current.currentPrices, { BTC: 1, ETH: 1 });
  });

  it("relance la requête quand la liste des paires change vraiment", async () => {
    const { result, rerender } = renderHook(({ tokens }) => useCurrentPrices(tokens), {
      initialProps: { tokens: [token("BTC")] },
    });
    await waitFor(() => assert.equal(result.current.loading, false));

    rerender({ tokens: [token("BTC"), token("SOL")] });
    await waitFor(() => assert.equal(calls.length, 2));
    assert.ok(calls[1].includes("SOLUSDT"));
  });
});
