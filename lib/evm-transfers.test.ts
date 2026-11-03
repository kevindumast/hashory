import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EVM_CHAINS } from "./evm-chains";
import {
  alchemyBlocksMissingTimestamp,
  alchemyOutgoingNativeHashes,
  feeFromReceipt,
  interpretEtherscanResponse,
  parseAlchemyTransfers,
  parseNativeTxs,
  parseTokenTxs,
  type AlchemyTransfer,
  type EtherscanTokenTx,
  type EtherscanTx,
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

function alchemyNative(overrides: Partial<AlchemyTransfer>): AlchemyTransfer {
  const hash = overrides.hash ?? "0xa1";
  return {
    blockNum: "0x2625a00",
    uniqueId: `${hash}:external`,
    hash,
    from: OTHER,
    to: ME,
    asset: "BNB",
    category: "external",
    rawContract: { value: "0x1bc16d674ec80000", address: null, decimal: "0x12" },
    ...overrides,
  };
}

function alchemyToken(overrides: Partial<AlchemyTransfer>): AlchemyTransfer {
  const hash = overrides.hash ?? "0xt1";
  return {
    blockNum: "0x2625a01",
    uniqueId: `${hash}:log:7`,
    hash,
    from: OTHER,
    to: ME,
    asset: "USDT",
    category: "erc20",
    rawContract: { value: "0x4563918244f40000", address: USDC, decimal: "0x12" },
    ...overrides,
  };
}

describe("parseAlchemyTransfers (BNB Smart Chain)", () => {
  const bsc = EVM_CHAINS.bsc;
  const at = 1_717_243_200_000;
  const blockTimes = new Map([
    ["0x2625a00", at],
    ["0x2625a01", at + 1000],
  ]);
  const noFees = new Map<string, number>();

  it("enregistre un BNB reçu, daté par le bloc, sans frais pour le destinataire", () => {
    const parsed = parseAlchemyTransfers([alchemyNative({})], ME_MIXED, bsc, { blockTimes, fees: noFees });
    assert.deepEqual(parsed.deposits, [
      {
        depositId: "0xa1-bnb-in",
        coin: "BNB",
        amount: 2,
        network: "bsc",
        status: "CONFIRMED",
        insertTime: at,
        txId: "0xa1",
      },
    ]);
    assert.equal(parsed.withdrawals.length, 0);
    assert.equal(parsed.maxBlock, 0x2625a00);
  });

  it("impute au BNB envoyé les frais lus dans le reçu", () => {
    const parsed = parseAlchemyTransfers(
      [alchemyNative({ hash: "0xout", from: ME, to: OTHER })],
      ME,
      bsc,
      { blockTimes, fees: new Map([["0xout", 0.000021]]) }
    );
    assert.deepEqual(
      parsed.withdrawals.map((w) => [w.withdrawId, w.coin, w.amount, w.fee]),
      [["0xout-bnb-out", "BNB", 2, 0.000021]]
    );
  });

  it("lit les jetons BEP-20 avec leurs décimales, sans frais", () => {
    const parsed = parseAlchemyTransfers(
      [alchemyToken({}), alchemyToken({ hash: "0xt2", from: ME, to: OTHER })],
      ME,
      bsc,
      { blockTimes, fees: noFees }
    );
    assert.deepEqual(
      parsed.deposits.map((d) => [d.depositId, d.coin, d.amount, d.insertTime]),
      [[`0xt1-${USDC.toLowerCase()}-7-in`, "USDT", 5, at + 1000]]
    );
    assert.deepEqual(
      parsed.withdrawals.map((w) => [w.withdrawId, w.fee]),
      [[`0xt2-${USDC.toLowerCase()}-7-out`, 0]]
    );
  });

  it("préfère l'horodatage fourni par Alchemy quand il existe", () => {
    const parsed = parseAlchemyTransfers(
      [alchemyNative({ blockNum: "0x1", metadata: { blockTimestamp: "2024-01-01T00:00:00.000Z" } })],
      ME,
      bsc,
      { blockTimes: new Map(), fees: noFees }
    );
    assert.equal(parsed.deposits[0].insertTime, Date.parse("2024-01-01T00:00:00.000Z"));
  });

  it("refuse de dater un transfert au hasard", () => {
    // Le curseur ne doit pas avancer au-delà d'un transfert non enregistré.
    assert.throws(
      () => parseAlchemyTransfers([alchemyNative({ blockNum: "0x99" })], ME, bsc, { blockTimes, fees: noFees }),
      /Horodatage introuvable/
    );
  });

  it("ignore les jetons aux décimales inconnues et les montants nuls", () => {
    const parsed = parseAlchemyTransfers(
      [
        alchemyToken({ hash: "0xunk", rawContract: { value: "0x1", address: USDC, decimal: null } }),
        alchemyNative({ hash: "0xzero", rawContract: { value: "0x0", address: null, decimal: "0x12" } }),
      ],
      ME,
      bsc,
      { blockTimes, fees: noFees }
    );
    assert.deepEqual(parsed.deposits, []);
  });

  it("n'enregistre qu'une fois un transfert vu dans les deux sens", () => {
    // Un envoi à soi-même remonte dans la requête des reçus et des envois.
    const self = alchemyNative({ hash: "0xself", from: ME, to: ME });
    const parsed = parseAlchemyTransfers([self, self], ME, bsc, { blockTimes, fees: noFees });
    assert.equal(parsed.withdrawals.length, 1);
  });

  it("nomme un jeton sans symbole par son contrat", () => {
    const parsed = parseAlchemyTransfers([alchemyToken({ asset: null })], ME, bsc, { blockTimes, fees: noFees });
    assert.equal(parsed.deposits[0].coin, USDC.toLowerCase().slice(0, 8));
  });
});

describe("lectures complémentaires Alchemy", () => {
  it("ne demande l'horodatage que des blocs non datés, sans doublon", () => {
    const blocks = alchemyBlocksMissingTimestamp([
      alchemyNative({ blockNum: "0xA" }),
      alchemyToken({ blockNum: "0xa" }),
      alchemyNative({ blockNum: "0xb", metadata: { blockTimestamp: "2024-01-01T00:00:00Z" } }),
    ]);
    assert.deepEqual(blocks, ["0xa"]);
  });

  it("ne lit le reçu que des envois natifs de l'adresse", () => {
    const hashes = alchemyOutgoingNativeHashes(
      [
        alchemyNative({ hash: "0xsent", from: ME_MIXED, to: OTHER }),
        alchemyNative({ hash: "0xreceived" }),
        alchemyToken({ hash: "0xtoken", from: ME, to: OTHER }),
      ],
      ME
    );
    assert.deepEqual(hashes, ["0xsent"]);
  });

  it("calcule les frais à partir du gas consommé et de son prix effectif", () => {
    // 21 000 gas à 1 gwei : 0,000021 BNB.
    assert.equal(feeFromReceipt({ gasUsed: "0x5208", effectiveGasPrice: "0x3b9aca00" }), 0.000021);
  });
});
