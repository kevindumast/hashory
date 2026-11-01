import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();

import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

import type { PortfolioToken } from "@/hooks/dashboard/useDashboardMetrics";
import { lastRefreshSlot, nextRefreshSlot, useCurrentPrices } from "./useCurrentPrices";

// Le hook ne lit que ces champs des jetons.
const token = (symbol: string, tradeSymbols: string[] = []) => ({ symbol, tradeSymbols }) as unknown as PortfolioToken;

let calls: string[][] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  window.localStorage.clear();
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

  // Suivi de portefeuille, pas de trading : les cours d'un créneau restent
  // valables jusqu'au suivant, même après un rechargement de la page.
  it("reprend les cours enregistrés sans les redemander dans le même créneau", async () => {
    const first = renderHook(() => useCurrentPrices([token("BTC")]));
    await waitFor(() => assert.equal(first.result.current.loading, false));
    assert.equal(calls.length, 1);
    first.unmount();

    const second = renderHook(() => useCurrentPrices([token("BTC")]));
    await waitFor(() => assert.deepEqual(second.result.current.currentPrices, { BTC: 1 }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(calls.length, 1);
  });

  it("redemande les cours sur le bouton d'actualisation", async () => {
    const { result } = renderHook(() => useCurrentPrices([token("BTC")]));
    await waitFor(() => assert.equal(result.current.loading, false));

    result.current.refresh();
    await waitFor(() => assert.equal(calls.length, 2));
  });
});

describe("créneaux de mise à jour des cours", () => {
  const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();

  it("retient le matin, midi et le soir", () => {
    assert.equal(lastRefreshSlot(at(2, 10)), at(2, 8));
    assert.equal(lastRefreshSlot(at(2, 12)), at(2, 12));
    assert.equal(lastRefreshSlot(at(2, 23)), at(2, 19));
    assert.equal(nextRefreshSlot(at(2, 12)), at(2, 19));
  });

  it("passe la nuit sur le créneau de la veille au soir", () => {
    assert.equal(lastRefreshSlot(at(2, 3)), at(1, 19));
    assert.equal(nextRefreshSlot(at(2, 3)), at(2, 8));
    assert.equal(nextRefreshSlot(at(2, 20)), at(3, 8));
  });
});
