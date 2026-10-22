import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildLedger, type LedgerInput, type LedgerTradeInput } from "./ledger";
import { computeCessionChain, summarizeByYear } from "./tax-chain";
import { ANNUAL_EXEMPTION_EUR, PFU_RATE } from "./tax";
import { createPriceBook, type PriceSeries } from "./valuation";
import { krakenInput } from "./test-fixtures";

const DAY_MS = 86_400_000;
const day = (index: number) => Date.UTC(2025, 0, 1) + index * DAY_MS;
const close = (actual: number, expected: number, epsilon = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≠ ${expected}`);

const empty: LedgerInput = { trades: [], deposits: [], withdrawals: [] };

/** Cours constants sur toute l'année 2025, en dollars. */
const constant = (prices: Record<string, number>): PriceSeries =>
  Object.fromEntries(
    Object.entries(prices).map(([asset, closeUsd]) => [
      asset,
      Array.from({ length: 365 }, (_, index) => ({ dayUtc: day(index), closeUsd })),
    ])
  );

/** Change fixe : 1 $ = 0,5 € rend les conversions évidentes à relire. */
const HALF = [{ dayUtc: day(0), eurPerUsd: 0.5 }];

const buy = (id: string, asset: string, quantity: number, eur: number, at: number, fee?: number): LedgerTradeInput => ({
  id,
  account: "exchange",
  symbol: `${asset}EUR`,
  side: "BUY",
  quantity,
  price: eur / quantity,
  quoteQuantity: eur,
  fee,
  feeAsset: fee ? "EUR" : undefined,
  executedAt: at,
});

const sell = (id: string, asset: string, quantity: number, eur: number, at: number, fee?: number): LedgerTradeInput => ({
  ...buy(id, asset, quantity, eur, at, fee),
  side: "SELL",
});

const chainOf = (input: LedgerInput, prices: PriceSeries, fx = HALF) =>
  computeCessionChain(buildLedger(input), createPriceBook({ prices, fx }));

describe("formule du 150 VH bis", () => {
  // Portefeuille : 1 BTC acheté 10 000 €, 1 ETH acheté 5 000 €.
  // Cours : BTC 80 000 $ = 40 000 €, ETH 20 000 $ = 10 000 €.
  const portfolio = [buy("b1", "BTC", 1, 10_000, day(0)), buy("e1", "ETH", 1, 5_000, day(1))];
  const prices = constant({ BTC: 80_000, ETH: 20_000 });

  it("impute le prix d'acquisition au prorata de la valeur globale", () => {
    const chain = chainOf({ ...empty, trades: [...portfolio, sell("s", "BTC", 0.5, 20_000, day(10))] }, prices);
    assert.equal(chain.cessions.length, 1);
    const [cession] = chain.cessions;
    // Valeur globale 50 000 €, prix total d'acquisition 15 000 €.
    close(cession.portfolioValueEur, 50_000);
    close(cession.costBasisEur, (15_000 * 20_000) / 50_000);
    close(cession.gainLossEur, 20_000 - 6_000);
    close(chain.acquisitionCostEur, 9_000);
  });

  it("enchaîne les cessions sur le prix d'acquisition résiduel", () => {
    const chain = chainOf(
      { ...empty, trades: [...portfolio, sell("s1", "BTC", 0.5, 20_000, day(10)), sell("s2", "ETH", 0.5, 5_000, day(20))] },
      prices
    );
    // Reste 9 000 € ; portefeuille 0,5 BTC (20 000 €) + 1 ETH (10 000 €).
    close(chain.cessions[1].portfolioValueEur, 30_000);
    close(chain.cessions[1].costBasisEur, (9_000 * 5_000) / 30_000);
    close(chain.acquisitionCostEur, 9_000 - 1_500);
  });

  it("valorise l'actif cédé à son prix de cession, pas au cours de clôture", () => {
    const chain = chainOf({ ...empty, trades: [...portfolio, sell("s", "BTC", 0.5, 30_000, day(10))] }, prices);
    // 1 BTC à 60 000 € + 1 ETH à 10 000 €.
    close(chain.cessions[0].portfolioValueEur, 70_000);
  });

  it("déduit les frais du prix de cession, mais pas du quotient", () => {
    const chain = chainOf({ ...empty, trades: [...portfolio, sell("s", "BTC", 0.5, 20_000, day(10), 100)] }, prices);
    const [cession] = chain.cessions;
    close(cession.feesEur, 100);
    // Quotient sur le prix brut (ligne 213), gain sur le prix net (ligne 218).
    close(cession.costBasisEur, 6_000);
    close(cession.gainLossEur, 20_000 - 100 - 6_000);
  });

  it("ajoute les frais d'acquisition au prix d'acquisition", () => {
    const chain = chainOf({ ...empty, trades: [buy("b", "BTC", 1, 10_000, day(0), 50)] }, prices);
    close(chain.acquisitionCostEur, 10_050);
  });
});

describe("devises", () => {
  it("retient les euros réellement versés, sans aller-retour par le dollar", () => {
    // Ancien défaut : 10 000 € lus comme 10 000 $, puis reconvertis à 0,5.
    const chain = chainOf({ ...empty, trades: [buy("b", "BTC", 1, 10_000, day(0))] }, constant({ BTC: 80_000 }));
    close(chain.acquisitionCostEur, 10_000);
  });

  it("convertit un achat en dollars au change du jour de l'achat", () => {
    const fx = [
      { dayUtc: day(0), eurPerUsd: 0.9 },
      { dayUtc: day(100), eurPerUsd: 0.8 },
    ];
    const chain = chainOf(
      {
        ...empty,
        trades: [
          { id: "b", account: "x", symbol: "BTCUSD", side: "BUY", quantity: 1, price: 50_000, quoteQuantity: 50_000, executedAt: day(1) },
          { id: "s", account: "x", symbol: "BTCUSD", side: "SELL", quantity: 1, price: 100_000, quoteQuantity: 100_000, executedAt: day(120) },
        ],
      },
      constant({ BTC: 100_000 }),
      fx
    );
    const [cession] = chain.cessions;
    // Acquisition au change de l'achat (0,9), cession au change de la vente (0,8).
    close(cession.proceedsEur, 80_000);
    close(cession.costBasisEur, 45_000);
    close(cession.gainLossEur, 35_000);
  });
});

describe("faits générateurs", () => {
  const prices = constant({ BTC: 80_000, ETH: 20_000 });

  it("n'impose pas un échange crypto contre crypto et ne touche pas au prix d'acquisition", () => {
    const chain = chainOf(
      {
        ...empty,
        trades: [
          buy("b", "BTC", 1, 10_000, day(0)),
          { id: "x", account: "exchange", symbol: "ETHBTC", side: "BUY", quantity: 2, price: 0.25, quoteQuantity: 0.5, executedAt: day(5) },
        ],
      },
      prices
    );
    assert.equal(chain.cessions.length, 0);
    // Ancien défaut : 10 000 − 5 000 + 20 000 = 25 000.
    close(chain.acquisitionCostEur, 10_000);
  });

  it("n'impose pas un passage en stablecoin, mais impose sa vente contre euros", () => {
    const chain = chainOf(
      {
        ...empty,
        trades: [
          buy("b", "BTC", 1, 10_000, day(0)),
          { id: "to-usdc", account: "exchange", symbol: "BTCUSDC", side: "SELL", quantity: 1, price: 80_000, quoteQuantity: 80_000, executedAt: day(5) },
          { id: "to-eur", account: "exchange", symbol: "USDCEUR", side: "SELL", quantity: 80_000, price: 0.5, quoteQuantity: 40_000, executedAt: day(6) },
        ],
      },
      prices
    );
    assert.equal(chain.cessions.length, 1);
    assert.equal(chain.cessions[0].asset, "USDC");
    close(chain.cessions[0].gainLossEur, 30_000);
  });

  it("impose une conversion vers l'euro, même appelée « conversion »", () => {
    // Ancien défaut : toute conversion était réputée non imposable.
    const chain = chainOf(
      {
        ...empty,
        trades: [
          buy("b", "BTC", 1, 10_000, day(0)),
          { id: "c", account: "exchange", tradeType: "CONVERT", symbol: "BTCEUR", side: "SELL", quantity: 1, price: 40_000, executedAt: day(5), fromAsset: "BTC", fromAmount: 1, toAsset: "EUR", toAmount: 40_000 },
        ],
      },
      prices
    );
    assert.equal(chain.cessions.length, 1);
    assert.equal(chain.cessions[0].source, "convert");
    close(chain.cessions[0].gainLossEur, 30_000);
  });

  it("ne crée aucune cession sur le compte Kraken, qui n'a fait qu'acheter", () => {
    const chain = computeCessionChain(buildLedger(krakenInput), createPriceBook({ prices: {}, fx: HALF }));
    assert.equal(chain.cessions.length, 0);
    // 28,34 € versés et 0,28 € de frais : le prix d'acquisition des USDC.
    close(chain.acquisitionCostEur, 28.62);
  });
});

describe("transferts", () => {
  const prices = constant({ BTC: 80_000, ETH: 20_000 });

  it("compte les wallets dans la valeur globale, et un transfert interne est neutre", () => {
    const chain = chainOf(
      {
        ...empty,
        trades: [buy("b", "BTC", 1, 10_000, day(0)), buy("e", "ETH", 1, 5_000, day(0)), sell("s", "ETH", 0.5, 5_000, day(30))],
        withdrawals: [{ id: "w", account: "exchange", asset: "BTC", amount: 1, fee: 0, timestamp: day(10) }],
        deposits: [{ id: "d", account: "ledger-wallet", asset: "BTC", amount: 1, timestamp: day(10) + 3_600_000 }],
      },
      prices
    );
    // Le BTC parti sur le wallet reste dans la valeur globale : 40 000 + 10 000.
    close(chain.cessions[0].portfolioValueEur, 50_000);
    assert.equal(chain.unknownCostInflows.length, 0);
    assert.equal(chain.untrackedOutflows.length, 0);
    close(chain.acquisitionCostEur, 15_000 - (15_000 * 5_000) / 50_000);
  });

  it("impose à coût nul des jetons venus d'un compte non suivi, et le signale", () => {
    // Ancien défaut : une vente de jetons reçus par transfert n'était pas imposée.
    const chain = chainOf(
      {
        ...empty,
        deposits: [{ id: "d", account: "exchange", asset: "BTC", amount: 1, timestamp: day(0) }],
        trades: [sell("s", "BTC", 1, 40_000, day(10))],
      },
      prices
    );
    assert.equal(chain.cessions.length, 1);
    close(chain.cessions[0].gainLossEur, 40_000);
    assert.equal(chain.unknownCostInflows[0].reason, "untracked-deposit");
  });

  it("impose à coût nul une vente sans achat dans l'historique, et la signale", () => {
    const chain = chainOf({ ...empty, trades: [sell("s", "ETH", 2, 20_000, day(10))] }, prices);
    assert.equal(chain.cessions.length, 1);
    close(chain.cessions[0].quantity, 2);
    assert.equal(chain.unknownCostInflows[0].reason, "missing-history");
  });

  it("ne laisse pas un compte céder les jetons d'un autre", () => {
    const chain = chainOf(
      {
        ...empty,
        trades: [
          { ...buy("b", "BTC", 1, 10_000, day(0)), account: "wallet-import" },
          { ...sell("s", "BTC", 1, 40_000, day(10)), account: "exchange" },
        ],
      },
      prices
    );
    assert.equal(chain.unknownCostInflows.length, 1);
    // Valeur globale : le BTC du wallet (40 000) et celui vendu (40 000).
    close(chain.cessions[0].portfolioValueEur, 80_000);
  });

  it("signale une sortie vers un compte non suivi", () => {
    const chain = chainOf(
      {
        ...empty,
        trades: [buy("b", "BTC", 1, 10_000, day(0))],
        withdrawals: [{ id: "w", account: "exchange", asset: "BTC", amount: 0.5, fee: 0, timestamp: day(5) }],
      },
      prices
    );
    assert.equal(chain.untrackedOutflows.length, 1);
    // Le prix d'acquisition n'est réduit que par une cession.
    close(chain.acquisitionCostEur, 10_000);
  });
});

describe("valorisation incomplète", () => {
  it("se replie sur le coût et le signale quand un cours manque", () => {
    const chain = chainOf(
      { ...empty, trades: [buy("b", "BTC", 1, 10_000, day(0)), buy("x", "XYZ", 100, 2_000, day(0)), sell("s", "BTC", 0.5, 20_000, day(10))] },
      constant({ BTC: 80_000 })
    );
    assert.equal(chain.hasIncompleteValuation, true);
    // 40 000 € de BTC au cours + 2 000 € de XYZ au coût.
    close(chain.cessions[0].portfolioValueEur, 42_000);
    close(chain.cessions[0].valuationCoverage, 40_000 / 42_000);
  });
});

describe("déclaration annuelle", () => {
  const base = (id: string, at: number, proceedsEur: number, gainLossEur: number) => ({
    date: at,
    asset: id,
    quantity: 1,
    proceedsEur,
    feesEur: 0,
    costBasisEur: proceedsEur - gainLossEur,
    gainLossEur,
    portfolioValueEur: 1,
    valuationCoverage: 1,
    eurPerUsd: 0.9,
    source: "trade" as const,
  });

  it("impute les moins-values sur les plus-values de la même année seulement", () => {
    const [y2025, y2026] = summarizeByYear(
      [base("a", day(10), 2_000, 1_000), base("b", day(20), 1_000, -400), base("c", day(400), 1_000, 300)],
      { threshold: ANNUAL_EXEMPTION_EUR, rate: PFU_RATE }
    );
    close(y2025.netGainLossEur, 600);
    close(y2025.estimatedTaxEur, 600 * PFU_RATE);
    close(y2026.netGainLossEur, 300);
  });

  it("exonère une année dont les cessions n'excèdent pas 305 €", () => {
    const [atThreshold] = summarizeByYear([base("a", day(10), 305, 200)], { threshold: ANNUAL_EXEMPTION_EUR, rate: PFU_RATE });
    assert.equal(atThreshold.isBelowThreshold, true);
    assert.equal(atThreshold.estimatedTaxEur, 0);
    const [above] = summarizeByYear([base("a", day(10), 305.01, 200)], { threshold: ANNUAL_EXEMPTION_EUR, rate: PFU_RATE });
    assert.equal(above.isBelowThreshold, false);
    close(above.estimatedTaxEur, 200 * PFU_RATE);
  });

  it("n'impose rien sur une année en moins-value nette", () => {
    const [year] = summarizeByYear([base("a", day(10), 5_000, -1_000)], { threshold: ANNUAL_EXEMPTION_EUR, rate: PFU_RATE });
    assert.equal(year.estimatedTaxEur, 0);
  });
});

describe("propriétés", () => {
  const random = (seed: number) => () => {
    seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return seed / 4_294_967_296;
  };

  it("la somme des prix imputés plus le prix restant égale le total versé", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const next = random(seed);
      const trades: LedgerTradeInput[] = [];
      let paid = 0;
      for (let i = 0; i < 30; i++) {
        const asset = next() < 0.5 ? "BTC" : "ETH";
        const amount = 100 + next() * 1_000;
        if (next() < 0.6) {
          trades.push(buy(`b${i}`, asset, amount / 1_000, amount, day(i)));
          paid += amount;
        } else {
          trades.push(sell(`s${i}`, asset, amount / 2_000, amount, day(i)));
        }
      }
      const chain = chainOf({ ...empty, trades }, constant({ BTC: 2_000, ETH: 2_000 }));
      const imputed = chain.cessions.reduce((sum, cession) => sum + cession.costBasisEur, 0);
      close(imputed + chain.acquisitionCostEur, paid, 1e-6);
      for (const cession of chain.cessions) {
        // Jamais plus de prix d'acquisition imputé que le prix de cession
        // ne le permet face à la valeur globale.
        assert.ok(cession.costBasisEur >= 0);
        assert.ok(cession.portfolioValueEur + 1e-9 >= cession.proceedsEur);
      }
    }
  });
});
