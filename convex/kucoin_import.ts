import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUserId } from "./auth";
import { encryptSecret } from "./utils/encryption";
import {
  IMPORTED_DEPOSIT_PREFIX,
  IMPORTED_WITHDRAWAL_PREFIX,
  convertKey,
  planKucoinImport,
} from "../lib/kucoin-import-plan";

const spotTradeSchema = v.object({
  orderId: v.string(),
  symbol: v.string(),
  side: v.union(v.literal("BUY"), v.literal("SELL")),
  avgFilledPrice: v.number(),
  filledAmount: v.number(),
  filledVolume: v.number(),
  fee: v.number(),
  feeAsset: v.string(),
  executedAt: v.number(),
});

const convertSchema = v.object({
  sellAsset: v.string(),
  sellAmount: v.number(),
  buyAsset: v.string(),
  buyAmount: v.number(),
  symbol: v.string(),
  side: v.union(v.literal("BUY"), v.literal("SELL")),
  executedAt: v.number(),
});

const transferSchema = v.object({
  hash: v.string(),
  coin: v.string(),
  amount: v.number(),
  fee: v.number(),
  address: v.string(),
  network: v.string(),
  executedAt: v.number(),
});

const cardPurchaseSchema = v.object({
  coin: v.string(),
  amount: v.number(),
  channel: v.string(),
  executedAt: v.number(),
  fiat: v.optional(v.object({ currency: v.string(), amount: v.number(), fee: v.number() })),
});

const CARD_PREFIX = "kucoin-card:";

/** Bien au-delà d'un historique personnel : une borne contre les envois abusifs. */
const MAX_ROWS = 5_000;

/**
 * Importe les exports KuCoin d'un compte. Idempotent : un deuxième import
 * des mêmes fichiers n'écrit rien. Le plan (`lib/kucoin-import-plan`)
 * décide de tout ; cette mutation lit les quatre tables du compte une fois,
 * par index, puis applique le plan.
 *
 * Sans `integrationId` — ajout d'un compte KuCoin « par fichiers », sans clé
 * API —, le compte KuCoin existant est repris s'il y en a un : en créer un
 * second compterait chaque mouvement deux fois. Sinon il est créé en mode
 * fichier, sans identifiants.
 */
export const ingestXlsx = mutation({
  args: {
    integrationId: v.optional(v.id("integrations")),
    displayName: v.optional(v.string()),
    spotTrades: v.array(spotTradeSchema),
    converts: v.array(convertSchema),
    deposits: v.array(transferSchema),
    withdrawals: v.array(transferSchema),
    cardPurchases: v.array(cardPurchaseSchema),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();

    const total =
      args.spotTrades.length + args.converts.length + args.deposits.length + args.withdrawals.length + args.cardPurchases.length;
    if (total > MAX_ROWS) {
      throw new Error("Trop de lignes pour un seul import.");
    }

    let target = args.integrationId;
    let createdAccount = false;
    if (target) {
      const integration = await ctx.db.get(target);
      if (!integration || integration.clerkUserId !== userId) {
        throw new Error("Intégration introuvable.");
      }
      if (integration.provider !== "kucoin") {
        throw new Error("Cette intégration n'est pas de type KuCoin.");
      }
    } else {
      const existing = await ctx.db
        .query("integrations")
        .withIndex("by_user_provider", (q) => q.eq("clerkUserId", userId).eq("provider", "kucoin"))
        .first();
      if (existing) {
        target = existing._id;
      } else {
        target = await ctx.db.insert("integrations", {
          clerkUserId: userId,
          provider: "kucoin",
          displayName: args.displayName?.trim().slice(0, 80) || "KuCoin",
          readOnly: true,
          encryptedCredentials: { apiKey: encryptSecret(""), apiSecret: encryptSecret("") },
          scopes: ["read"],
          source: "file",
          syncStatus: "synced",
          createdAt: now,
          updatedAt: now,
        });
        createdAccount = true;
      }
    }
    const integrationId = target;

    const [trades, converts, deposits, withdrawals] = await Promise.all([
      ctx.db.query("trades").withIndex("by_integration", (q) => q.eq("integrationId", integrationId)).collect(),
      ctx.db.query("convertTrades").withIndex("by_integration", (q) => q.eq("integrationId", integrationId)).collect(),
      ctx.db.query("deposits").withIndex("by_integration", (q) => q.eq("integrationId", integrationId)).collect(),
      ctx.db.query("withdrawals").withIndex("by_integration", (q) => q.eq("integrationId", integrationId)).collect(),
    ]);

    const plan = planKucoinImport(
      {
        tradeIds: trades.map((t) => t.providerTradeId),
        orderIds: trades.flatMap((t) => (t.providerOrderId ? [t.providerOrderId] : [])),
        converts: converts.map((c) => ({
          providerTradeId: c.providerTradeId,
          fromAsset: c.fromAsset,
          fromAmount: c.fromAmount,
          executedAt: c.executedAt,
        })),
        deposits: deposits.map((d) => ({
          id: d._id,
          key: d.depositId,
          txId: d.txId,
          coin: d.coin,
          amount: d.amount,
          time: d.insertTime,
        })),
        withdrawals: withdrawals.map((w) => ({
          id: w._id,
          key: w.withdrawId,
          txId: w.txId,
          coin: w.coin,
          amount: w.amount,
          fee: w.fee,
          time: w.applyTime,
        })),
        cardPurchases: [
          ...trades
            .filter((t) => t.providerTradeId.startsWith(CARD_PREFIX))
            .map((t) => ({
              id: String(t._id),
              key: t.providerTradeId,
              table: "trades" as const,
              coin: t.toAsset ?? "",
              amount: t.toAmount ?? t.quantity,
              time: t.executedAt,
              // Les premiers imports estimaient tout en dollars, sans le dire.
              priced: (t.raw as { priced?: boolean } | undefined)?.priced ?? t.fromAsset !== "USD",
            })),
          ...deposits
            .filter((d) => d.depositId.startsWith(CARD_PREFIX))
            .map((d) => ({
              id: String(d._id),
              key: d.depositId,
              table: "deposits" as const,
              coin: d.coin,
              amount: d.amount,
              time: d.insertTime,
              priced: false,
            })),
        ],
      },
      args
    );

    // Les identifiants à effacer viennent des lignes lues ci-dessus : rien
    // hors de ce compte ne peut être touché.
    const tradeDocIds = new Map(trades.map((t) => [String(t._id), t._id]));
    for (const id of plan.deleteTradeIds) {
      const docId = tradeDocIds.get(id);
      if (docId) await ctx.db.delete(docId);
    }
    const depositIds = new Map(deposits.map((d) => [String(d._id), d._id]));
    const withdrawalIds = new Map(withdrawals.map((w) => [String(w._id), w._id]));
    for (const id of plan.deleteDepositIds) {
      const docId = depositIds.get(id);
      if (docId) await ctx.db.delete(docId);
    }
    for (const id of plan.deleteWithdrawalIds) {
      const docId = withdrawalIds.get(id);
      if (docId) await ctx.db.delete(docId);
    }

    // Conversions importées à l'heure de leur mise à jour : ramenées à
    // l'heure réelle, sous le même identifiant.
    for (const { providerTradeId, executedAt } of plan.retimedConverts) {
      for (const doc of [...trades, ...converts]) {
        if (doc.providerTradeId === providerTradeId) await ctx.db.patch(doc._id, { executedAt });
      }
    }

    for (const trade of plan.spotTrades) {
      await ctx.db.insert("trades", {
        integrationId,
        providerTradeId: `kucoin-order:${trade.orderId}`,
        providerOrderId: trade.orderId,
        tradeType: "SPOT",
        symbol: trade.symbol,
        side: trade.side,
        quantity: trade.filledAmount,
        price: trade.avgFilledPrice,
        quoteQuantity: trade.filledVolume,
        fee: trade.fee > 0 ? trade.fee : undefined,
        feeAsset: trade.feeAsset || undefined,
        isMaker: false,
        executedAt: trade.executedAt,
        createdAt: now,
      });
    }

    for (const convert of plan.converts) {
      const providerTradeId = convertKey(convert);
      const quantity = convert.side === "BUY" ? convert.buyAmount : convert.sellAmount;
      const quoteQuantity = convert.side === "BUY" ? convert.sellAmount : convert.buyAmount;
      const price = quantity > 0 ? quoteQuantity / quantity : 0;
      await ctx.db.insert("trades", {
        integrationId,
        providerTradeId,
        tradeType: "CONVERT",
        symbol: convert.symbol,
        side: convert.side,
        quantity,
        price,
        quoteQuantity,
        isMaker: false,
        executedAt: convert.executedAt,
        fromAsset: convert.sellAsset,
        fromAmount: convert.sellAmount,
        toAsset: convert.buyAsset,
        toAmount: convert.buyAmount,
        createdAt: now,
      });
      await ctx.db.insert("convertTrades", {
        integrationId,
        providerTradeId,
        orderStatus: "SUCCESS",
        fromAsset: convert.sellAsset,
        fromAmount: convert.sellAmount,
        toAsset: convert.buyAsset,
        toAmount: convert.buyAmount,
        price,
        inversePrice: quoteQuantity > 0 ? quantity / quoteQuantity : undefined,
        executedAt: convert.executedAt,
        createdAt: now,
      });
    }

    for (const deposit of plan.deposits) {
      await ctx.db.insert("deposits", {
        integrationId,
        depositId: `${IMPORTED_DEPOSIT_PREFIX}${deposit.hash}`,
        txId: deposit.hash,
        coin: deposit.coin,
        amount: deposit.amount,
        network: deposit.network || undefined,
        status: "SUCCESS",
        address: deposit.address || undefined,
        insertTime: deposit.executedAt,
        createdAt: now,
      });
    }

    for (const withdrawal of plan.withdrawals) {
      await ctx.db.insert("withdrawals", {
        integrationId,
        withdrawId: `${IMPORTED_WITHDRAWAL_PREFIX}${withdrawal.hash}`,
        txId: withdrawal.hash,
        coin: withdrawal.coin,
        amount: withdrawal.amount,
        fee: withdrawal.fee,
        network: withdrawal.network || undefined,
        address: withdrawal.address || undefined,
        status: "SUCCESS",
        applyTime: withdrawal.executedAt,
        createdAt: now,
      });
    }

    // Achat par carte, enregistré comme une acquisition contre fiat. Le
    // montant est celui débité, frais compris (export « Fast Trade ») ; à
    // défaut, pour un stablecoin, un dollar par jeton, converti en euros au
    // cours du jour par le calcul fiscal — sans les frais, inconnus : le
    // choix prudent. Un import ultérieur de l'export « Fast Trade » remplace
    // l'estimation par le vrai prix.
    for (const purchase of plan.cardTrades) {
      const { paid } = purchase;
      await ctx.db.insert("trades", {
        integrationId,
        providerTradeId: purchase.id,
        tradeType: "FIAT",
        symbol: `${purchase.coin}${paid.currency}`,
        side: "BUY",
        quantity: purchase.amount,
        price: paid.amount / purchase.amount,
        quoteQuantity: paid.amount,
        fee: paid.fee > 0 ? paid.fee : undefined,
        feeAsset: paid.fee > 0 ? paid.currency : undefined,
        isMaker: false,
        executedAt: purchase.executedAt,
        fromAsset: paid.currency,
        fromAmount: paid.amount,
        toAsset: purchase.coin,
        toAmount: purchase.amount,
        raw: { source: "kucoin-card", channel: purchase.channel, priced: !purchase.estimated },
        createdAt: now,
      });
    }

    // Autres jetons achetés par carte : le prix payé est inconnu. Enregistrés
    // comme une entrée, ce que le calcul fiscal signale « coût inconnu ».
    for (const purchase of plan.cardDeposits) {
      await ctx.db.insert("deposits", {
        integrationId,
        depositId: purchase.id,
        coin: purchase.coin,
        amount: purchase.amount,
        network: "CARD",
        status: "SUCCESS",
        insertTime: purchase.executedAt,
        raw: { source: "kucoin-card", channel: purchase.channel },
        createdAt: now,
      });
    }

    // Dépôts « coût inconnu » remplacés par leur achat au vrai prix : ni
    // des doublons retirés, ni de nouveaux achats.
    const replacedCards = plan.deleteDepositIds.filter((id) =>
      deposits.some((d) => String(d._id) === id && d.depositId.startsWith(CARD_PREFIX))
    ).length;

    // `updatedAt` signale aux pages que les positions sont à recalculer.
    const integration = await ctx.db.get(integrationId);
    if (integration?.source === "file") {
      await ctx.db.patch(integrationId, { lastSyncedAt: now, syncStatus: "synced", updatedAt: now });
    } else {
      await ctx.db.patch(integrationId, { updatedAt: now });
    }

    return {
      integrationId,
      createdAccount,
      spotInserted: plan.spotTrades.length,
      convertsInserted: plan.converts.length,
      convertsRetimed: plan.retimedConverts.length,
      depositsInserted: plan.deposits.length,
      withdrawalsInserted: plan.withdrawals.length,
      cardPurchasesInserted: plan.cardTrades.length + plan.cardDeposits.length - plan.deleteTradeIds.length - replacedCards,
      cardPurchasesRepriced: plan.deleteTradeIds.length + replacedCards,
      duplicatesRemoved: plan.deleteDepositIds.length - replacedCards + plan.deleteWithdrawalIds.length,
    };
  },
});
