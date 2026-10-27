import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cardPurchaseId,
  exportTimeZone,
  mergeKucoinExports,
  parseCsvRows,
  parseKucoinExport,
  parseKucoinTime,
} from "./kucoin-export";

// En-têtes réels des exports KuCoin ; valeurs fictives.
const SPOT = ["UID", "Account Type", "Order ID", "Order Time(UTC+08:00)", "Symbol", "Side", "Order Type", "Order Price", "Order Amount", "Avg. Filled Price", "Filled Amount", "Filled Volume", "Filled Volume (USDT)", "Filled Time(UTC+08:00)", "Fee", "Fee Currency", "Tax", "Status"];
const SPOT_SPLIT = ["UID", "Account Type", "Order ID", "Symbol", "Side", "Order Type", "Avg. Filled Price", "Filled Amount", "Filled Volume", "Filled Volume (USDT)", "Filled Time(UTC+08:00)", "Fee", "Tax", "Maker/Taker", "Fee Currency"];
const CONVERT = ["UID", "Account Type", "Payment Account", "Sell", "Buy", "Price", "Tax", "Time of Update(UTC+08:00)", "Status"];
const DEPOSIT = ["UID", "Account Type", "Time(UTC+08:00)", "Coin", "Amount", "Fee", "Hash", "Deposit Address", "Transfer Network", "Status", "Remarks"];
const WITHDRAWAL = ["UID", "Account Type", "Time(UTC+08:00)", "Coin", "Amount", "Fee", "Hash", "Withdrawal Address/Account", "Transfer Network", "Status", "Remarks"];
const ACCOUNT = ["UID", "Account Type", "Currency", "Side", "Amount", "Fee", "Time(UTC+08:00)", "Remark", "Type"];

describe("exports KuCoin", () => {
  it("lit l'heure de KuCoin, exprimée en UTC+8", () => {
    assert.equal(parseKucoinTime("2024-03-05 15:43:21"), Date.UTC(2024, 2, 5, 7, 43, 21));
    assert.equal(parseKucoinTime("No matching records found."), null);
    assert.equal(parseKucoinTime(""), null);
  });

  it("lit le fuseau choisi à l'export dans l'en-tête, pas seulement UTC+8", () => {
    const row = ["1", "mainAccount", "2025-01-25 02:43:51", "USDC", "9.95", "0", "0xabc", "", "BASE", "SUCCESS", ""];
    const utc8 = parseKucoinExport([DEPOSIT, row]);
    const utc0 = parseKucoinExport([DEPOSIT.map((h) => h.replace("UTC+08:00", "UTC-0")), row]);
    assert.equal(utc8.deposits[0].executedAt, Date.UTC(2025, 0, 24, 18, 43, 51));
    assert.equal(utc0.deposits[0].executedAt, Date.UTC(2025, 0, 25, 2, 43, 51));
    assert.equal(exportTimeZone(["Time(UTC-05:30)"]), "-05:30");
    assert.equal(exportTimeZone(["Time"]), "+08:00");
  });

  it("reprend les ordres spot exécutés, entièrement ou en partie", () => {
    const result = parseKucoinExport([
      SPOT,
      ["1", "mainAccount", "aaa111", "2025-01-15 04:54:44", "MORPHO-USDT", "BUY", "LIMIT", "2.4", "20", "2.4", "20", "48", "48", "2025-01-15 04:55:00", "0.096", "USDT", "", "deal"],
      ["1", "mainAccount", "bbb222", "2025-01-29 05:29:00", "ONDO-USDT", "SELL", "MARKET", "0", "0", "1.5", "10", "15", "15", "2025-01-29 05:29:40", "0.03", "USDT", "", "part_deal"],
      ["1", "mainAccount", "ccc333", "2025-01-29 05:29:00", "ONDO-USDT", "BUY", "LIMIT", "1", "10", "0", "0", "0", "0", "2025-01-29 05:29:40", "0", "USDT", "", "cancel"],
    ]);
    assert.equal(result.kind, "spot");
    assert.equal(result.skipped, 1);
    assert.deepEqual(result.spotTrades[0], {
      orderId: "aaa111",
      symbol: "MORPHOUSDT",
      side: "BUY",
      avgFilledPrice: 2.4,
      filledAmount: 20,
      filledVolume: 48,
      fee: 0.096,
      feeAsset: "USDT",
      executedAt: Date.UTC(2025, 0, 14, 20, 55, 0),
    });
    assert.equal(result.spotTrades[1].side, "SELL");
  });

  it("ignore la variante « Show Order-Splitting », qui répète les mêmes ordres", () => {
    const result = parseKucoinExport([
      SPOT_SPLIT,
      ["1", "mainAccount", "aaa111", "CFG-USDT", "BUY", "MARKET", "0.84", "12", "10", "10", "2024-04-07 16:18:10", "0.02", "", "TAKER", "USDT"],
    ]);
    assert.equal(result.kind, "spot_split");
    assert.equal(result.spotTrades.length, 0);
  });

  it("reprend les conversions réussies avec leurs deux jambes", () => {
    const result = parseKucoinExport([
      CONVERT,
      ["1", "mainAccount", "MAIN", "10 USDT", "77.1727 KAS", "1 USDT=7.71727 KAS", "", "2024-03-19 02:47:31", "SUCCESS"],
      ["1", "mainAccount", "MAIN", "10 USDT", "77 KAS", "", "", "2024-03-19 02:48:31", "FAILED"],
    ]);
    assert.equal(result.kind, "convert");
    assert.deepEqual(result.converts, [
      { sellAsset: "USDT", sellAmount: 10, buyAsset: "KAS", buyAmount: 77.1727, symbol: "KASUSDT", side: "BUY", executedAt: Date.UTC(2024, 2, 18, 18, 47, 31) },
    ]);
    assert.equal(result.skipped, 1);
  });

  it("reprend dépôts et retraits on-chain avec leur hash et leurs frais", () => {
    const deposits = parseKucoinExport([
      DEPOSIT,
      ["1", "mainAccount", "2025-01-25 02:43:51", "USDC", "9.95", "0", "0xabc", "0xaddr", "BASE", "SUCCESS", "Deposit"],
    ]);
    const withdrawals = parseKucoinExport([
      WITHDRAWAL,
      ["1", "mainAccount", "2025-02-22 16:23:01", "KAS", "95.23", "4.77", "deadbeef", "kaspa:qq", "KAS", "SUCCESS", ""],
      ["1", "mainAccount", "2025-02-22 16:24:01", "KAS", "10", "1", "", "kaspa:qq", "KAS", "SUCCESS", ""],
    ]);
    assert.equal(deposits.kind, "deposit");
    assert.equal(deposits.deposits[0].hash, "0xabc");
    assert.equal(deposits.deposits[0].network, "BASE");
    assert.equal(withdrawals.kind, "withdrawal");
    assert.equal(withdrawals.withdrawals.length, 1);
    assert.equal(withdrawals.withdrawals[0].amount, 95.23);
    assert.equal(withdrawals.withdrawals[0].fee, 4.77);
    assert.equal(withdrawals.skipped, 1);
  });

  it("ne garde du relevé de compte que les achats par carte", () => {
    const result = parseKucoinExport([
      ACCOUNT,
      ["1", "mainAccount", "KAS", "Deposit", "181.9786", "0", "2024-03-05 15:43:21", "Visa/MasterCard", "Credit Card Transactions"],
      ["1", "mainAccount", "USDT", "Deposit", "50.76", "0", "2024-04-26 17:32:26", "finaro", "Credit Card Transactions"],
      // Doublons des autres fichiers : jamais repris d'ici.
      ["1", "mainAccount", "USDC", "Deposit", "9.95", "0", "2025-01-25 02:46:23", "Deposit", "Deposit"],
      ["1", "mainAccount", "KAS", "Withdrawal", "100", "4.77", "2025-02-22 16:25:15", "", "Withdraw"],
      ["1", "mainAccount", "USDT", "Withdrawal", "10", "0", "2024-03-19 02:47:10", "", "Convert Market"],
      ["1", "mainAccount", "USDT", "Withdrawal", "30", "0", "2024-05-29 14:33:46", "Trading Account", "Transfer"],
      ["1", "mainAccount", "MORPHO", "Deposit", "19.88", "0", "2025-01-15 04:55:00", "", "Spot"],
    ]);
    assert.equal(result.kind, "account");
    assert.deepEqual(result.cardPurchases, [
      { coin: "KAS", amount: 181.9786, channel: "Visa/MasterCard", executedAt: Date.UTC(2024, 2, 5, 7, 43, 21) },
      { coin: "USDT", amount: 50.76, channel: "finaro", executedAt: Date.UTC(2024, 3, 26, 9, 32, 26) },
    ]);
    assert.equal(result.deposits.length + result.withdrawals.length, 0);
    assert.equal(result.skipped, 5);
  });

  it("lit les achats par carte de « Fast Trade Orders », en UTC, et écarte les paiements refusés", () => {
    const rows = parseCsvRows(
      "Order ID,Currency (Crypto),Crypto Quantity,Currency (Fiat),Fiat Amount,Fee Currency (Fiat),Fee (Fiat),Payment Method,Status,Time(UTC)\n" +
        "pir_1,KAS,181.9786,EUR,30,EUR,1,BANK_CARD,SUCCEEDED,2024-03-05 07:42:48\n" +
        "pir_2,USDT,30.69,EUR,30,EUR,1,BANK_CARD,FAILED,2024-08-05 20:25:04\n"
    );
    const result = parseKucoinExport(rows);
    assert.equal(result.kind, "fiat_fast_trade");
    assert.deepEqual(result.cardPurchases, [
      {
        coin: "KAS",
        amount: 181.9786,
        channel: "BANK_CARD",
        executedAt: Date.UTC(2024, 2, 5, 7, 42, 48),
        fiat: { currency: "EUR", amount: 30, fee: 1 },
      },
    ]);
    assert.equal(result.skipped, 1);
  });

  it("complète l'achat du relevé de compte par le montant payé, sans le compter deux fois", () => {
    const account = parseKucoinExport([
      ACCOUNT,
      ["1", "mainAccount", "KAS", "Deposit", "181.9786", "0", "2024-03-05 15:43:21", "Visa/MasterCard", "Credit Card Transactions"],
    ]);
    const orders = parseKucoinExport(
      parseCsvRows(
        "Order ID,Currency (Crypto),Crypto Quantity,Currency (Fiat),Fiat Amount,Fee Currency (Fiat),Fee (Fiat),Payment Method,Status,Time(UTC)\n" +
          "pir_1,KAS,181.9786,EUR,30,EUR,1,BANK_CARD,SUCCEEDED,2024-03-05 07:42:48\n" +
          "pir_3,USDT,48.74,EUR,50,EUR,1,BANK_CARD,SUCCEEDED,2025-01-14 20:52:46\n"
      )
    );
    const merged = mergeKucoinExports([orders, account]);
    assert.equal(merged.cardPurchases.length, 2);
    // L'heure du relevé de compte est gardée : c'est elle qui fonde l'identifiant.
    assert.deepEqual(merged.cardPurchases[0], {
      coin: "KAS",
      amount: 181.9786,
      channel: "Visa/MasterCard",
      executedAt: Date.UTC(2024, 2, 5, 7, 43, 21),
      fiat: { currency: "EUR", amount: 30, fee: 1 },
    });
    assert.equal(merged.cardPurchases[1].coin, "USDT");
  });

  it("signale les autres exports « Fiat Orders », pas encore importés", () => {
    const empty = parseKucoinExport(
      parseCsvRows("﻿Order ID,Currency (Fiat),Fiat Amount,Fee,Deposit Method,Status,Time(UTC)\nNo matching records found.\n")
    );
    const filled = parseKucoinExport(
      parseCsvRows("Order ID,Currency (Fiat),Fiat Amount,Fee,Deposit Method,Status,Time(UTC)\nx,EUR,100,0,SEPA,SUCCESS,2024-01-01 00:00:00\n")
    );
    assert.equal(empty.kind, "fiat_other");
    assert.equal(empty.skipped, 0);
    assert.equal(filled.kind, "fiat_other");
    assert.equal(filled.skipped, 1);
  });

  it("traite une période vide comme un fichier sans ligne", () => {
    const result = parseKucoinExport([DEPOSIT, ["No matching records found.", "", "", "", "", "", "", "", "", "", ""]]);
    assert.equal(result.kind, "deposit");
    assert.equal(result.deposits.length, 0);
    assert.equal(result.skipped, 0);
  });

  it("ne reconnaît pas un fichier étranger", () => {
    const result = parseKucoinExport([["Date", "Montant"], ["2024-01-01", "3"]]);
    assert.equal(result.kind, "unknown");
  });

  it("écarte les valeurs aberrantes plutôt que de les enregistrer", () => {
    const result = parseKucoinExport([
      DEPOSIT,
      ["1", "mainAccount", "2025-01-25 02:43:51", "<script>", "1", "0", "0xabc", "", "", "SUCCESS", ""],
      ["1", "mainAccount", "2025-01-25 02:43:51", "USDC", "-5", "0", "0xdef", "", "", "SUCCESS", ""],
      ["1", "mainAccount", "pas une date", "USDC", "5", "0", "0x123", "", "", "SUCCESS", ""],
    ]);
    assert.equal(result.deposits.length, 0);
    assert.equal(result.skipped, 3);
  });

  it("fusionne les années sans compter deux fois une même ligne", () => {
    const deposit = parseKucoinExport([
      DEPOSIT,
      ["1", "mainAccount", "2025-01-25 02:43:51", "USDC", "9.95", "0", "0xABC", "", "BASE", "SUCCESS", ""],
    ]);
    const again = parseKucoinExport([
      DEPOSIT,
      ["1", "mainAccount", "2025-01-25 02:43:51", "USDC", "9.95", "0", "0xabc", "", "BASE", "SUCCESS", ""],
    ]);
    const merged = mergeKucoinExports([deposit, again]);
    assert.equal(merged.deposits.length, 1);
  });

  it("donne un identifiant stable aux achats par carte, pour qu'un réimport n'ajoute rien", () => {
    const purchase = { coin: "USDT", amount: 30.4, channel: "Visa/MasterCard", executedAt: 1 };
    assert.equal(cardPurchaseId(purchase), cardPurchaseId({ ...purchase }));
  });

  it("lit aussi les exports au format CSV", () => {
    const rows = parseCsvRows('﻿UID,Sell,Buy,Price,Tax,Time of Update(UTC+08:00),Status\n1,"10 USDT","77 KAS",x,,2024-03-19 02:47:31,SUCCESS\n');
    assert.deepEqual(rows[1], ["1", "10 USDT", "77 KAS", "x", "", "2024-03-19 02:47:31", "SUCCESS"]);
  });
});
