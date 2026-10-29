import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DATA_PROVIDERS,
  dataProviderForSource,
  dataProviderLabel,
  isSupportedDataProvider,
  maskKey,
} from "./data-providers";
import { SUPPORTED_PROVIDERS } from "./providers";

describe("dataProviderForSource", () => {
  it("associe chaque wallet lu par un tiers à son fournisseur", () => {
    assert.equal(dataProviderForSource("solana"), "helius");
    assert.equal(dataProviderForSource("ethereum"), "etherscan");
    assert.equal(dataProviderForSource("bsc"), "etherscan");
    assert.equal(dataProviderForSource("arbitrum"), "etherscan");
    assert.equal(dataProviderForSource("tao"), "taostats");
  });

  it("ne réclame aucune clé pour les sources qui n'en ont pas besoin", () => {
    for (const source of ["binance", "kraken", "kucoin", "bitcoin", "kaspa", "bitstack"]) {
      assert.equal(dataProviderForSource(source), null, source);
    }
  });

  it("ne pointe que vers des sources et des fournisseurs connus", () => {
    for (const source of ["solana", "ethereum", "bsc", "arbitrum", "tao"]) {
      assert.ok(SUPPORTED_PROVIDERS.includes(source), source);
      assert.ok(isSupportedDataProvider(dataProviderForSource(source)!), source);
    }
  });
});

describe("maskKey", () => {
  it("ne laisse voir que les quatre derniers caractères", () => {
    assert.equal(maskKey("abcd1234wxyz"), "••••wxyz");
    assert.equal(maskKey("  abcd1234wxyz  "), "••••wxyz");
  });

  it("ne révèle rien d'une clé trop courte", () => {
    assert.equal(maskKey("abc"), "••••");
    assert.equal(maskKey("abcd"), "••••");
  });
});

describe("référentiel", () => {
  it("a des identifiants uniques et un libellé pour chacun", () => {
    const ids = DATA_PROVIDERS.map((provider) => provider.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.notEqual(dataProviderLabel(id), id);
  });

  it("refuse un fournisseur inconnu, dont CMC", () => {
    assert.equal(isSupportedDataProvider("cmc"), false);
    assert.equal(isSupportedDataProvider(""), false);
  });
});
