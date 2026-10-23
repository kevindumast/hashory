import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  escapeCsvValue,
  portfolioSheet,
  serializeCsv,
  taxSheet,
  transactionsSheet,
  type Sheet,
} from "./export";

describe("échappement CSV", () => {
  it("laisse intacte une valeur simple", () => {
    assert.equal(escapeCsvValue("BTC"), "BTC");
    assert.equal(escapeCsvValue(42), "42");
  });

  it("passe les décimales en notation française", () => {
    // Un tableur configuré en France attend la virgule décimale.
    assert.equal(escapeCsvValue(1234.56), "1234,56");
    assert.equal(escapeCsvValue(-0.5), "-0,5");
  });

  it("protège une valeur contenant le séparateur", () => {
    // Sans guillemets, cette seule cellule décalerait toutes les suivantes.
    assert.equal(escapeCsvValue("Binance;Compte 2"), '"Binance;Compte 2"');
  });

  it("double les guillemets internes", () => {
    assert.equal(escapeCsvValue('Wallet "principal"'), '"Wallet ""principal"""');
  });

  it("protège les retours à la ligne", () => {
    assert.equal(escapeCsvValue("ligne 1\nligne 2"), '"ligne 1\nligne 2"');
    assert.equal(escapeCsvValue("retour\r"), '"retour\r"');
  });

  it("n'écrit jamais un nombre en notation scientifique", () => {
    // String(0.00000041) donne « 4.1e-7 », qu'un tableur ne lit pas.
    assert.equal(escapeCsvValue(0.00000041), "0,00000041");
    assert.equal(escapeCsvValue(1e21), "1000000000000000000000");
  });

  it("rend une cellule vide pour une valeur absente", () => {
    assert.equal(escapeCsvValue(null), "");
    assert.equal(escapeCsvValue(undefined), "");
  });
});

describe("sérialisation", () => {
  it("écrit l'en-tête puis les lignes", () => {
    const sheet: Sheet = {
      filename: "test.csv",
      columns: ["Actif", "Quantité"],
      rows: [
        ["BTC", 1.5],
        ["ETH", 10],
      ],
    };
    assert.equal(serializeCsv(sheet), "Actif;Quantité\r\nBTC;1,5\r\nETH;10");
  });

  it("préserve l'alignement des colonnes malgré un séparateur dans une valeur", () => {
    const sheet: Sheet = {
      filename: "test.csv",
      columns: ["Source", "Montant"],
      rows: [["Kraken; ancien compte", 100]],
    };
    const lines = serializeCsv(sheet).split("\r\n");
    // Deux colonnes attendues : le point-virgule interne est neutralisé.
    assert.equal(lines[1], '"Kraken; ancien compte";100');
  });

  it("gère une feuille sans ligne", () => {
    assert.equal(serializeCsv({ filename: "v.csv", columns: ["A", "B"], rows: [] }), "A;B");
  });
});

describe("feuille des cessions", () => {
  const event = {
    date: Date.UTC(2025, 2, 14),
    asset: "BTC",
    quantity: 0.25,
    proceedsUsd: 20_000,
    costBasisUsd: 6_000,
    gainLossUsd: 14_000,
    proceedsEur: 18_400,
    costBasisEur: 5_520,
    gainLossEur: 12_880,
    fxRate: 0.92,
    source: "trade",
  };

  it("place l'euro avant le dollar", () => {
    const sheet = taxSheet(2025, [event]);
    // La déclaration se fait en euros : c'est la devise de tête.
    assert.ok(sheet.columns[3].includes("EUR"));
    assert.ok(sheet.columns.indexOf("Prix de cession (EUR)") < sheet.columns.indexOf("Prix de cession (USD)"));
    assert.equal(sheet.rows[0][3], 18_400);
  });

  it("conserve le taux appliqué pour rendre la ligne vérifiable", () => {
    const sheet = taxSheet(2025, [event]);
    assert.equal(sheet.rows[0][sheet.columns.indexOf("Taux EUR/USD appliqué")], 0.92);
  });

  it("date en ISO, indépendamment du fuseau du lecteur", () => {
    assert.equal(taxSheet(2025, [event]).rows[0][0], "2025-03-14");
  });

  it("laisse les colonnes euro vides quand la conversion manque", () => {
    const sheet = taxSheet(2025, [
      { ...event, proceedsEur: null, costBasisEur: null, gainLossEur: null, fxRate: null },
    ]);
    assert.equal(sheet.rows[0][3], null);
    // Le dollar reste renseigné : on ne perd pas la donnée disponible.
    assert.equal(sheet.rows[0][6], 20_000);
  });

  it("nomme le fichier par année", () => {
    assert.equal(taxSheet(2024, []).filename, "hashory-cessions-2024.csv");
  });
});

describe("feuille du portefeuille", () => {
  const position = {
    symbol: "ETH",
    quantity: 4,
    avgCostBasis: 2_000,
    currentPrice: 3_000,
    value: 12_000,
    cost: 8_000,
    realizedPnl: 500,
    unrealizedPnl: 4_000,
    weight: 0.42,
    sources: "Binance · Wallet ETH",
  };

  it("calcule l'écart au prix de revient", () => {
    const sheet = portfolioSheet([position], Date.UTC(2025, 8, 5));
    const index = sheet.columns.indexOf("Écart au prix de revient (%)");
    // 3 000 contre 2 000 : +50 %.
    assert.equal(sheet.rows[0][index], 50);
  });

  it("exprime le poids en pourcentage", () => {
    const sheet = portfolioSheet([position], Date.UTC(2025, 8, 5));
    assert.equal(sheet.rows[0][sheet.columns.indexOf("Poids (%)")], 42);
  });

  it("laisse l'écart vide sans cours ni prix de revient", () => {
    const sheet = portfolioSheet(
      [{ ...position, currentPrice: null, value: null, unrealizedPnl: null }],
      Date.UTC(2025, 8, 5)
    );
    assert.equal(sheet.rows[0][sheet.columns.indexOf("Écart au prix de revient (%)")], null);
  });

  it("date le fichier du jour de l'export", () => {
    assert.equal(
      portfolioSheet([], Date.UTC(2025, 8, 5)).filename,
      "hashory-portefeuille-2025-09-05.csv"
    );
  });
});

describe("feuille du portefeuille en euros", () => {
  it("indique la devise dans les en-têtes", () => {
    const sheet = portfolioSheet([], Date.UTC(2025, 8, 5), "EUR");
    assert.ok(sheet.columns.includes("Capital investi (EUR)"));
    assert.ok(!sheet.columns.some((column) => column.includes("USD")));
  });

  it("reste en dollars par défaut", () => {
    assert.ok(portfolioSheet([], Date.UTC(2025, 8, 5)).columns.includes("Valeur actuelle (USD)"));
  });
});

describe("feuille des transactions", () => {
  const row = {
    date: "01/10/2025",
    time: "14:02",
    label: "Échange",
    outQuantity: 1500.5,
    outCurrency: "USDC",
    outAccount: "Binance",
    inQuantity: 0.00000041,
    inCurrency: "BTC",
    inAccount: "Binance",
    price: 114_000,
    fee: 0.75,
    feeAsset: "USDC",
    amountUsd: 1500.456,
    amountEur: 1290.004,
    externalId: "8812;77",
    txId: null,
    id: "k57abc",
  };

  it("produit un CSV séparé par des points-virgules", () => {
    const csv = serializeCsv(transactionsSheet([row], Date.UTC(2025, 9, 1)));
    const [header, line] = csv.split("\r\n");
    assert.equal(header.split(";").length, 17);
    assert.equal(
      line,
      '01/10/2025;14:02;Échange;-1500,5;USDC;Binance;0,00000041;BTC;Binance;114000;0,75;USDC;1500,46;1290;"8812;77";;k57abc'
    );
  });

  it("nomme le fichier par date", () => {
    assert.equal(
      transactionsSheet([], Date.UTC(2025, 9, 1)).filename,
      "hashory-transactions-2025-10-01.csv"
    );
  });
});
