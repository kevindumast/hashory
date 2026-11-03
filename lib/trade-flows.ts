import { normalizeAsset, splitPair, type Amount } from "./ledger";

/** Échange tel que l'expose le tableau de bord. */
export type TradeLike = {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  quoteQuantity?: number;
  baseAsset?: string;
  fromAsset?: string;
  fromAmount?: number;
  toAsset?: string;
  toAmount?: number;
};

export type TradeFlows = {
  base: Amount;
  quote: Amount;
  /** Ce qui sort du compte. */
  given: Amount;
  /** Ce qui y entre. */
  received: Amount;
  /** Faux quand le symbole n'a pas pu être découpé : la cotation est inconnue. */
  pairKnown: boolean;
};

function hasRecordedAssets(tx: TradeLike): boolean {
  return !!tx.fromAsset && !!tx.toAsset && (tx.fromAmount ?? 0) > 0 && (tx.toAmount ?? 0) > 0;
}

/**
 * Ce qu'un échange donne et reçoit.
 *
 * Les actifs enregistrés par la plateforme priment sur le découpage du
 * symbole, ambigu pour USDTUSD (USDT·USD ou USD·TUSD) : un achat d'USDT par
 * carte s'affichait sinon comme une vente de TUSD contre des dollars.
 */
export function tradeFlows(tx: TradeLike): TradeFlows {
  if (hasRecordedAssets(tx)) {
    const given = { asset: normalizeAsset(tx.fromAsset!), quantity: tx.fromAmount! };
    const received = { asset: normalizeAsset(tx.toAsset!), quantity: tx.toAmount! };
    return tx.side === "BUY"
      ? { base: received, quote: given, given, received, pairKnown: true }
      : { base: given, quote: received, given, received, pairKnown: true };
  }

  const pair = splitPair(tx.symbol);
  const base = { asset: pair?.base ?? tx.baseAsset ?? tx.symbol.toUpperCase(), quantity: tx.quantity };
  const quote = { asset: pair?.quote ?? "?", quantity: tx.quoteQuantity ?? tx.price * tx.quantity };
  return tx.side === "BUY"
    ? { base, quote, given: quote, received: base, pairKnown: !!pair }
    : { base, quote, given: base, received: quote, pairKnown: !!pair };
}
