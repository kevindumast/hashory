import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  API_PROVIDERS,
  FILE_IMPORT_PROVIDERS,
  PROVIDERS,
  SUPPORTED_PROVIDERS,
  WALLET_PROVIDERS,
  isSupportedProvider,
  isSyncable,
  providerLabel,
} from "./providers";

describe("référentiel des sources", () => {
  it("n'a pas d'identifiant en double", () => {
    assert.equal(new Set(SUPPORTED_PROVIDERS).size, SUPPORTED_PROVIDERS.length);
  });

  it("partitionne les sources sans recouvrement ni oubli", () => {
    const total = API_PROVIDERS.size + WALLET_PROVIDERS.size + FILE_IMPORT_PROVIDERS.size;
    assert.equal(total, PROVIDERS.length, "chaque source appartient à exactement une catégorie");

    for (const id of API_PROVIDERS) {
      assert.ok(!WALLET_PROVIDERS.has(id) && !FILE_IMPORT_PROVIDERS.has(id));
    }
  });

  it("reconnaît une source connue et rejette le reste", () => {
    assert.equal(isSupportedProvider("kraken"), true);
    assert.equal(isSupportedProvider("coinbase"), false);
    assert.equal(isSupportedProvider(""), false);
  });

  it("déclare synchronisable tout sauf les imports de fichiers", () => {
    assert.equal(isSyncable("kraken"), true);
    assert.equal(isSyncable("ethereum"), true);
    assert.equal(isSyncable("bitstack"), false);
    assert.equal(isSyncable("inconnu"), false);
  });

  it("retombe sur l'identifiant quand le libellé est inconnu", () => {
    assert.equal(providerLabel("kraken"), "Kraken");
    assert.equal(providerLabel("inconnu"), "inconnu");
  });
});
