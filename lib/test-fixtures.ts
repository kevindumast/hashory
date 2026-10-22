/**
 * Jeux de données partagés par les tests de comptabilité. Hors du motif
 * `*.test.ts` : les importer n'exécute pas les tests d'un autre fichier.
 */

import type { LedgerInput } from "./ledger";

const t = (iso: string) => Date.parse(iso);

/** Les trois opérations Kraken réelles : 30 € déposés, EUR → USDC → SOL. */
export const krakenInput: LedgerInput = {
  withdrawals: [],
  deposits: [
    { id: "k-dep", account: "kraken", asset: "EUR", amount: 30, timestamp: t("2026-09-04T08:21:00Z"), status: "CONFIRMED" },
  ],
  trades: [
    {
      id: "k-1",
      account: "kraken",
      providerTradeId: "convert:A",
      tradeType: "CONVERT",
      symbol: "EURUSDC",
      side: "SELL",
      quantity: 28.34,
      price: 1.1457,
      quoteQuantity: 32.47,
      fee: 0.28,
      feeAsset: "EUR",
      executedAt: t("2026-09-04T08:22:00Z"),
      fromAsset: "EUR",
      fromAmount: 28.34,
      toAsset: "USDC",
      toAmount: 32.47,
    },
    {
      id: "k-2",
      account: "kraken",
      providerTradeId: "convert:B",
      tradeType: "CONVERT",
      symbol: "SOLUSDC",
      side: "BUY",
      quantity: 0.3058,
      price: 105.1238,
      quoteQuantity: 32.15,
      fee: 0.32,
      feeAsset: "USDC",
      executedAt: t("2026-09-04T08:26:00Z"),
      fromAsset: "USDC",
      fromAmount: 32.15,
      toAsset: "SOL",
      toAmount: 0.3058,
    },
  ],
};

