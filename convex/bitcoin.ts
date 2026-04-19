import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { decryptSecret } from "./utils/encryption";

const MEMPOOL_API_BASE = "https://mempool.space/api";
const SATS_PER_BTC = 100_000_000;
const PAGE_SIZE = 25;

interface MempoolVin {
  prevout?: {
    scriptpubkey_address?: string;
    value: number;
  };
}

interface MempoolVout {
  scriptpubkey_address?: string;
  value: number;
}

interface MempoolTx {
  txid: string;
  status: {
    confirmed: boolean;
    block_time?: number;
  };
  fee: number;
  vin: MempoolVin[];
  vout: MempoolVout[];
}

interface SyncCursor {
  lastTxId: string | null;
}

export const syncBitcoinWallet = action({
  args: {
    integrationId: v.id("integrations"),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.runQuery(api.integrations.getById, {
      integrationId: args.integrationId,
    });

    if (!integration) {
      throw new Error("Integration not found");
    }

    if (integration.provider !== "bitcoin") {
      throw new Error("Cette intégration n'est pas de type Bitcoin");
    }

    const walletAddress = decryptSecret(integration.encryptedCredentials.apiKey);
    if (!walletAddress) {
      throw new Error("Wallet address not found");
    }

    await ctx.runMutation(api.integrations.updateSyncStatus, {
      integrationId: args.integrationId,
      syncStatus: "syncing",
    });

    try {
      const dataset = "bitcoin_transactions";
      const scope = walletAddress;

      const state = await ctx.runQuery(api.integrations.getSyncState, {
        integrationId: args.integrationId,
        dataset,
        scope,
      });

      const previousCursor = (state?.cursor ?? null) as SyncCursor | null;
      let afterTxId: string | null = null;
      let newFirstTxId: string | null = previousCursor?.lastTxId ?? null;
      let hasMore = true;
      let isFirstPage = true;

      while (hasMore) {
        let url = `${MEMPOOL_API_BASE}/address/${walletAddress}/txs`;
        if (afterTxId) {
          url += `?after_txid=${afterTxId}`;
        }

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Mempool API error: ${response.statusText}`);
        }

        const txs = (await response.json()) as MempoolTx[];

        if (!Array.isArray(txs) || txs.length === 0) {
          hasMore = false;
          break;
        }

        if (isFirstPage) {
          newFirstTxId = txs[0].txid;
          isFirstPage = false;
        }

        let reachedKnown = false;

        for (const tx of txs) {
          if (previousCursor?.lastTxId && tx.txid === previousCursor.lastTxId) {
            reachedKnown = true;
            break;
          }

          if (!tx.status.confirmed || !tx.status.block_time) continue;

          const timestamp = tx.status.block_time * 1000;
          const feeBtc = tx.fee / SATS_PER_BTC;

          const isInput = tx.vin.some((vin) => vin.prevout?.scriptpubkey_address === walletAddress);

          let receivedSats = 0;
          let sentSats = 0;

          for (const vout of tx.vout) {
            if (vout.scriptpubkey_address === walletAddress) {
              receivedSats += vout.value;
            }
          }

          if (isInput) {
            for (const vin of tx.vin) {
              if (vin.prevout?.scriptpubkey_address === walletAddress) {
                sentSats += vin.prevout.value;
              }
            }
            const netSentSats = sentSats - receivedSats;
            if (netSentSats > 0) {
              const amountBtc = netSentSats / SATS_PER_BTC;
              await ctx.runMutation(api.kaspa.insertWithdrawal, {
                integrationId: args.integrationId,
                withdrawId: `${tx.txid}-btc-out`,
                coin: "BTC",
                amount: amountBtc,
                network: "bitcoin",
                status: "CONFIRMED",
                applyTime: timestamp,
                txId: tx.txid,
                fee: feeBtc,
              });
            }
          } else if (receivedSats > 0) {
            const amountBtc = receivedSats / SATS_PER_BTC;
            await ctx.runMutation(api.kaspa.insertDeposit, {
              integrationId: args.integrationId,
              depositId: `${tx.txid}-btc-in`,
              coin: "BTC",
              amount: amountBtc,
              network: "bitcoin",
              status: "CONFIRMED",
              insertTime: timestamp,
              txId: tx.txid,
            });
          }
        }

        if (reachedKnown || txs.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          afterTxId = txs[txs.length - 1].txid;
        }
      }

      await ctx.runMutation(api.integrations.updateSyncState, {
        integrationId: args.integrationId,
        dataset,
        scope,
        cursor: { lastTxId: newFirstTxId } as SyncCursor,
      });

      await ctx.runMutation(api.integrations.updateSyncStatus, {
        integrationId: args.integrationId,
        syncStatus: "synced",
      });
    } catch (error) {
      await ctx.runMutation(api.integrations.updateSyncStatus, {
        integrationId: args.integrationId,
        syncStatus: "error",
      });
      throw error;
    }
  },
});
