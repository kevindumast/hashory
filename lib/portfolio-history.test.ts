import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { balancesAt, buildLedger, type LedgerInput } from "./ledger";
import {
  buildPortfolioHistory,
  compoundReturns,
  monthlyReturns,
  quarterlyReturns,
  type HistoryPoint,
} from "./portfolio-history";
import { createPriceBook, impliedPrices } from "./valuation";
import { krakenInput } from "./test-fixtures";

const DAY_MS = 86_400_000;
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const close = (actual: number, expected: number, epsilon = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≠ ${expected}`);
const last = (points: HistoryPoint[]) => points[points.length - 1];

const empty: LedgerInput = { trades: [], deposits: [], withdrawals: [] };

/** Cours constant : aucune performance ne doit apparaître. */
const flat = (asset: string, price: number, from: string, to: string) => {
  const points = [];
  for (let d = day(from); d <= day(to); d += DAY_MS) points.push({ dayUtc: d, closeUsd: price });
  return { [asset]: points };
};

describe("performance du portefeuille", () => {
  it("ne compte pas un apport comme un gain", () => {
    const operations = buildLedger({
      ...empty,
      deposits: [
        { id: "d1", account: "a", asset: "USDC", amount: 1_000, timestamp: day("2025-01-01") },
        { id: "d2", account: "a", asset: "USDC", amount: 9_000, timestamp: day("2025-01-15") },
      ],
    });
    const history = buildPortfolioHistory(operations, createPriceBook({ prices: {}, fx: [] }), {
      todayUtc: day("2025-01-31"),
    });
    close(last(history.points).valueUsd, 10_000);
    close(last(history.points).netContributionsUsd, 10_000);
    close(last(history.points).twrIndex, 1);
  });

  it("ne compte pas un achat payé avec du cash déjà présent comme un apport", () => {
    const operations = buildLedger({
      ...empty,
      deposits: [{ id: "d", account: "a", asset: "USDT", amount: 1_000, timestamp: day("2025-01-01") }],
      trades: [{ id: "t", account: "a", symbol: "BTCUSDT", side: "BUY", quantity: 0.01, price: 100_000, quoteQuantity: 1_000, executedAt: day("2025-01-02") }],
    });
    const book = createPriceBook({ prices: flat("BTC", 100_000, "2025-01-01", "2025-01-10"), fx: [] });
    const history = buildPortfolioHistory(operations, book, { todayUtc: day("2025-01-10") });
    close(last(history.points).netContributionsUsd, 1_000);
    close(last(history.points).twrIndex, 1);
  });

  it("mesure la seule variation de marché", () => {
    const operations = buildLedger({
      ...empty,
      deposits: [{ id: "d", account: "a", asset: "USDT", amount: 1_000, timestamp: day("2025-01-01") }],
      trades: [{ id: "t", account: "a", symbol: "BTCUSDT", side: "BUY", quantity: 0.01, price: 100_000, quoteQuantity: 1_000, executedAt: day("2025-01-01") }],
    });
    const book = createPriceBook({
      prices: { BTC: [{ dayUtc: day("2025-01-01"), closeUsd: 100_000 }, { dayUtc: day("2025-01-05"), closeUsd: 120_000 }] },
      fx: [],
    });
    const history = buildPortfolioHistory(operations, book, { todayUtc: day("2025-01-10") });
    close(last(history.points).valueUsd, 1_200);
    close(last(history.points).twrIndex, 1.2);
  });

  it("neutralise un apport en cours de période : +20 % reste +20 %", () => {
    // 1 000 $ de BTC, puis 9 000 $ d'apport la veille d'une hausse de 20 %.
    // Le rendement pondéré par le temps vaut +20 %, pas « +2 000 $ sur 10 000 ».
    const operations = buildLedger({
      ...empty,
      deposits: [
        { id: "d1", account: "a", asset: "BTC", amount: 0.01, timestamp: day("2025-01-01") },
        { id: "d2", account: "a", asset: "BTC", amount: 0.09, timestamp: day("2025-01-04") },
      ],
    });
    const book = createPriceBook({
      prices: { BTC: [{ dayUtc: day("2025-01-01"), closeUsd: 100_000 }, { dayUtc: day("2025-01-05"), closeUsd: 120_000 }] },
      fx: [],
    });
    const history = buildPortfolioHistory(operations, book, { todayUtc: day("2025-01-06") });
    close(last(history.points).twrIndex, 1.2);
    close(last(history.points).netContributionsUsd, 10_000);
  });

  it("donne au compte Kraken sa vraie performance, frais compris", () => {
    const operations = buildLedger(krakenInput);
    const fx = [{ dayUtc: day("2026-09-01"), eurPerUsd: 1 / 1.1457 }];
    const book = createPriceBook({
      prices: {
        SOL: [
          { dayUtc: day("2026-09-04"), closeUsd: 32.15 / 0.3058 },
          { dayUtc: day("2026-09-30"), closeUsd: 118.12 },
        ],
      },
      fx,
      implied: impliedPrices(operations, fx),
    });
    const history = buildPortfolioHistory(operations, book, { account: "kraken", todayUtc: day("2026-09-30") });
    const end = last(history.points);

    // 30 € déposés, au change implicite de la conversion.
    close(end.netContributionsUsd, 30 * 1.1457, 1e-6);
    // Il reste 1,38 € et 0,3058 SOL.
    close(end.valueUsd, 1.38 * 1.1457 + 0.3058 * 118.12, 1e-6);
    // Le rendement porte le gain du SOL et la perte des frais (0,28 € + 0,32 USDC).
    const expected = end.valueUsd / end.netContributionsUsd;
    close(end.twrIndex, expected, 1e-6);

    const september = monthlyReturns(history.points).get(2026)![8]!;
    close(september, (expected - 1) * 100, 1e-6);
    // Loin des +101 % que produisait l'ancien calcul.
    assert.ok(september > 0 && september < 15, String(september));
  });

  it("ne voit pas d'apport dans un transfert entre deux comptes suivis", () => {
    const operations = buildLedger({
      ...empty,
      deposits: [
        { id: "buy", account: "binance", asset: "BTC", amount: 1, timestamp: day("2025-01-01") },
        // Arrivée sur le wallet le 1er février, retrait parti le 31 janvier.
        { id: "in", account: "wallet", asset: "BTC", amount: 0.9995, timestamp: day("2025-02-01") + 3_600_000 },
      ],
      withdrawals: [
        { id: "out", account: "binance", asset: "BTC", amount: 0.9995, fee: 0.0005, timestamp: day("2025-01-31") + 23 * 3_600_000 },
      ],
    });
    const book = createPriceBook({ prices: flat("BTC", 100_000, "2025-01-01", "2025-02-28"), fx: [] });
    const history = buildPortfolioHistory(operations, book, { todayUtc: day("2025-02-28") });

    // Un seul apport : le BTC du départ (le premier dépôt n'est pas apparié).
    close(last(history.points).netContributionsUsd, 100_000);
    // Les jetons en transit ne disparaissent pas : pas de fausse chute fin
    // janvier suivie d'une fausse hausse en février.
    const months = monthlyReturns(history.points).get(2025)!;
    close(months[0]!, -0.05, 1e-6); // seuls les frais réseau : 0,0005 BTC
    close(months[1]!, 0, 1e-9);
  });

  it("compte le transfert comme un flux pour un compte pris seul", () => {
    const operations = buildLedger({
      ...empty,
      deposits: [
        { id: "buy", account: "binance", asset: "BTC", amount: 1, timestamp: day("2025-01-01") },
        { id: "in", account: "wallet", asset: "BTC", amount: 1, timestamp: day("2025-01-10") },
      ],
      withdrawals: [{ id: "out", account: "binance", asset: "BTC", amount: 1, fee: 0, timestamp: day("2025-01-10") }],
    });
    const book = createPriceBook({ prices: flat("BTC", 100_000, "2025-01-01", "2025-01-20"), fx: [] });
    const wallet = buildPortfolioHistory(operations, book, { account: "wallet", todayUtc: day("2025-01-20") });
    close(last(wallet.points).netContributionsUsd, 100_000);
    close(last(wallet.points).twrIndex, 1);
    const binance = buildPortfolioHistory(operations, book, { account: "binance", todayUtc: day("2025-01-20") });
    close(last(binance.points).netContributionsUsd, 0);
    close(last(binance.points).valueUsd, 0);
  });

  it("ne fait pas d'une vente de jetons sans historique un gain pur", () => {
    // 1 ETH vendu sans achat connu : il est réputé apporté au cours du jour.
    const operations = buildLedger({
      ...empty,
      trades: [{ id: "s", account: "a", symbol: "ETHUSDC", side: "SELL", quantity: 1, price: 3_000, quoteQuantity: 3_000, executedAt: day("2025-01-05") }],
    });
    const book = createPriceBook({ prices: flat("ETH", 3_000, "2025-01-01", "2025-01-10"), fx: [] });
    const history = buildPortfolioHistory(operations, book, { todayUtc: day("2025-01-10") });
    close(history.implicitInflowsUsd, 3_000);
    close(last(history.points).twrIndex, 1);
  });

  it("tient les positions Kraken au prix payé, frais en perte réalisée", () => {
    const operations = buildLedger(krakenInput);
    const fx = [{ dayUtc: day("2026-09-01"), eurPerUsd: 1 / 1.1457 }];
    const book = createPriceBook({ prices: {}, fx, implied: impliedPrices(operations, fx) });
    const history = buildPortfolioHistory(operations, book, { todayUtc: day("2026-09-10") });
    const sol = history.positions.find((position) => position.asset === "SOL")!;
    close(sol.quantity, 0.3058);
    // Le SOL coûte ce qu'ont coûté les USDC cédés : 32,15 $.
    close(sol.costUsd, 32.15, 1e-6);
    // Les frais sont une perte réalisée : 0,28 € et 0,32 USDC. Reste un
    // micro-gain de change : 28,34 € font 32,4691 $, pas tout à fait les
    // 32,47 USDC reçus.
    const realized = history.positions.reduce((sum, position) => sum + position.realizedUsd, 0);
    close(realized, -(0.28 * 1.1457 + 0.32), 0.002);
  });

  it("transmet le coût d'un actif à travers un transfert interne", () => {
    const operations = buildLedger({
      ...empty,
      deposits: [
        { id: "usdt", account: "binance", asset: "USDT", amount: 50_000, timestamp: day("2025-01-01") },
        { id: "in", account: "wallet", asset: "BTC", amount: 0.999, timestamp: day("2025-01-10") },
      ],
      trades: [{ id: "buy", account: "binance", symbol: "BTCUSDT", side: "BUY", quantity: 1, price: 50_000, quoteQuantity: 50_000, executedAt: day("2025-01-02") }],
      withdrawals: [{ id: "out", account: "binance", asset: "BTC", amount: 0.999, fee: 0.001, timestamp: day("2025-01-10") }],
    });
    const book = createPriceBook({ prices: flat("BTC", 50_000, "2025-01-01", "2025-01-20"), fx: [] });
    const history = buildPortfolioHistory(operations, book, { todayUtc: day("2025-01-20") });
    const btc = history.positions.find((position) => position.asset === "BTC")!;
    close(btc.quantity, 0.999);
    close(btc.costUsd, 0.999 * 50_000, 1e-6);
    // Seuls les frais réseau sont perdus.
    close(btc.realizedUsd, -0.001 * 50_000, 1e-6);
  });

  it("garde l'historique cohérent avec les soldes du grand livre", () => {
    const operations = buildLedger(krakenInput);
    const balances = balancesAt(operations).get("kraken")!;
    const book = createPriceBook({ prices: { SOL: [{ dayUtc: day("2026-09-01"), closeUsd: 100 }] }, fx: [{ dayUtc: day("2026-09-01"), eurPerUsd: 0.5 }] });
    const history = buildPortfolioHistory(operations, book, { todayUtc: day("2026-09-10") });
    // Valeur = soldes du livre × cours : 1,38 € à 2 $ + 0,3058 SOL à 100 $.
    close(last(history.points).valueUsd, balances.get("EUR")! * 2 + balances.get("SOL")! * 100, 1e-9);
  });
});

describe("propriétés, sur des historiques aléatoires", () => {
  /** Générateur pseudo-aléatoire reproductible. */
  const random = (seed: number) => () => {
    seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return seed / 4_294_967_296;
  };

  const scenario = (seed: number) => {
    const next = random(seed);
    const accounts = ["a", "b", "c"];
    const assets = ["BTC", "ETH", "SOL"];
    const input: LedgerInput = { trades: [], deposits: [], withdrawals: [] };
    const start = day("2025-01-01");
    for (let i = 0; i < 60; i++) {
      const timestamp = start + Math.floor(next() * 120) * DAY_MS + Math.floor(next() * DAY_MS);
      const account = accounts[Math.floor(next() * accounts.length)];
      const asset = assets[Math.floor(next() * assets.length)];
      const roll = next();
      if (roll < 0.3) {
        input.deposits.push({ id: `d${i}`, account, asset: next() < 0.5 ? "USDC" : asset, amount: 1 + next() * 10, timestamp });
      } else if (roll < 0.45) {
        input.withdrawals.push({ id: `w${i}`, account, asset, amount: next() * 2, fee: 0, timestamp });
      } else {
        const side = next() < 0.5 ? "BUY" : "SELL";
        const quantity = next() * 3;
        input.trades.push({ id: `t${i}`, account, symbol: `${asset}USDC`, side, quantity, price: 100, quoteQuantity: quantity * 100, executedAt: timestamp });
      }
    }
    return input;
  };

  const constantPrices = {
    ...flat("BTC", 100, "2025-01-01", "2025-06-30"),
    ...flat("ETH", 100, "2025-01-01", "2025-06-30"),
    ...flat("SOL", 100, "2025-01-01", "2025-06-30"),
  };

  it("à cours constants et sans frais, l'indice reste à 1 quels que soient les flux", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const operations = buildLedger(scenario(seed));
      const book = createPriceBook({ prices: constantPrices, fx: [] });
      for (const account of [undefined, "a", "b", "c"]) {
        const history = buildPortfolioHistory(operations, book, { account, todayUtc: day("2025-06-30") });
        for (const point of history.points) {
          close(point.twrIndex, 1, 1e-9);
        }
      }
    }
  });

  it("à cours constants, la valeur égale toujours les apports nets", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const operations = buildLedger(scenario(seed));
      const book = createPriceBook({ prices: constantPrices, fx: [] });
      const history = buildPortfolioHistory(operations, book, { todayUtc: day("2025-06-30") });
      for (const point of history.points) {
        close(point.valueUsd, point.netContributionsUsd, 1e-6);
      }
    }
  });

  it("aucun mois ne perd plus de 100 %, même sur un marché chahuté", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const next = random(seed * 7);
      const volatile: Record<string, { dayUtc: number; closeUsd: number }[]> = {};
      for (const asset of ["BTC", "ETH", "SOL"]) {
        let price = 100;
        volatile[asset] = [];
        for (let d = day("2025-01-01"); d <= day("2025-06-30"); d += DAY_MS) {
          price = Math.max(0.01, price * (0.7 + next() * 0.6));
          volatile[asset].push({ dayUtc: d, closeUsd: price });
        }
      }
      const operations = buildLedger(scenario(seed));
      const history = buildPortfolioHistory(operations, createPriceBook({ prices: volatile, fx: [] }), {
        todayUtc: day("2025-06-30"),
      });
      for (const months of monthlyReturns(history.points).values()) {
        for (const value of months) if (value !== null) assert.ok(value >= -100, String(value));
      }
    }
  });

  it("réalisé + latent = valeur − apports nets, chaque jour, sur tout marché", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const next = random(seed * 13);
      const volatile: Record<string, { dayUtc: number; closeUsd: number }[]> = {};
      for (const asset of ["BTC", "ETH", "SOL"]) {
        let price = 100;
        volatile[asset] = [];
        for (let d = day("2025-01-01"); d <= day("2025-06-30"); d += DAY_MS) {
          price = Math.max(0.01, price * (0.8 + next() * 0.4));
          volatile[asset].push({ dayUtc: d, closeUsd: price });
        }
      }
      const operations = buildLedger(scenario(seed));
      const book = createPriceBook({ prices: volatile, fx: [] });
      for (const account of [undefined, "a"]) {
        const history = buildPortfolioHistory(operations, book, { account, todayUtc: day("2025-06-30") });
        for (const point of history.points) {
          const unrealized = point.valueUsd - point.costBasisUsd;
          close(point.realizedPnlUsd + unrealized, point.valueUsd - point.netContributionsUsd, 1e-6);
        }
      }
    }
  });

  it("le total des comptes pris un à un égale le portefeuille entier", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const operations = buildLedger(scenario(seed));
      const book = createPriceBook({ prices: constantPrices, fx: [] });
      const whole = last(buildPortfolioHistory(operations, book, { todayUtc: day("2025-06-30") }).points);
      const sum = ["a", "b", "c"]
        .map((account) => buildPortfolioHistory(operations, book, { account, todayUtc: day("2025-06-30") }).points)
        .filter((points) => points.length > 0)
        .reduce((total, points) => total + last(points).valueUsd, 0);
      close(whole.valueUsd, sum, 1e-6);
    }
  });
});

describe("agrégation des rendements", () => {
  it("lit chaque mois sur l'indice de clôture", () => {
    const points = [
      { dayUtc: day("2025-01-15"), twrIndex: 1 },
      { dayUtc: day("2025-01-31"), twrIndex: 1.1 },
      { dayUtc: day("2025-02-28"), twrIndex: 0.99 },
    ];
    const year = monthlyReturns(points).get(2025)!;
    close(year[0]!, 10);
    close(year[1]!, -10);
    assert.equal(year[2], null);
  });

  it("compose les rendements au lieu de les additionner", () => {
    close(compoundReturns([10, 10])!, 21);
    assert.equal(compoundReturns([null]), null);
    const quarters = quarterlyReturns(new Map([[2025, [10, 10, null, null, null, null, null, null, null, null, null, -50]]])).get(2025)!;
    close(quarters[0]!, 21);
    assert.equal(quarters[1], null);
    close(quarters[3]!, -50);
  });
});
