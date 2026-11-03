import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { explorerUrl, isOnchainProvider, onchainSummary } from "./onchain";

describe("onchain", () => {
  it("reconnaît les comptes lus sur la blockchain", () => {
    assert.equal(isOnchainProvider("ethereum"), true);
    assert.equal(isOnchainProvider("binance"), false);
  });

  it("construit le lien de l'explorateur, pas pour un identifiant de plateforme", () => {
    assert.equal(explorerUrl("bitcoin", "db79fbe4d1fa494382a2224435e176b2e0abfe4b6273538b4e6b4fa4f0a02c21"),
      "https://mempool.space/tx/db79fbe4d1fa494382a2224435e176b2e0abfe4b6273538b4e6b4fa4f0a02c21");
    assert.equal(explorerUrl("kraken", "0xabcdef0123456789abcdef0123"), null);
    assert.equal(explorerUrl("ethereum", "FTPEmUh-CRs1fLuI28whD2cADXHpuv"), null);
    assert.equal(explorerUrl("ethereum", null), null);
  });

  it("résume par réseau, compte le gas des envois et met à part les faux jetons", () => {
    const summary = onchainSummary([
      { kind: "withdrawal", provider: "ethereum", asset: "ETH", feeUsd: 2, txId: "a" },
      { kind: "deposit", provider: "ethereum", asset: "USDT", feeUsd: null, txId: "b" },
      { kind: "withdrawal", provider: "arbitrum", asset: "ꓴꓢꓓС", feeUsd: 5, txId: "c" },
      { kind: "deposit", provider: "binance", asset: "BTC", feeUsd: null, txId: "d" },
    ]);
    assert.equal(summary.operations, 2);
    assert.equal(summary.gasUsd, 2);
    assert.equal(summary.spoofed, 1);
    assert.deepEqual(summary.networks, [{ provider: "ethereum", name: "Ethereum", count: 2 }]);
  });
});
