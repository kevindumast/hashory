import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EVM_CHAINS } from "./evm-chains";
import {
  interpretEtherscanResponse,
  parseMoralisHistory,
  parseNativeTxs,
  parseTokenTxs,
  type EtherscanTokenTx,
  type EtherscanTx,
  type MoralisHistoryItem,
} from "./evm-transfers";

const ME = "0xe62cd3e7b0afe4d43b03435c737072e77cbf1fb4";
// Saisie telle que l'utilisateur la colle : casse mixte.
const ME_MIXED = "0xE62cD3e7b0Afe4D43b03435C737072E77cbF1FB4";
const OTHER = "0x1111111111111111111111111111111111111111";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

function nativeTx(overrides: Partial<EtherscanTx>): EtherscanTx {
  return {
    blockNumber: "100",
    timeStamp: "1700000000",
    hash: "0xaaa",
    from: OTHER,
    to: ME_MIXED,
    value: "1500000000000000000",
    gasUsed: "21000",
    gasPrice: "20000000000",
    isError: "0",
    ...overrides,
  };
}

function tokenTx(overrides: Partial<EtherscanTokenTx>): EtherscanTokenTx {
  return {
    blockNumber: "200",
    timeStamp: "1700000100",
    hash: "0xbbb",
    from: OTHER,
    to: ME,
    value: "2500000",
    tokenSymbol: "USDC",
    tokenDecimal: "6",
    contractAddress: USDC,
    ...overrides,
  };
}

describe("Ethereum — non-régression", () => {
  // Ces identifiants sont ceux déjà enregistrés en base : les changer ferait
  // réinsérer tout l'historique à la prochaine synchronisation.
  it("produit exactement les dépôts et retraits natifs d'origine", () => {
    const parsed = parseNativeTxs(
      [
        nativeTx({ hash: "0xin", blockNumber: "100" }),
        nativeTx({ hash: "0xout", blockNumber: "105", from: ME_MIXED, to: OTHER, value: "500000000000000000" }),
      ],
      ME_MIXED,
      EVM_CHAINS.ethereum
    );

    assert.deepEqual(parsed.deposits, [
      {
        depositId: "0xin-eth-in",
        coin: "ETH",
        amount: 1.5,
        network: "ethereum",
        status: "CONFIRMED",
        insertTime: 1_700_000_000_000,
        txId: "0xin",
      },
    ]);
    assert.deepEqual(parsed.withdrawals, [
      {
        withdrawId: "0xout-eth-out",
        coin: "ETH",
        amount: 0.5,
        network: "ethereum",
        status: "CONFIRMED",
        applyTime: 1_700_000_000_000,
        txId: "0xout",
        fee: 0.00042,
      },
    ]);
    assert.equal(parsed.maxBlock, 105);
  });

  it("produit exactement les transferts de jetons d'origine", () => {
    const parsed = parseTokenTxs(
      [
        tokenTx({ hash: "0xtin" }),
        tokenTx({ hash: "0xtout", from: ME, to: OTHER, value: "1000000" }),
      ],
      ME,
      EVM_CHAINS.ethereum
    );

    assert.deepEqual(parsed.deposits, [
      {
        depositId: `0xtin-${USDC.toLowerCase()}-in`,
        coin: "USDC",
        amount: 2.5,
        network: "ethereum",
        status: "CONFIRMED",
        insertTime: 1_700_000_100_000,
        txId: "0xtin",
      },
    ]);
    assert.deepEqual(parsed.withdrawals, [
      {
        withdrawId: `0xtout-${USDC.toLowerCase()}-out`,
        coin: "USDC",
        amount: 1,
        network: "ethereum",
        status: "CONFIRMED",
        applyTime: 1_700_000_100_000,
        txId: "0xtout",
        fee: 0,
      },
    ]);
  });

  it("écarte les transactions échouées et nulles, mais en retient le bloc", () => {
    const parsed = parseNativeTxs(
      [
        nativeTx({ hash: "0xfail", isError: "1", blockNumber: "300" }),
        nativeTx({ hash: "0xzero", value: "0", blockNumber: "310" }),
      ],
      ME,
      EVM_CHAINS.ethereum
    );
    assert.equal(parsed.deposits.length, 0);
    assert.equal(parsed.withdrawals.length, 0);
    // Sinon le curseur ne progresserait pas et ces blocs seraient relus.
    assert.equal(parsed.maxBlock, 310);
  });

  it("ignore les jetons sans décimales et nomme un jeton anonyme par son contrat", () => {
    const parsed = parseTokenTxs(
      [
        tokenTx({ hash: "0xnft", tokenDecimal: "" }),
        tokenTx({ hash: "0xanon", tokenSymbol: "", contractAddress: "0xABCDEF0123456789" }),
      ],
      ME,
      EVM_CHAINS.ethereum
    );
    assert.equal(parsed.deposits.length, 1);
    assert.equal(parsed.deposits[0].coin, "0xabcdef");
  });

  it("conserve le comportement d'origine pour un envoi à soi-même : un retrait", () => {
    const parsed = parseNativeTxs([nativeTx({ from: ME, to: ME })], ME, EVM_CHAINS.ethereum);
    assert.equal(parsed.deposits.length, 0);
    assert.equal(parsed.withdrawals.length, 1);
  });

  it("ne plante pas sur une création de contrat (destinataire absent)", () => {
    const parsed = parseNativeTxs([nativeTx({ from: ME, to: null })], ME, EVM_CHAINS.ethereum);
    assert.equal(parsed.withdrawals.length, 1);
  });
});

describe("chaînes ajoutées — lecture à la Etherscan", () => {
  it("étiquette les transferts Arbitrum avec leur réseau, en ETH", () => {
    const parsed = parseNativeTxs([nativeTx({ hash: "0xarb" })], ME, EVM_CHAINS.arbitrum);
    assert.equal(parsed.deposits[0].network, "arbitrum");
    assert.equal(parsed.deposits[0].coin, "ETH");
    assert.equal(parsed.deposits[0].depositId, "0xarb-eth-in");
  });

  it("étiquette les jetons Base avec leur réseau", () => {
    const parsed = parseTokenTxs([tokenTx({})], ME, EVM_CHAINS.base);
    assert.equal(parsed.deposits[0].network, "base");
  });

  it("libelle le natif BSC en BNB", () => {
    const parsed = parseNativeTxs([nativeTx({ hash: "0xbsc" })], ME, EVM_CHAINS.bsc);
    assert.equal(parsed.deposits[0].coin, "BNB");
    assert.equal(parsed.deposits[0].depositId, "0xbsc-bnb-in");
  });
});

describe("interpretEtherscanResponse", () => {
  it("rend les transactions d'une réponse valide", () => {
    const outcome = interpretEtherscanResponse({ status: "1", message: "OK", result: [nativeTx({})] });
    assert.equal(outcome.kind, "ok");
    assert.equal(outcome.kind === "ok" && outcome.txs.length, 1);
  });

  it("traite l'absence de transaction comme une fin, pas une erreur", () => {
    const outcome = interpretEtherscanResponse({ status: "0", message: "No transactions found", result: [] });
    assert.equal(outcome.kind, "empty");
  });

  it("reconnaît une clé refusée malgré le statut 200", () => {
    const outcome = interpretEtherscanResponse({
      status: "0",
      message: "NOTOK",
      result: "Invalid API Key (#err2)",
    });
    assert.equal(outcome.kind, "rejected_key");
  });

  it("reconnaît une chaîne hors de l'offre gratuite d'Etherscan", () => {
    const outcome = interpretEtherscanResponse({
      status: "0",
      message: "NOTOK",
      result:
        "Free API access is not supported for this chain. Please upgrade your api plan for full chain coverage. https://etherscan.io/apis",
    });
    assert.equal(outcome.kind, "paid_chain");
  });

  it("reconnaît le refus de clé au format Blockscout", () => {
    assert.equal(interpretEtherscanResponse({ error: "Unauthorized" }).kind, "rejected_key");
  });

  it("remonte le détail d'une autre erreur", () => {
    const outcome = interpretEtherscanResponse({ status: "0", message: "NOTOK", result: "Max rate limit reached" });
    assert.deepEqual(outcome, { kind: "error", message: "NOTOK Max rate limit reached" });
  });
});

function moralisItem(overrides: Partial<MoralisHistoryItem>): MoralisHistoryItem {
  return {
    hash: "0xm1",
    block_number: "40000000",
    block_timestamp: "2024-06-01T12:00:00.000Z",
    from_address: OTHER,
    receipt_status: "1",
    transaction_fee: "0.000105",
    native_transfers: [],
    erc20_transfers: [],
    ...overrides,
  };
}

describe("parseMoralisHistory (BNB Smart Chain)", () => {
  const bsc = EVM_CHAINS.bsc;
  const at = Date.parse("2024-06-01T12:00:00.000Z");

  it("enregistre un BNB reçu, sans frais pour le destinataire", () => {
    const parsed = parseMoralisHistory(
      [
        moralisItem({
          native_transfers: [{ from_address: OTHER, to_address: ME_MIXED, value: "2000000000000000000" }],
        }),
      ],
      ME_MIXED,
      bsc
    );
    assert.deepEqual(parsed.deposits, [
      {
        depositId: "0xm1-bnb-0-in",
        coin: "BNB",
        amount: 2,
        network: "bsc",
        status: "CONFIRMED",
        insertTime: at,
        txId: "0xm1",
      },
    ]);
    assert.equal(parsed.withdrawals.length, 0);
  });

  it("impute le gas une seule fois, au premier envoi natif", () => {
    const parsed = parseMoralisHistory(
      [
        moralisItem({
          from_address: ME,
          native_transfers: [
            { from_address: ME, to_address: OTHER, value: "1000000000000000000" },
            { from_address: ME, to_address: OTHER, value: "500000000000000000", internal_transaction: true },
          ],
        }),
      ],
      ME,
      bsc
    );
    assert.deepEqual(
      parsed.withdrawals.map((w) => [w.withdrawId, w.amount, w.fee]),
      [
        ["0xm1-bnb-0-out", 1, 0.000105],
        ["0xm1-bnb-1-out", 0.5, 0],
      ]
    );
  });

  it("compte un BNB reçu par transfert interne (sortie de contrat)", () => {
    const parsed = parseMoralisHistory(
      [
        moralisItem({
          from_address: ME,
          native_transfers: [
            { from_address: OTHER, to_address: ME, value: "300000000000000000", internal_transaction: true },
          ],
        }),
      ],
      ME,
      bsc
    );
    assert.equal(parsed.deposits.length, 1);
    assert.equal(parsed.deposits[0].amount, 0.3);
  });

  it("lit les jetons BEP-20 et écarte le spam", () => {
    const parsed = parseMoralisHistory(
      [
        moralisItem({
          erc20_transfers: [
            {
              address: USDC,
              from_address: OTHER,
              to_address: ME,
              value: "5000000000000000000",
              token_symbol: "USDT",
              token_decimals: "18",
              log_index: 7,
            },
            {
              address: OTHER,
              from_address: OTHER,
              to_address: ME,
              value: "999000000000000000000",
              token_symbol: "FREE-AIRDROP",
              token_decimals: "18",
              log_index: 8,
              possible_spam: true,
            },
          ],
        }),
      ],
      ME,
      bsc
    );
    assert.deepEqual(
      parsed.deposits.map((d) => [d.depositId, d.coin, d.amount]),
      [[`0xm1-${USDC.toLowerCase()}-7-in`, "USDT", 5]]
    );
  });

  it("écarte une transaction échouée mais en retient le bloc", () => {
    const parsed = parseMoralisHistory(
      [
        moralisItem({
          receipt_status: "0",
          block_number: "40000099",
          native_transfers: [{ from_address: OTHER, to_address: ME, value: "1" }],
        }),
      ],
      ME,
      bsc
    );
    assert.equal(parsed.deposits.length, 0);
    assert.equal(parsed.maxBlock, 40_000_099);
  });

  it("tolère des listes de transferts absentes", () => {
    const parsed = parseMoralisHistory(
      [{ ...moralisItem({}), native_transfers: undefined, erc20_transfers: undefined }],
      ME,
      bsc
    );
    assert.deepEqual(parsed.deposits, []);
    assert.deepEqual(parsed.withdrawals, []);
  });
});
