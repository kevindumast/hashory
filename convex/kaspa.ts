import { action, mutation } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { decryptSecret } from "./utils/encryption";

const KASPA_API_BASE = "https://api.kaspa.org";
const SOMPI_PER_KAS = 100_000_000;
const BATCH_SIZE = 500;

interface KaspaTransaction {
  transaction_id: string;
  block_time: number;
  is_accepted: boolean;
  inputs: Array<{
    script_public_key_address?: string;
  }>;
  outputs: Array<{
    script_public_key_address?: string;
    amount: string;
  }>;
}

interface SyncCursor {
  lastBlockTime: number;
}

export const insertDeposit = mutation({
  args: {
    integrationId: v.id("integrations"),
    depositId: v.string(),
    coin: v.string(),
    amount: v.number(),
    network: v.string(),
    status: v.string(),
    insertTime: v.number(),
    txId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("deposits")
      .withIndex("by_integration_deposit", (q) =>
        q.eq("integrationId", args.integrationId).eq("depositId", args.depositId)
      )
      .first();

    if (existing) return;

    await ctx.db.insert("deposits", {
      integrationId: args.integrationId,
      depositId: args.depositId,
      coin: args.coin,
      amount: args.amount,
      network: args.network,
      status: args.status,
      insertTime: args.insertTime,
      txId: args.txId,
      createdAt: Date.now(),
    });
  },
});

export const insertWithdrawal = mutation({
  args: {
    integrationId: v.id("integrations"),
    withdrawId: v.string(),
    coin: v.string(),
    amount: v.number(),
    network: v.string(),
    status: v.string(),
    applyTime: v.number(),
    txId: v.string(),
    fee: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("withdrawals")
      .withIndex("by_integration_withdraw", (q) =>
        q.eq("integrationId", args.integrationId).eq("withdrawId", args.withdrawId)
      )
      .first();

    if (existing) return;

    await ctx.db.insert("withdrawals", {
      integrationId: args.integrationId,
      withdrawId: args.withdrawId,
      coin: args.coin,
      amount: args.amount,
      network: args.network,
      status: args.status,
      applyTime: args.applyTime,
      txId: args.txId,
      fee: args.fee,
      createdAt: Date.now(),
    });
  },
});

export const syncKaspaWallet = action({
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

    if (integration.provider !== "kaspa") {
      throw new Error("Cette intégration n'est pas de type Kaspa");
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
      const dataset = "kaspa_transactions";
      const scope = walletAddress;

      const state = await ctx.runQuery(api.integrations.getSyncState, {
        integrationId: args.integrationId,
        dataset,
        scope,
      });

      const previousCursor = (state?.cursor ?? null) as SyncCursor | null;
      const lastBlockTime = previousCursor?.lastBlockTime ?? 0;

      let newMaxBlockTime = lastBlockTime;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const url = `${KASPA_API_BASE}/addresses/${walletAddress}/full-transactions?limit=${BATCH_SIZE}&offset=${offset}&resolve_previous_outpoints=light`;

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Kaspa API error: ${response.statusText}`);
        }

        const transactions = (await response.json()) as KaspaTransaction[];

        if (!Array.isArray(transactions) || transactions.length === 0) {
          hasMore = false;
          break;
        }

        let reachedKnown = false;

        for (const tx of transactions) {
          if (!tx.is_accepted) continue;

          const blockTime = tx.block_time;

          if (blockTime <= lastBlockTime) {
            reachedKnown = true;
            continue;
          }

          if (blockTime > newMaxBlockTime) {
            newMaxBlockTime = blockTime;
          }

          let receivedSompi = BigInt(0);
          let externalSompi = BigInt(0);
          for (const output of tx.outputs) {
            const amount = BigInt(output.amount);
            if (output.script_public_key_address === walletAddress) {
              receivedSompi += amount;
            } else {
              externalSompi += amount;
            }
          }

          const hasWalletInputs = tx.inputs.some(
            (inp) => inp.script_public_key_address === walletAddress
          );

          if (hasWalletInputs && externalSompi > BigInt(0)) {
            const amountKas = Number(externalSompi) / SOMPI_PER_KAS;
            await ctx.runMutation(api.kaspa.insertWithdrawal, {
              integrationId: args.integrationId,
              withdrawId: `${tx.transaction_id}-out`,
              coin: "KAS",
              amount: amountKas,
              network: "kaspa",
              status: "CONFIRMED",
              applyTime: blockTime,
              txId: tx.transaction_id,
              fee: 0,
            });
          } else if (!hasWalletInputs && receivedSompi > BigInt(0)) {
            const amountKas = Number(receivedSompi) / SOMPI_PER_KAS;
            await ctx.runMutation(api.kaspa.insertDeposit, {
              integrationId: args.integrationId,
              depositId: `${tx.transaction_id}-in`,
              coin: "KAS",
              amount: amountKas,
              network: "kaspa",
              status: "CONFIRMED",
              insertTime: blockTime,
              txId: tx.transaction_id,
            });
          }
        }

        if (reachedKnown || transactions.length < BATCH_SIZE) {
          hasMore = false;
        } else {
          offset += BATCH_SIZE;
        }
      }

      const newCursor: SyncCursor = { lastBlockTime: newMaxBlockTime };

      await ctx.runMutation(api.integrations.updateSyncState, {
        integrationId: args.integrationId,
        dataset,
        scope,
        cursor: newCursor,
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
