import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  acquiredCryptoAssets,
  buildDcaSnapshots,
  buildTradeHistory,
  compoundReturns,
  computeMonthlyFromSnapshots,
  computeMonthlyFromTrades,
  computeQuarterlyReturns,
  hasCryptoDisposal,
  tradeLegs,
  type SeasonalTrade,
} from "./seasonality";

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Les trois opérations Kraken qui affichaient +101 % en septembre. */
const krakenEurToSol: SeasonalTrade[] = [
  {
    // Telle que la synchro Kraken l'enregistre : vente d'EUR contre USDC.
    tradeType: "CONVERT",
    symbol: "EURUSDC",
    side: "SELL",
    quantity: 28.34,
    price: 1.1457,
    quoteQuantity: 32.47,
    executedAt: day("2026-09-04") + 8 * 3_600_000,
    fromAsset: "EUR",
    fromAmount: 28.34,
    toAsset: "USDC",
    toAmount: 32.47,
  },
  {
    tradeType: "CONVERT",
    symbol: "SOLUSDC",
    side: "BUY",
    quantity: 0.3058,
    price: 105.1238,
    quoteQuantity: 32.15,
    executedAt: day("2026-09-04") + 8.5 * 3_600_000,
    fromAsset: "USDC",
    fromAmount: 32.15,
    toAsset: "SOL",
    toAmount: 0.3058,
  },
];

describe("tradeLegs", () => {
  it("ignore une conversion entre deux formes de cash", () => {
    assert.deepEqual(tradeLegs(krakenEurToSol[0]), []);
  });

  it("voit l'achat d'une crypto payée en stablecoin", () => {
    const legs = tradeLegs(krakenEurToSol[1]);
    assert.equal(legs.length, 1);
    assert.equal(legs[0].asset, "SOL");
    assert.equal(legs[0].side, "BUY");
    assert.equal(legs[0].valueUsd, 32.15);
  });

  it("fait d'une conversion crypto contre crypto une cession et une acquisition", () => {
    const legs = tradeLegs({
      tradeType: "CONVERT",
      symbol: "SOLBTC",
      side: "SELL",
      quantity: 1,
      price: 0.0015,
      quoteQuantity: 0.0015,
      executedAt: 0,
      fromAsset: "SOL",
      fromAmount: 1,
      toAsset: "BTC",
      toAmount: 0.0015,
    });
    assert.deepEqual(
      legs.map((leg) => [leg.asset, leg.side]),
      [["SOL", "SELL"], ["BTC", "BUY"]]
    );
  });

  it("cède l'actif donné, pas l'actif reçu, quand la conversion est une vente", () => {
    const legs = tradeLegs({
      tradeType: "CONVERT",
      symbol: "SOLUSDC",
      side: "SELL",
      quantity: 1,
      price: 150,
      quoteQuantity: 150,
      executedAt: 0,
      fromAsset: "SOL",
      fromAmount: 1,
      toAsset: "USDC",
      toAmount: 150,
    });
    assert.deepEqual(legs.map((leg) => [leg.asset, leg.side, leg.valueUsd]), [["SOL", "SELL", 150]]);
  });
});

describe("mode de calcul", () => {
  it("un portefeuille qui n'a fait qu'acheter n'a rien cédé", () => {
    assert.equal(hasCryptoDisposal(krakenEurToSol), false);
    assert.deepEqual(acquiredCryptoAssets(krakenEurToSol), ["SOL"]);
  });
});

describe("buildTradeHistory", () => {
  it("ne réalise aucun gain en convertissant des euros", () => {
    const history = buildTradeHistory(krakenEurToSol);
    assert.equal(history.at(-1)!.realizedPnl, 0);
    assert.equal(history.at(-1)!.costBasis, 32.15);
    assert.equal(computeMonthlyFromTrades(history).get(2026)![8], 0);
  });

  it("réalise le gain sur la seule quantité dont le coût est connu", () => {
    const history = buildTradeHistory([
      { symbol: "SOLUSDC", side: "BUY", quantity: 1, price: 100, quoteQuantity: 100, executedAt: day("2026-01-02") },
      // 2 SOL vendus dont 1 reçu par transfert : seul le SOL acheté réalise.
      { symbol: "SOLUSDC", side: "SELL", quantity: 2, price: 150, quoteQuantity: 300, executedAt: day("2026-02-02") },
    ]);
    assert.equal(history.at(-1)!.realizedPnl, 50);
  });
});

describe("computeMonthlyFromSnapshots", () => {
  it("pondère un apport par les jours restants du mois", () => {
    // 100 $ investis le 4 septembre, valant 110 $ en fin de mois.
    const snaps = [
      { dayUtc: day("2026-09-04"), valueUsd: 100, netInvestedUsd: 100 },
      { dayUtc: day("2026-09-30"), valueUsd: 110, netInvestedUsd: 100 },
    ];
    const september = computeMonthlyFromSnapshots(snaps).get(2026)![8]!;
    // 10 $ gagnés sur 100 $ × 27/30 investis : +11,1 %, pas +20 %.
    assert.ok(Math.abs(september - 11.111) < 0.01, String(september));
  });

  it("valorise le SOL de Kraken au cours du marché", () => {
    const prices = {
      SOL: [
        { dayUtc: day("2026-09-04"), closeUsd: 105.1238 },
        { dayUtc: day("2026-09-30"), closeUsd: 115.636 },
      ],
    };
    const snaps = buildDcaSnapshots(krakenEurToSol, prices, undefined, day("2026-09-30"));
    assert.equal(snaps[0].netInvestedUsd, 32.15);
    const september = computeMonthlyFromSnapshots(snaps).get(2026)![8]!;
    // Le SOL a pris 10 % depuis l'achat : le mois affiche environ +11 %.
    assert.ok(september > 10 && september < 12, String(september));
  });
});

describe("change", () => {
  const eurPerUsd = () => 0.885; // 1 € ≈ 1,13 $

  it("valorise un achat payé en euros au change du jour", () => {
    const [leg] = tradeLegs(
      { symbol: "BTCEUR", side: "BUY", quantity: 0.001, price: 80_000, quoteQuantity: 80, executedAt: 0 },
      eurPerUsd
    );
    assert.ok(Math.abs(leg.valueUsd - 90.395) < 0.01, String(leg.valueUsd));
  });

  it("ne fait pas passer l'écart de change pour un gain", () => {
    // 80 € de BTC le 22 avril, au cours exact : le mois doit rester à ~0 %.
    const trades: SeasonalTrade[] = [
      { symbol: "BTCEUR", side: "BUY", quantity: 0.001, price: 80_000, quoteQuantity: 80, executedAt: day("2025-04-22") },
    ];
    const btcUsd = 80_000 / 0.885;
    const prices = { BTC: [{ dayUtc: day("2025-04-22"), closeUsd: btcUsd }] };
    const april = computeMonthlyFromSnapshots(
      buildDcaSnapshots(trades, prices, eurPerUsd, day("2025-04-30"))
    ).get(2025)![3]!;
    assert.ok(Math.abs(april) < 0.01, String(april));
  });
});

describe("agrégation", () => {
  it("compose les rendements au lieu de les additionner", () => {
    assert.ok(Math.abs(compoundReturns([10, 10])! - 21) < 1e-9);
    assert.equal(compoundReturns([null, null]), null);
  });

  it("compose chaque trimestre", () => {
    const monthly = new Map([[2026, [10, 10, null, null, null, null, null, null, null, null, null, -50]]]);
    const quarters = computeQuarterlyReturns(monthly).get(2026)!;
    assert.ok(Math.abs(quarters[0]! - 21) < 1e-9);
    assert.equal(quarters[1], null);
    assert.equal(quarters[3], -50);
  });
});
