import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseStrikeCsv, parseStrikeDate } from "./strike";
import { balancesAt, buildLedger, type LedgerInput } from "./ledger";
import { computeCessionChain } from "./tax-chain";
import { createPriceBook } from "./valuation";

const close = (actual: number, expected: number, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≠ ${expected}`);

/** Relevé Strike réel, anonymisé : quatre dépôts suivis chacun d'un achat. */
const REAL_EXPORT = `Reference,Date & Time (UTC),Transaction Type,Amount EUR,Fee EUR,Amount BTC,Fee BTC,BTC Price,Cost Basis (EUR),Destination,Description,Transaction Hash,Note
33c5febd-174e-403d-a1fc-a9e08bebe021,Dec 09 2025 11:03:06,Deposit,55.00,,,,,,,,,
a3e1df83-775f-4d9d-a0b7-57d6f8338c6f,Dec 09 2025 11:03:23,Purchase,-55.00,0.54,0.00070123,,77663.53,55.00,,,,
f06b4a5d-b17c-4e1e-b48a-764f195bdca2,Dec 27 2025 13:04:28,Deposit,80.00,,,,,,,,,
1b2f5ecf-ad5b-4a8a-bc1c-67d0be4c845f,Dec 27 2025 13:04:48,Purchase,-80.00,0.78,0.00106603,,74313.11,80.00,,,,
7d8c66cc-7b36-4459-a07f-1bba4da33ef0,Dec 27 2025 15:14:11,Deposit,72.00,,,,,,,,,
40b78254-ef4a-467c-a29b-f36e6b4d8deb,Dec 27 2025 15:14:26,Purchase,-72.00,0.71,0.00095842,,74382.84,72.00,,,,
6e76e734-80d5-4eee-b7eb-bb70f3ac8aca,Dec 29 2025 12:17:47,Deposit,155.00,,,,,,,,,
8987670a-5fd6-4501-b2ef-b57e33f52729,Dec 29 2025 12:18:13,Purchase,-155.00,1.52,0.00207658,,73909.99,155.00,,,,
`;

describe("relevé Strike", () => {
  const parsed = parseStrikeCsv(REAL_EXPORT);

  it("lit les dates au format Strike, en UTC", () => {
    assert.equal(parseStrikeDate("Dec 09 2025 11:03:06"), Date.UTC(2025, 11, 9, 11, 3, 6));
    assert.equal(parseStrikeDate("n'importe quoi"), null);
  });

  it("reconnaît quatre dépôts en euros et quatre achats de BTC", () => {
    assert.equal(parsed.fiatCurrency, "EUR");
    assert.equal(parsed.deposits.length, 4);
    assert.ok(parsed.deposits.every((deposit) => deposit.asset === "EUR"));
    assert.equal(parsed.trades.length, 4);
    assert.equal(parsed.skipped.length, 0);
  });

  it("garde le montant débité, frais compris", () => {
    const [first] = parsed.trades;
    assert.equal(first.side, "BUY");
    assert.equal(first.externalId, "a3e1df83-775f-4d9d-a0b7-57d6f8338c6f");
    close(first.fiatAmount, 55);
    close(first.fee, 0.54);
    close(first.btcAmount, 0.00070123);
    // Cohérence du relevé : BTC au cours + frais = montant débité.
    close(first.btcAmount * first.price! + first.fee, first.fiatAmount, 0.01);
  });

  it("classe les autres mouvements d'après le sens des montants", () => {
    const other = parseStrikeCsv(`Reference,Date & Time (UTC),Transaction Type,Amount EUR,Fee EUR,Amount BTC,Fee BTC,BTC Price,Cost Basis (EUR),Destination,Description,Transaction Hash,Note
s1,Jan 05 2026 10:00:00,Sale,98.50,1.50,-0.001,,100000,,,,,
w1,Jan 06 2026 10:00:00,Withdrawal,,,-0.002,0.00001,,,bc1qexample,,abc123,
r1,Jan 07 2026 10:00:00,Receive,,,0.0005,,,,,,def456,
f1,Jan 08 2026 10:00:00,Withdrawal,-40.00,0.00,,,,,FR76…,,,
z1,Jan 09 2026 10:00:00,Something,,,,,,,,,,
`);
    assert.equal(other.trades[0].side, "SELL");
    close(other.trades[0].btcAmount, 0.001);
    assert.deepEqual(
      other.withdrawals.map((w) => [w.asset, w.amount, w.fee, w.txId]),
      [["BTC", 0.002, 0.00001, "abc123"], ["EUR", 40, 0, undefined]]
    );
    assert.deepEqual(other.deposits.map((d) => [d.asset, d.amount, d.txId]), [["BTC", 0.0005, "def456"]]);
    assert.equal(other.skipped.length, 1);
  });

  it("refuse un fichier qui n'est pas un relevé Strike", () => {
    const parsed = parseStrikeCsv("Date,Montant\n2025-01-01,10\n");
    assert.equal(parsed.trades.length + parsed.deposits.length, 0);
    assert.equal(parsed.skipped.length, 1);
  });
});

describe("relevé Strike dans le grand livre", () => {
  // Tel que `convex/strike.ts` le range en base.
  const parsed = parseStrikeCsv(REAL_EXPORT);
  const input: LedgerInput = {
    trades: parsed.trades.map((trade) => ({
      id: trade.externalId,
      account: "strike",
      providerTradeId: `strike:${trade.externalId}`,
      tradeType: "FIAT",
      symbol: "BTCEUR",
      side: trade.side,
      quantity: trade.btcAmount,
      price: trade.price ?? 0,
      quoteQuantity: trade.fiatAmount,
      fee: trade.fee,
      feeAsset: "EUR",
      executedAt: trade.executedAt,
      fromAsset: "EUR",
      fromAmount: trade.fiatAmount,
      toAsset: "BTC",
      toAmount: trade.btcAmount,
    })),
    deposits: parsed.deposits.map((deposit) => ({
      id: deposit.externalId,
      account: "strike",
      asset: deposit.asset,
      amount: deposit.amount,
      timestamp: deposit.executedAt,
    })),
    withdrawals: [],
  };
  const operations = buildLedger(input);

  it("solde les euros à zéro et cumule le BTC acheté", () => {
    const balances = balancesAt(operations).get("strike")!;
    close(balances.get("EUR")!, 0);
    close(balances.get("BTC")!, 0.00070123 + 0.00106603 + 0.00095842 + 0.00207658, 1e-12);
  });

  it("fait d'une vente de BTC contre euros une cession imposable", () => {
    const withSale: LedgerInput = {
      ...input,
      trades: [
        ...input.trades,
        {
          id: "sale",
          account: "strike",
          tradeType: "FIAT",
          symbol: "BTCEUR",
          side: "SELL",
          quantity: 0.001,
          price: 90_000,
          quoteQuantity: 90,
          executedAt: Date.UTC(2026, 0, 15),
          fromAsset: "BTC",
          fromAmount: 0.001,
          toAsset: "EUR",
          toAmount: 90,
        },
      ],
    };
    const chain = computeCessionChain(
      buildLedger(withSale),
      createPriceBook({ prices: { BTC: [{ dayUtc: Date.UTC(2026, 0, 15), closeUsd: 100_000 }] }, fx: [{ dayUtc: 0, eurPerUsd: 0.9 }] })
    );
    assert.equal(chain.cessions.length, 1);
    close(chain.cessions[0].proceedsEur, 90);
  });

  it("rapproche un retrait Strike du dépôt sur le wallet par son hash", () => {
    const ops = buildLedger({
      ...input,
      withdrawals: [{ id: "w", account: "strike", asset: "BTC", amount: 0.004, fee: 0.00001, timestamp: Date.UTC(2026, 0, 2), txId: "abc123" }],
      deposits: [
        ...input.deposits,
        { id: "d", account: "wallet", asset: "BTC", amount: 0.004, timestamp: Date.UTC(2026, 0, 2, 1), txId: "ABC123" },
      ],
    });
    const withdrawal = ops.find((op) => op.id === "w");
    assert.equal(withdrawal?.kind === "withdrawal" ? withdrawal.counterpart : null, "d");
  });

  it("retient les euros versés comme prix d'acquisition, frais compris", () => {
    const chain = computeCessionChain(operations, createPriceBook({ prices: {}, fx: [] }));
    close(chain.acquisitionCostEur, 55 + 80 + 72 + 155);
    assert.equal(chain.cessions.length, 0);
  });
});
