/**
 * Prix de revient moyen et résultat réalisé.
 *
 * Le principe tient en une phrase : **un transfert n'est ni un achat ni une
 * vente**. Déplacer des jetons d'un exchange vers un wallet ne change ni ce
 * qu'ils ont coûté, ni ce qu'ils ont rapporté — seulement l'endroit où ils
 * se trouvent.
 *
 * La quantité détenue et la quantité achetée sont donc suivies séparément.
 * Les confondre revient à faire pondérer un achat par des jetons au coût
 * inconnu, ce qui dilue le prix de revient : un actif reçu par transfert
 * puis renforcé affichait un prix d'achat très inférieur à la réalité.
 */

export type CostBasisEvent = {
  type: "BUY" | "SELL" | "DEPOSIT" | "WITHDRAWAL";
  /** Quantité de l'actif concerné, toujours positive. */
  quantity: number;
  /** Contre-valeur en dollars de l'opération, si connue. */
  valueUsd?: number;
  /** Cours unitaire, utilisé à défaut de contre-valeur. */
  price?: number;
  fee?: number;
  feeAsset?: string;
};

export type CostBasis = {
  /** Prix de revient moyen des seules quantités achetées. */
  avgCostBasis: number;
  /** Résultat déjà encaissé, calculé au prix de revient moyen. */
  realizedPnlAvco: number;
  /** Quantité détenue, transferts compris. */
  holdingQuantity: number;
  /** Quantité encore détenue provenant d'un achat identifié. */
  purchasedQuantity: number;
};

/**
 * Déroule les mouvements d'un actif et en tire son prix de revient.
 *
 * Les événements doivent être triés par date croissante : le prix de revient
 * moyen dépend de l'ordre dans lequel achats et ventes se succèdent.
 *
 * Une vente portant sur des jetons dont l'origine est inconnue — reçus par
 * transfert, jamais achetés — est comptée à un prix de revient nul. C'est le
 * choix prudent : il majore le gain réalisé plutôt que de l'inventer.
 */
export function computeCostBasis(events: CostBasisEvent[], baseSymbol: string): CostBasis {
  const upperSymbol = baseSymbol.toUpperCase();

  // Ce qui est détenu, transferts compris.
  let holdingQuantity = 0;
  // Ce qui provient d'un achat, et ce que ces achats ont coûté.
  let purchasedQuantity = 0;
  let purchasedCost = 0;
  let realizedPnl = 0;

  for (const event of events) {
    // Des frais prélevés dans l'actif lui-même réduisent la quantité reçue.
    const feeInBase =
      event.fee && event.feeAsset?.toUpperCase() === upperSymbol ? event.fee : 0;

    if (event.type === "BUY") {
      const received = event.quantity - feeInBase;
      if (received <= 0) continue;

      holdingQuantity += received;
      purchasedQuantity += received;
      purchasedCost += event.valueUsd ?? received * (event.price ?? 0);
      continue;
    }

    if (event.type === "SELL") {
      const average = purchasedQuantity > 0 ? purchasedCost / purchasedQuantity : 0;
      const proceeds = event.valueUsd ?? event.quantity * (event.price ?? average);

      // Seule la part réellement achetée porte un coût : au-delà, les jetons
      // vendus proviennent d'un transfert et leur origine nous échappe.
      const soldFromPurchases = Math.min(event.quantity, purchasedQuantity);
      realizedPnl += proceeds - soldFromPurchases * average;

      purchasedQuantity -= soldFromPurchases;
      purchasedCost = Math.max(0, purchasedCost - soldFromPurchases * average);
      holdingQuantity = Math.max(0, holdingQuantity - event.quantity - feeInBase);
      continue;
    }

    // Transferts : ils déplacent des jetons sans rien coûter ni rapporter.
    if (event.type === "DEPOSIT") {
      holdingQuantity += event.quantity;
    } else if (event.type === "WITHDRAWAL") {
      holdingQuantity = Math.max(0, holdingQuantity - event.quantity);
    }
  }

  return {
    avgCostBasis: purchasedQuantity > 0 ? purchasedCost / purchasedQuantity : 0,
    realizedPnlAvco: realizedPnl,
    holdingQuantity,
    purchasedQuantity,
  };
}
