import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildLedger, type ExchangeOperation, type LedgerInput } from "./ledger";
import { dexFromAddress, dexFromHelius } from "./dex";

const base: LedgerInput = { trades: [], deposits: [], withdrawals: [], providers: { w: "ethereum", s: "solana", x: "binance" } };

describe("swaps on-chain", () => {
  it("réunit l'envoi et la réception d'une même transaction en un échange", () => {
    const ops = buildLedger({
      ...base,
      withdrawals: [{ id: "o", account: "w", asset: "USDC", amount: 100, fee: 0, timestamp: 1, txId: "0xAB", protocol: "Uniswap" }],
      deposits: [{ id: "i", account: "w", asset: "PEPE", amount: 1_000_000, timestamp: 1, txId: "0xab" }],
    });
    assert.equal(ops.length, 1);
    const swap = ops[0] as ExchangeOperation;
    assert.equal(swap.kind, "exchange");
    assert.equal(swap.origin, "dex");
    assert.equal(swap.protocol, "Uniswap");
    assert.deepEqual(swap.given, { asset: "USDC", quantity: 100 });
    assert.deepEqual(swap.received, { asset: "PEPE", quantity: 1_000_000 });
  });

  it("range le jeton natif envoyé en marge en frais (rente Solana)", () => {
    const ops = buildLedger({
      ...base,
      withdrawals: [
        { id: "o1", account: "s", asset: "USDC", amount: 50, fee: 0, timestamp: 1, txId: "sig" },
        { id: "o2", account: "s", asset: "SOL", amount: 0.002, fee: 0.000005, timestamp: 1, txId: "sig" },
      ],
      deposits: [{ id: "i", account: "s", asset: "JUP", amount: 80, timestamp: 1, txId: "sig" }],
    });
    assert.equal(ops.length, 1);
    const swap = ops[0] as ExchangeOperation;
    assert.equal(swap.given.asset, "USDC");
    assert.equal(swap.fee?.asset, "SOL");
    assert.ok(Math.abs((swap.fee?.quantity ?? 0) - 0.002005) < 1e-12);
  });

  it("laisse tel quel un apport de liquidité (deux actifs donnés)", () => {
    const ops = buildLedger({
      ...base,
      withdrawals: [
        { id: "o1", account: "w", asset: "USDC", amount: 50, fee: 0, timestamp: 1, txId: "0x1" },
        { id: "o2", account: "w", asset: "WBTC", amount: 0.001, fee: 0, timestamp: 1, txId: "0x1" },
      ],
      deposits: [{ id: "i", account: "w", asset: "UNI-V2", amount: 1, timestamp: 1, txId: "0x1" }],
    });
    assert.equal(ops.filter((op) => op.kind === "exchange").length, 0);
  });

  it("ne touche pas aux plateformes centralisées", () => {
    const ops = buildLedger({
      ...base,
      withdrawals: [{ id: "o", account: "x", asset: "USDC", amount: 100, fee: 0, timestamp: 1, txId: "t" }],
      deposits: [{ id: "i", account: "x", asset: "BTC", amount: 0.001, timestamp: 1, txId: "t" }],
    });
    assert.equal(ops.filter((op) => op.kind === "exchange").length, 0);
  });
});

describe("reconnaissance des DEX", () => {
  it("nomme un routeur EVM, par chaîne ou multi-chaînes", () => {
    assert.equal(dexFromAddress("bsc", "0x10ED43C718714eb63d5aA57B78B54704E256024E"), "PancakeSwap");
    assert.equal(dexFromAddress("base", "0x1111111254eeb25477b68fb85ed929f73a960582"), "1inch");
    assert.equal(dexFromAddress("ethereum", "0x0000000000000000000000000000000000000001"), null);
  });

  it("lit la source Helius d'un swap Solana", () => {
    assert.equal(dexFromHelius("SWAP", "JUPITER"), "Jupiter");
    assert.equal(dexFromHelius("SWAP", "SOME_NEW_DEX"), "Some New Dex");
    assert.equal(dexFromHelius("TRANSFER", "SYSTEM_PROGRAM"), null);
  });
});
