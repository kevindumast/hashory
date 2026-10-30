import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  balancesAt,
  buildLedger,
  fiatMovementDirection,
  normalizeAsset,
  reconcileBalances,
  splitPair,
  type ExchangeOperation,
  type LedgerInput,
  type TransferOperation,
} from "./ledger";
import { krakenInput } from "./test-fixtures";

const t = (iso: string) => Date.parse(iso);
const close = (actual: number, expected: number, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≠ ${expected}`);

const empty: LedgerInput = { trades: [], deposits: [], withdrawals: [] };

describe("paires et actifs", () => {
  it("sépare base et cotation, avec ou sans séparateur", () => {
    assert.deepEqual(splitPair("BTCUSDT"), { base: "BTC", quote: "USDT" });
    assert.deepEqual(splitPair("BTC-USDT"), { base: "BTC", quote: "USDT" });
    assert.deepEqual(splitPair("ETH/BTC"), { base: "ETH", quote: "BTC" });
    assert.deepEqual(splitPair("ETHBTC"), { base: "ETH", quote: "BTC" });
  });

  it("préfère la cotation la plus longue : FDUSD n'est pas « FD » coté en USD", () => {
    assert.deepEqual(splitPair("BTCFDUSD"), { base: "BTC", quote: "FDUSD" });
    assert.deepEqual(splitPair("BTCBUSD"), { base: "BTC", quote: "BUSD" });
  });

  it("ramène les codes Kraken au standard", () => {
    assert.equal(normalizeAsset("XBT"), "BTC");
    assert.equal(normalizeAsset("zeur"), "EUR");
    assert.deepEqual(splitPair("XBT-EUR"), { base: "BTC", quote: "EUR" });
  });
});

describe("échanges", () => {
  it("traduit un achat au comptant : on donne la cotation, on reçoit la base", () => {
    const [op] = buildLedger({
      ...empty,
      trades: [{ id: "1", account: "a", symbol: "BTCUSDT", side: "BUY", quantity: 0.5, price: 40_000, quoteQuantity: 20_000, executedAt: 1 }],
    }) as ExchangeOperation[];
    assert.deepEqual(op.given, { asset: "USDT", quantity: 20_000 });
    assert.deepEqual(op.received, { asset: "BTC", quantity: 0.5 });
  });

  it("traduit une vente au comptant : on donne la base, on reçoit la cotation", () => {
    const [op] = buildLedger({
      ...empty,
      trades: [{ id: "1", account: "a", symbol: "BTCEUR", side: "SELL", quantity: 0.5, price: 40_000, quoteQuantity: 20_000, fee: 20, executedAt: 1 }],
    }) as ExchangeOperation[];
    assert.deepEqual(op.given, { asset: "BTC", quantity: 0.5 });
    assert.deepEqual(op.received, { asset: "EUR", quantity: 20_000 });
    // Frais sans actif précisé : pris dans la cotation.
    assert.deepEqual(op.fee, { asset: "EUR", quantity: 20 });
  });

  it("lit une conversion par ses deux jambes, quel que soit le sens déclaré", () => {
    const ops = buildLedger(krakenInput).filter((op): op is ExchangeOperation => op.kind === "exchange");
    // Kraken enregistre EUR → USDC comme une « vente d'EUR » : on donne bien
    // des euros et on reçoit des USDC, pas l'inverse.
    assert.deepEqual(ops[0].given, { asset: "EUR", quantity: 28.34 });
    assert.deepEqual(ops[0].received, { asset: "USDC", quantity: 32.47 });
    assert.deepEqual(ops[1].given, { asset: "USDC", quantity: 32.15 });
    assert.deepEqual(ops[1].received, { asset: "SOL", quantity: 0.3058 });
  });

  it("retrouve les soldes Kraken réels, frais compris", () => {
    // 32,47 USDC reçus, 32,15 convertis et 0,32 de frais : tout l'USDC est
    // parti. C'est ce qui prouve que Kraken débite ses frais en plus.
    const balances = balancesAt(buildLedger(krakenInput)).get("kraken")!;
    close(balances.get("EUR")!, 30 - 28.34 - 0.28);
    close(balances.get("USDC")!, 0);
    close(balances.get("SOL")!, 0.3058);
  });

  it("ne débite pas deux fois les frais d'un achat en fiat, déjà inclus", () => {
    const ops = buildLedger({
      ...empty,
      trades: [
        {
          id: "b",
          account: "bitstack",
          tradeType: "FIAT",
          symbol: "BTCEUR",
          side: "BUY",
          quantity: 0.0002,
          price: 50_000,
          quoteQuantity: 10,
          fee: 0.15,
          feeAsset: "EUR",
          executedAt: 1,
          fromAsset: "EUR",
          fromAmount: 10,
          toAsset: "BTC",
          toAmount: 0.0002,
        },
      ],
    }) as ExchangeOperation[];
    assert.equal(ops[0].origin, "fiat");
    assert.equal(ops[0].fee, undefined);
  });

  it("ajoute les swaps qui n'existent que dans la table des conversions", () => {
    const ops = buildLedger({
      ...empty,
      trades: [
        { id: "t", account: "binance", providerTradeId: "convert:1", tradeType: "CONVERT", symbol: "ETHUSDT", side: "BUY", quantity: 1, price: 3000, executedAt: 1, fromAsset: "USDT", fromAmount: 3000, toAsset: "ETH", toAmount: 1 },
      ],
      converts: [
        // Binance : déjà dans les trades, ne doit pas compter deux fois.
        { id: "c1", account: "binance", providerTradeId: "convert:1", status: "SUCCESS", fromAsset: "USDT", fromAmount: 3000, toAsset: "ETH", toAmount: 1, executedAt: 1 },
        // Finary : n'existe qu'ici, invisible jusqu'à présent.
        { id: "c2", account: "finary", providerTradeId: "finary:9", status: "SUCCESS", fromAsset: "ETH", fromAmount: 1, toAsset: "SOL", toAmount: 20, executedAt: 2 },
        // Conversion échouée : ignorée.
        { id: "c3", account: "finary", providerTradeId: "finary:10", status: "FAIL", fromAsset: "ETH", fromAmount: 1, toAsset: "SOL", toAmount: 20, executedAt: 3 },
      ],
    });
    assert.deepEqual(ops.map((op) => op.id), ["t", "c2"]);
  });

  it("n'ajoute des ordres que ce que les trades ne couvrent pas", () => {
    const ops = buildLedger({
      ...empty,
      trades: [{ id: "t", account: "a", symbol: "BTCUSDT", side: "BUY", quantity: 1, price: 100, quoteQuantity: 100, executedAt: 1 }],
      orders: [
        { id: "o1", account: "a", symbol: "BTCUSDT", side: "BUY", status: "FILLED", quantity: 1, quoteQuantity: 100, executedAt: 1 },
        { id: "o2", account: "a", symbol: "BTCUSDT", side: "BUY", status: "FILLED", quantity: 0.5, quoteQuantity: 60, executedAt: 2 },
        { id: "o3", account: "a", symbol: "BTCUSDT", side: "BUY", status: "CANCELED", quantity: 9, quoteQuantity: 900, executedAt: 3 },
      ],
    }) as ExchangeOperation[];
    const fromOrders = ops.find((op) => op.origin === "order")!;
    close(fromOrders.received.quantity, 0.5);
    // Prix moyen des ordres : 160 / 1,5.
    close(fromOrders.given.quantity, 0.5 * (160 / 1.5));
  });
});

describe("mouvements fiat", () => {
  it("lit les dépôts Bitstack comme des dépôts, malgré leur code", () => {
    assert.equal(fiatMovementDirection({ orderId: "bitstack:42", txType: "1" }), "deposit");
    assert.equal(fiatMovementDirection({ orderId: "B123", txType: "0" }), "deposit");
    assert.equal(fiatMovementDirection({ orderId: "B124", txType: "1" }), "withdrawal");
  });

  it("fait d'un achat par carte un échange fiat contre crypto", () => {
    const [op] = buildLedger({
      ...empty,
      fiat: [
        { id: "f", account: "binance", orderId: "X", txType: "0", fiatCurrency: "EUR", fiatAmount: 50, cryptoCurrency: "USDC", cryptoAmount: 53, timestamp: 1, status: "Successful" },
      ],
    }) as ExchangeOperation[];
    assert.deepEqual(op.given, { asset: "EUR", quantity: 50 });
    assert.deepEqual(op.received, { asset: "USDC", quantity: 53 });
  });

  it("crédite un dépôt net de ses frais", () => {
    const [op] = buildLedger({
      ...empty,
      fiat: [{ id: "f", account: "binance", orderId: "X", txType: "0", fiatCurrency: "EUR", fiatAmount: 100, fee: 1.5, timestamp: 1 }],
    }) as TransferOperation[];
    assert.equal(op.kind, "deposit");
    close(op.quantity, 98.5);
  });
});

describe("statuts", () => {
  it("écarte les retraits Binance annulés, rejetés ou échoués", () => {
    const ops = buildLedger({
      ...empty,
      providers: { b: "binance" },
      withdrawals: ["1", "3", "5", "6"].map((status) => ({
        id: status,
        account: "b",
        asset: "BTC",
        amount: 1,
        fee: 0,
        status,
        timestamp: 1,
      })),
    });
    assert.deepEqual(ops.map((op) => op.id), ["6"]);
  });

  it("écarte un statut textuel d'échec, quelle que soit la plateforme", () => {
    const ops = buildLedger({
      ...empty,
      deposits: [
        { id: "ok", account: "k", asset: "BTC", amount: 1, status: "SUCCESS", timestamp: 1 },
        { id: "ko", account: "k", asset: "BTC", amount: 1, status: "FAILED", timestamp: 1 },
      ],
    });
    assert.deepEqual(ops.map((op) => op.id), ["ok"]);
  });
});

describe("frais de retrait", () => {
  it("ignore les frais Finary, rangés sans leur devise", () => {
    // Retrait réel : 0,000175 BTC avec 0,84 € de frais. Lus comme 0,84 BTC,
    // ils créaient un apport fictif de 52 000 $ et un mois à −98 %.
    const [op] = buildLedger({
      ...empty,
      providers: { f: "finary" },
      withdrawals: [{ id: "w", account: "f", asset: "BTC", amount: 0.000175, fee: 0.84, timestamp: 1 }],
    }) as TransferOperation[];
    assert.equal(op.fee, 0);
  });

  it("écarte des frais supérieurs au montant envoyé", () => {
    const [op] = buildLedger({
      ...empty,
      withdrawals: [{ id: "w", account: "x", asset: "FET", amount: 2, fee: 3.05, timestamp: 1 }],
    }) as TransferOperation[];
    assert.equal(op.fee, 0);
  });

  it("garde des frais réseau plausibles", () => {
    const [op] = buildLedger({
      ...empty,
      providers: { b: "binance" },
      withdrawals: [{ id: "w", account: "b", asset: "BTC", amount: 0.5, fee: 0.0002, timestamp: 1 }],
    }) as TransferOperation[];
    assert.equal(op.fee, 0.0002);
  });
});

describe("transferts internes", () => {
  const withdrawal = { id: "w", account: "binance", asset: "BTC", amount: 0.5, fee: 0.0002, timestamp: t("2025-03-01T10:00:00Z") };

  it("apparie un retrait et le dépôt correspondant sur un autre compte", () => {
    const ops = buildLedger({
      ...empty,
      withdrawals: [withdrawal],
      deposits: [{ id: "d", account: "wallet", asset: "BTC", amount: 0.5, timestamp: t("2025-03-01T10:40:00Z") }],
    }) as TransferOperation[];
    assert.equal(ops.find((op) => op.id === "w")!.counterpart, "d");
    assert.equal(ops.find((op) => op.id === "d")!.counterpart, "w");
  });

  it("apparie par identifiant de transaction, même hors fenêtre", () => {
    const ops = buildLedger({
      ...empty,
      withdrawals: [{ ...withdrawal, txId: "ABC" }],
      deposits: [{ id: "d", account: "wallet", asset: "BTC", amount: 0.49, timestamp: t("2025-03-20T00:00:00Z"), txId: "abc" }],
    }) as TransferOperation[];
    assert.equal(ops.find((op) => op.id === "w")!.counterpart, "d");
  });

  it("n'apparie pas un montant trop différent, ni un dépôt sur le même compte", () => {
    const ops = buildLedger({
      ...empty,
      withdrawals: [withdrawal],
      deposits: [
        { id: "other-amount", account: "wallet", asset: "BTC", amount: 0.3, timestamp: t("2025-03-01T11:00:00Z") },
        { id: "same-account", account: "binance", asset: "BTC", amount: 0.5, timestamp: t("2025-03-01T11:00:00Z") },
      ],
    }) as TransferOperation[];
    assert.equal(ops.find((op) => op.id === "w")!.counterpart, undefined);
  });

  it("n'utilise un dépôt qu'une fois", () => {
    const ops = buildLedger({
      ...empty,
      withdrawals: [withdrawal, { ...withdrawal, id: "w2", timestamp: withdrawal.timestamp + 60_000 }],
      deposits: [{ id: "d", account: "wallet", asset: "BTC", amount: 0.5, timestamp: t("2025-03-01T10:40:00Z") }],
    }) as TransferOperation[];
    const paired = ops.filter((op) => op.kind === "withdrawal" && op.counterpart);
    assert.equal(paired.length, 1);
  });

  it("ne rapproche jamais le fiat, qui transite par une banque", () => {
    const ops = buildLedger({
      ...empty,
      withdrawals: [{ id: "w", account: "binance", asset: "EUR", amount: 100, fee: 0, timestamp: 1 }],
      deposits: [{ id: "d", account: "kraken", asset: "EUR", amount: 100, timestamp: 2 }],
    }) as TransferOperation[];
    assert.ok(ops.every((op) => op.counterpart === undefined));
  });
});

describe("cohérence des soldes", () => {
  it("signale l'écart entre soldes recalculés et soldes publiés", () => {
    const computed = balancesAt(buildLedger(krakenInput));
    const gaps = reconcileBalances(computed, [
      { account: "kraken", asset: "SOL", quantity: 0.3058 },
      // Du staking non historisé ferait apparaître un écart :
      { account: "kraken", asset: "EUR", quantity: 5 },
    ]);
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].asset, "EUR");
  });

  it("compte pour zéro un actif calculé que la plateforme ne liste pas", () => {
    const computed = new Map([["binance", new Map([["BNB", 0.000372], ["USDC", 112.17]])]]);
    const reported = [{ account: "binance", asset: "BNB", quantity: 0.000372 }];
    assert.deepEqual(reconcileBalances(computed, reported), []);
    const gaps = reconcileBalances(computed, reported, 0.01, { includeUnreported: true });
    assert.deepEqual(gaps.map((gap) => [gap.asset, gap.computed, gap.reported]), [["USDC", 112.17, 0]]);
    // Un compte qui ne publie rien n'est pas contrôlé.
    assert.deepEqual(reconcileBalances(computed, [], 0.01, { includeUnreported: true }), []);
  });
});
