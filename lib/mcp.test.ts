import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Operation } from "./ledger";
import { MAX_TRANSACTIONS, nextRateWindow, parseDay, samplePoints, secretsMatch, selectTransactions } from "./mcp";

const DAY = 86_400_000;
const day = (index: number) => Date.UTC(2025, 0, 1) + index * DAY;

const operations: Operation[] = [
  {
    kind: "exchange",
    id: "t1",
    account: "acc-binance",
    timestamp: day(0),
    given: { asset: "USDT", quantity: 1000 },
    received: { asset: "BTC", quantity: 0.01 },
    fee: { asset: "BNB", quantity: 0.001 },
    origin: "spot",
  },
  {
    kind: "withdrawal",
    id: "w1",
    account: "acc-binance",
    timestamp: day(2),
    asset: "BTC",
    quantity: 0.005,
    fee: 0.0001,
    counterpart: "d1",
  },
  {
    kind: "deposit",
    id: "d1",
    account: "acc-ledger",
    timestamp: day(2) + 1000,
    asset: "BTC",
    quantity: 0.005,
    fee: 0,
    txId: "abc",
    counterpart: "w1",
  },
  {
    kind: "exchange",
    id: "t2",
    account: "acc-binance",
    timestamp: day(5),
    given: { asset: "EUR", quantity: 200 },
    received: { asset: "ETH", quantity: 0.1 },
    origin: "fiat",
  },
];

const names = { "acc-binance": "Binance", "acc-ledger": "Ledger BTC" };

describe("secretsMatch", () => {
  it("n'accepte que le secret exact", () => {
    assert.equal(secretsMatch("s3cret", "s3cret"), true);
    assert.equal(secretsMatch("s3cret", "s3cre"), false);
    assert.equal(secretsMatch("s3cret", "s3cret!"), false);
    assert.equal(secretsMatch("s3cret", "S3cret"), false);
    assert.equal(secretsMatch("s3cret", ""), false);
  });

  it("refuse tout quand le secret n'est pas configuré", () => {
    assert.equal(secretsMatch(undefined, ""), false);
    assert.equal(secretsMatch("", ""), false);
  });
});

describe("selectTransactions", () => {
  it("trie du plus récent au plus ancien et nomme les comptes", () => {
    const { total, rows } = selectTransactions(operations, {}, names);
    assert.equal(total, 4);
    assert.deepEqual(rows.map((row) => row.date.slice(0, 10)), ["2025-01-06", "2025-01-03", "2025-01-03", "2025-01-01"]);
    assert.equal(rows[0].account, "Binance");
    assert.equal(rows[1].account, "Ledger BTC");
  });

  it("filtre par actif, des deux côtés d'un échange, sans tenir compte de la casse", () => {
    const { rows } = selectTransactions(operations, { asset: "usdt" }, names);
    assert.deepEqual(rows.map((row) => row.given?.asset), ["USDT"]);
    assert.equal(selectTransactions(operations, { asset: "BTC" }, names).total, 3);
  });

  it("filtre par type, compte et période", () => {
    assert.equal(selectTransactions(operations, { type: "exchange" }, names).total, 2);
    assert.equal(selectTransactions(operations, { account: "acc-ledger" }, names).total, 1);
    assert.equal(selectTransactions(operations, { from: day(1), to: day(3) }, names).total, 2);
  });

  it("signale les transferts internes et les frais d'un retrait dans son actif", () => {
    const withdrawal = selectTransactions(operations, { type: "withdrawal" }, names).rows[0];
    assert.equal(withdrawal.internal, true);
    assert.deepEqual(withdrawal.fee, { asset: "BTC", quantity: 0.0001 });
    const deposit = selectTransactions(operations, { type: "deposit" }, names).rows[0];
    assert.equal(deposit.fee, undefined);
    assert.equal(deposit.txId, "abc");
  });

  it("borne la limite demandée sans perdre le total", () => {
    const { total, rows } = selectTransactions(operations, { limit: 1 }, names);
    assert.equal(total, 4);
    assert.equal(rows.length, 1);
    const many = Array.from({ length: MAX_TRANSACTIONS + 10 }, (_, index) => ({ ...operations[0], id: `x${index}` }));
    assert.equal(selectTransactions(many, { limit: 10_000 }, names).rows.length, MAX_TRANSACTIONS);
  });
});

describe("samplePoints", () => {
  it("laisse une série courte intacte", () => {
    assert.deepEqual(samplePoints([1, 2, 3], 5), [1, 2, 3]);
  });

  it("garde le premier et le dernier point", () => {
    const points = Array.from({ length: 1000 }, (_, index) => index);
    const sampled = samplePoints(points, 10);
    assert.equal(sampled.length, 10);
    assert.equal(sampled[0], 0);
    assert.equal(sampled[9], 999);
  });
});

describe("parseDay", () => {
  it("lit une date en début de jour UTC", () => {
    assert.equal(parseDay("2025-01-03"), day(2));
    assert.equal(parseDay(undefined), undefined);
  });

  it("refuse une date illisible", () => {
    assert.throws(() => parseDay("demain"), /Date invalide/);
  });
});

describe("nextRateWindow", () => {
  const t0 = Date.UTC(2025, 0, 1);

  it("ouvre une fenêtre à la première requête", () => {
    assert.deepEqual(nextRateWindow(null, t0), { rateWindowStart: t0, rateCount: 1 });
  });

  it("compte les requêtes de la même minute", () => {
    assert.deepEqual(nextRateWindow({ rateWindowStart: t0, rateCount: 5 }, t0 + 59_999), {
      rateWindowStart: t0,
      rateCount: 6,
    });
  });

  it("repart à un quand la minute est écoulée", () => {
    assert.deepEqual(nextRateWindow({ rateWindowStart: t0, rateCount: 60 }, t0 + 60_000), {
      rateWindowStart: t0 + 60_000,
      rateCount: 1,
    });
  });
});
