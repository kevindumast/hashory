import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { walletAddressError } from "./wallet-address";

describe("adresses de wallet", () => {
  it("accepte une adresse de la bonne chaîne", () => {
    assert.equal(walletAddressError("bitcoin", "bc1qqawl77d0nexhv2sx2vxr50ega65f67qqy35w6r"), null);
    assert.equal(walletAddressError("ethereum", "0xE62cD3e7b0Afe4D43b03435C737072E77cbF1FB4"), null);
    assert.equal(walletAddressError("solana", "5YNmS1R9nNSCDzb5a7mMJ1dwK9uHeAAF4CmPEwKgVWr8"), null);
  });

  it("refuse une adresse Bitcoin saisie pour Solana", () => {
    assert.match(walletAddressError("solana", "bc1qqawl77d0nexhv2sx2vxr50ega65f67qqy35w6r") ?? "", /pas une adresse solana/);
    assert.notEqual(walletAddressError("ethereum", "bc1qqawl77d0nexhv2sx2vxr50ega65f67qqy35w6r"), null);
  });

  it("ne contrôle pas les plateformes sans adresse", () => {
    assert.equal(walletAddressError("binance", "n'importe quoi"), null);
  });
});
