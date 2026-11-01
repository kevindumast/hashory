import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();

import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { act, cleanup, renderHook } from "@testing-library/react";

import { IDLE_AFTER_HIDDEN_MS, IDLE_AFTER_INACTIVE_MS, usePageActivity } from "./usePageActivity";

let visibility: "visible" | "hidden" = "visible";
Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });

function setVisibility(next: "visible" | "hidden") {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  cleanup();
  mock.timers.reset();
});

describe("usePageActivity", () => {
  // Un onglet oublié ouvert recalculait le portefeuille en pleine nuit et
  // gardait ses abonnements vivants, pour personne.
  it("passe inactif après un long moment caché, et revient au retour", () => {
    mock.timers.enable({ apis: ["setTimeout", "Date"] });
    const { result } = renderHook(() => usePageActivity());
    act(() => setVisibility("visible"));
    assert.deepEqual(result.current, { visible: true, active: true });

    act(() => setVisibility("hidden"));
    assert.deepEqual(result.current, { visible: false, active: true });

    act(() => mock.timers.tick(IDLE_AFTER_HIDDEN_MS));
    assert.deepEqual(result.current, { visible: false, active: false });

    act(() => setVisibility("visible"));
    assert.deepEqual(result.current, { visible: true, active: true });
  });

  it("passe inactif sans interaction, et revient au premier geste", () => {
    mock.timers.enable({ apis: ["setTimeout", "Date"] });
    const { result } = renderHook(() => usePageActivity());
    act(() => setVisibility("visible"));

    // Une interaction repousse l'échéance.
    act(() => mock.timers.tick(IDLE_AFTER_INACTIVE_MS - 1_000));
    act(() => {
      window.dispatchEvent(new Event("keydown"));
    });
    act(() => mock.timers.tick(2_000));
    assert.equal(result.current.active, true);

    act(() => mock.timers.tick(IDLE_AFTER_INACTIVE_MS));
    assert.deepEqual(result.current, { visible: true, active: false });

    act(() => {
      window.dispatchEvent(new Event("pointermove"));
    });
    assert.deepEqual(result.current, { visible: true, active: true });
  });
});
