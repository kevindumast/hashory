import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planKucoinImport, type ExistingKucoinData, type KucoinImportInput } from "./kucoin-import-plan";
import { cardPurchaseId } from "./kucoin-export";

const T0 = Date.UTC(2025, 0, 25, 2, 43, 51);
const MIN = 60_000;

const none: ExistingKucoinData = { tradeIds: [], orderIds: [], converts: [], deposits: [], withdrawals: [], cardPurchases: [] };
const nothing: KucoinImportInput = { spotTrades: [], converts: [], deposits: [], withdrawals: [], cardPurchases: [] };

const deposit = { hash: "0xAbC", coin: "USDC", amount: 9.95, fee: 0, address: "", network: "BASE", executedAt: T0 };
const withdrawal = { hash: "deadbeef", coin: "KAS", amount: 95.23, fee: 4.77, address: "", network: "KAS", executedAt: T0 };

describe("plan d'import KuCoin", () => {
  it("n'ajoute pas un dépôt que la synchronisation API connaît déjà par son hash", () => {
    const plan = planKucoinImport(
      { ...none, deposits: [{ id: "api", key: "kucoin-0xabc", txId: "0xabc", coin: "USDC", amount: 9.95, time: T0 }] },
      { ...nothing, deposits: [deposit] }
    );
    assert.equal(plan.deposits.length, 0);
    assert.deepEqual(plan.deleteDepositIds, []);
  });

  it("efface la copie importée d'un dépôt que l'API a aussi enregistré", () => {
    const plan = planKucoinImport(
      {
        ...none,
        deposits: [
          { id: "api", key: "kucoin-0xabc", txId: "0xabc", coin: "USDC", amount: 9.95, time: T0 },
          { id: "csv", key: "kucoin-deposit:0xABC", txId: "0xABC", coin: "USDC", amount: 9.95, time: T0 },
        ],
      },
      nothing
    );
    assert.deepEqual(plan.deleteDepositIds, ["csv"]);
  });

  it("efface les dépôts tirés du relevé de compte quand le même mouvement existe ailleurs", () => {
    const plan = planKucoinImport(
      {
        ...none,
        deposits: [
          { id: "api", key: "kucoin-0xabc", txId: "0xabc", coin: "USDC", amount: 9.95, time: T0 },
          { id: "legacy", key: "kucoin-deposit:acct-deposit:1:USDC:9.95", txId: "acct-deposit:1", coin: "USDC", amount: 9.95, time: T0 + 3 * MIN },
        ],
      },
      nothing
    );
    assert.deepEqual(plan.deleteDepositIds, ["legacy"]);
  });

  it("garde une ligne du relevé de compte qui est la seule trace du mouvement", () => {
    const plan = planKucoinImport(
      {
        ...none,
        deposits: [{ id: "legacy", key: "kucoin-deposit:acct-deposit:1:USDC:9.95", coin: "USDC", amount: 9.95, time: T0 }],
      },
      nothing
    );
    assert.deepEqual(plan.deleteDepositIds, []);
  });

  it("efface une ligne du relevé de compte dès que l'import en cours apporte le mouvement", () => {
    const plan = planKucoinImport(
      {
        ...none,
        deposits: [{ id: "legacy", key: "kucoin-deposit:acct-deposit:1:USDC:9.95", coin: "USDC", amount: 9.95, time: T0 + 2 * MIN }],
      },
      { ...nothing, deposits: [deposit] }
    );
    assert.equal(plan.deposits.length, 1);
    assert.deepEqual(plan.deleteDepositIds, ["legacy"]);
  });

  it("reconnaît un retrait du relevé de compte, inscrit frais compris", () => {
    const plan = planKucoinImport(
      {
        ...none,
        withdrawals: [
          { id: "api", key: "67b9", txId: "deadbeef", coin: "KAS", amount: 95.23, fee: 4.77, time: T0 },
          { id: "legacy", key: "kucoin-withdrawal:acct-withdraw:1:KAS:100", txId: "acct-withdraw:1", coin: "KAS", amount: 100, fee: 4.77, time: T0 + 2 * MIN },
        ],
      },
      { ...nothing, withdrawals: [withdrawal] }
    );
    assert.equal(plan.withdrawals.length, 0);
    assert.deepEqual(plan.deleteWithdrawalIds, ["legacy"]);
  });

  it("ne rapproche pas deux mouvements d'actifs ou de montants différents", () => {
    const plan = planKucoinImport(
      {
        ...none,
        deposits: [
          { id: "api", key: "kucoin-0xabc", txId: "0xabc", coin: "USDT", amount: 9.95, time: T0 },
          { id: "legacy", key: "kucoin-deposit:acct-deposit:1:USDC:9.95", coin: "USDC", amount: 9.95, time: T0 },
          { id: "legacy2", key: "kucoin-deposit:acct-deposit:2:USDT:5", coin: "USDT", amount: 5, time: T0 },
        ],
      },
      nothing
    );
    assert.deepEqual(plan.deleteDepositIds, []);
  });

  it("ignore un ordre spot déjà connu, par import ou par la synchronisation API", () => {
    const trade = { orderId: "abc1", symbol: "KASUSDT", side: "BUY" as const, avgFilledPrice: 0.1, filledAmount: 10, filledVolume: 1, fee: 0, feeAsset: "USDT", executedAt: T0 };
    const byImport = planKucoinImport({ ...none, tradeIds: ["kucoin-order:abc1"] }, { ...nothing, spotTrades: [trade] });
    const byApi = planKucoinImport({ ...none, tradeIds: ["fill-9"], orderIds: ["abc1"] }, { ...nothing, spotTrades: [trade] });
    const fresh = planKucoinImport(none, { ...nothing, spotTrades: [trade] });
    assert.equal(byImport.spotTrades.length, 0);
    assert.equal(byApi.spotTrades.length, 0);
    assert.equal(fresh.spotTrades.length, 1);
  });

  it("ignore une conversion que l'API a enregistrée à la même minute", () => {
    const convert = { sellAsset: "USDC", sellAmount: 45.4682415, buyAsset: "USDT", buyAmount: 45.36, symbol: "USDTUSDC", side: "BUY" as const, executedAt: T0 };
    const known = { providerTradeId: "kucoin-convert:xyz", fromAsset: "USDC", fromAmount: 45.4682415, executedAt: T0 - MIN };
    assert.equal(planKucoinImport({ ...none, converts: [known] }, { ...nothing, converts: [convert] }).converts.length, 0);
    assert.equal(planKucoinImport({ ...none, converts: [{ ...known, executedAt: T0 - 60 * MIN }] }, { ...nothing, converts: [convert] }).converts.length, 1);
  });

  it("sans prix payé : un stablecoin vaut un dollar par jeton, un autre jeton entre à coût inconnu", () => {
    const usdt = { coin: "USDT", amount: 30.4, channel: "Visa/MasterCard", executedAt: T0 };
    const kas = { coin: "KAS", amount: 181.97, channel: "Visa/MasterCard", executedAt: T0 };
    const plan = planKucoinImport(none, { ...nothing, cardPurchases: [usdt, kas] });
    assert.deepEqual(
      plan.cardTrades.map((p) => [p.coin, p.paid.currency, p.paid.amount, p.estimated]),
      [["USDT", "USD", 30.4, true]]
    );
    assert.deepEqual(plan.cardDeposits.map((p) => p.coin), ["KAS"]);
  });

  it("avec l'export « Fast Trade » : l'achat est enregistré au montant réellement débité", () => {
    const kas = { coin: "KAS", amount: 181.97, channel: "BANK_CARD", executedAt: T0, fiat: { currency: "EUR", amount: 30, fee: 1 } };
    const plan = planKucoinImport(none, { ...nothing, cardPurchases: [kas] });
    assert.deepEqual(plan.cardTrades.map((p) => [p.coin, p.paid.currency, p.paid.amount, p.estimated]), [["KAS", "EUR", 30, false]]);
    assert.equal(plan.cardDeposits.length, 0);
  });

  it("remplace un achat estimé par son vrai prix, sous le même identifiant", () => {
    const at = T0 - 30_000;
    const plan = planKucoinImport(
      {
        ...none,
        cardPurchases: [
          { id: "t1", key: "kucoin-card:1:USDT:30.4", table: "trades", coin: "USDT", amount: 30.4, time: T0, priced: false },
          { id: "d1", key: "kucoin-card:1:KAS:181.97", table: "deposits", coin: "KAS", amount: 181.97, time: T0, priced: false },
        ],
      },
      {
        ...nothing,
        cardPurchases: [
          { coin: "USDT", amount: 30.4, channel: "BANK_CARD", executedAt: at, fiat: { currency: "EUR", amount: 30, fee: 1 } },
          { coin: "KAS", amount: 181.97, channel: "BANK_CARD", executedAt: at, fiat: { currency: "EUR", amount: 30, fee: 1 } },
        ],
      }
    );
    assert.deepEqual(plan.deleteTradeIds, ["t1"]);
    assert.deepEqual(plan.deleteDepositIds, ["d1"]);
    assert.deepEqual(plan.cardTrades.map((p) => p.id), ["kucoin-card:1:USDT:30.4", "kucoin-card:1:KAS:181.97"]);
  });

  it("ne touche pas à un achat déjà enregistré à son vrai prix", () => {
    const plan = planKucoinImport(
      { ...none, cardPurchases: [{ id: "t1", key: "kucoin-card:1:USDT:30.4", table: "trades", coin: "USDT", amount: 30.4, time: T0, priced: true }] },
      { ...nothing, cardPurchases: [{ coin: "USDT", amount: 30.4, channel: "BANK_CARD", executedAt: T0, fiat: { currency: "EUR", amount: 30, fee: 1 } }] }
    );
    assert.equal(plan.cardTrades.length + plan.deleteTradeIds.length, 0);
  });

  it("ne rapproche pas deux achats de quantités ou de dates différentes", () => {
    const known = { id: "t1", key: "k", table: "trades" as const, coin: "USDT", amount: 30.4, time: T0, priced: false };
    const fiat = { currency: "EUR", amount: 30, fee: 1 };
    const plan = planKucoinImport(
      { ...none, cardPurchases: [known] },
      {
        ...nothing,
        cardPurchases: [
          { coin: "USDT", amount: 30.41, channel: "", executedAt: T0, fiat },
          { coin: "USDT", amount: 30.4, channel: "", executedAt: T0 + 60 * MIN, fiat },
        ],
      }
    );
    assert.deepEqual(plan.deleteTradeIds, []);
    assert.equal(plan.cardTrades.length, 2);
  });

  it("n'écrit rien au deuxième import des mêmes fichiers", () => {
    const usdt = { coin: "USDT", amount: 30.4, channel: "Visa/MasterCard", executedAt: T0 };
    const kas = { coin: "KAS", amount: 181.97, channel: "Visa/MasterCard", executedAt: T0 };
    const plan = planKucoinImport(
      {
        ...none,
        tradeIds: [cardPurchaseId(usdt)],
        cardPurchases: [
          { id: "t", key: cardPurchaseId(usdt), table: "trades", coin: "USDT", amount: 30.4, time: T0, priced: false },
          { id: "2", key: cardPurchaseId(kas), table: "deposits", coin: "KAS", amount: 181.97, time: T0, priced: false },
        ],
        deposits: [
          { id: "1", key: "kucoin-deposit:0xAbC", txId: "0xAbC", coin: "USDC", amount: 9.95, time: T0 },
          { id: "2", key: cardPurchaseId(kas), coin: "KAS", amount: 181.97, time: T0 },
        ],
      },
      { ...nothing, deposits: [deposit], cardPurchases: [usdt, kas] }
    );
    assert.equal(plan.deposits.length + plan.cardTrades.length + plan.cardDeposits.length, 0);
    assert.deepEqual(plan.deleteDepositIds, []);
  });

  it("refuse les lignes incohérentes envoyées au serveur", () => {
    const plan = planKucoinImport(none, {
      ...nothing,
      deposits: [
        { ...deposit, amount: -1 },
        { ...deposit, amount: Number.NaN },
        { ...deposit, coin: "usdc'); drop" },
        { ...deposit, executedAt: Date.UTC(2010, 0, 1) },
        { ...deposit, hash: "" },
      ],
      cardPurchases: [
        { coin: "USDT", amount: Number.POSITIVE_INFINITY, channel: "", executedAt: T0 },
        { coin: "USDT", amount: 10, channel: "", executedAt: T0, fiat: { currency: "EUR", amount: -10, fee: 0 } },
        { coin: "USDT", amount: 10, channel: "", executedAt: T0, fiat: { currency: "EUR", amount: 10, fee: 12 } },
      ],
    });
    assert.equal(plan.deposits.length, 0);
    assert.equal(plan.cardTrades.length, 0);
  });
});
