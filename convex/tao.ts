import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { decryptSecret } from "./utils/encryption";

const TAOSTATS_API_BASE = "https://api.taostats.io/api/transfer/v1";
const RAO_PER_TAO = 1_000_000_000;
const PAGE_SIZE = 200;

interface TaoTransfer {
  id: string;
  to: { ss58: string; hex: string };
  from: { ss58: string; hex: string };
  block_number: number;
  timestamp: string;
  amount: string;
  fee: string;
  transaction_hash: string;
}

interface TaoTransferResponse {
  data: TaoTransfer[];
}

interface SyncCursor {
  lastBlockNumber: number;
}

export const syncTaoWallet = action({
  args: {
    integrationId: v.id("integrations"),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.runQuery(internal.integrations.getByIdInternal, {
      integrationId: args.integrationId,
    });

    if (!integration) {
      throw new Error("Integration not found");
    }

    if (integration.provider !== "tao") {
      throw new Error("Cette intégration n'est pas de type TAO");
    }

    const apiKey = process.env.TAOSTATS_API_KEY;
    if (!apiKey) {
      throw new Error("TAOSTATS_API_KEY not configured in Convex environment");
    }

    const walletAddress = decryptSecret(integration.encryptedCredentials.apiKey);
    if (!walletAddress) {
      throw new Error("Wallet address not found");
    }

    await ctx.runMutation(internal.integrations.updateSyncStatus, {
      integrationId: args.integrationId,
      syncStatus: "syncing",
    });

    try {
      const dataset = "tao_transactions";
      const scope = walletAddress;

      const state = await ctx.runQuery(api.integrations.getSyncState, {
        integrationId: args.integrationId,
        dataset,
        scope,
      });

      const previousCursor = (state?.cursor ?? null) as SyncCursor | null;
      const lastBlockNumber = previousCursor?.lastBlockNumber ?? 0;

      let newMaxBlockNumber = lastBlockNumber;
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const url = `${TAOSTATS_API_BASE}?address=${walletAddress}&page=${page}&limit=${PAGE_SIZE}`;

        const response = await fetch(url, {
          headers: { Authorization: apiKey, Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`Taostats API error: ${response.statusText}`);
        }

        const data = (await response.json()) as TaoTransferResponse;
        const transfers = Array.isArray(data.data) ? data.data : [];

        if (transfers.length === 0) {
          hasMore = false;
          break;
        }

        let reachedKnown = false;

        const deposits: Array<{
          depositId: string;
          coin: string;
          amount: number;
          network: string;
          status: string;
          insertTime: number;
          txId: string;
        }> = [];
        const withdrawals: Array<{
          withdrawId: string;
          coin: string;
          amount: number;
          network: string;
          status: string;
          applyTime: number;
          txId: string;
          fee: number;
        }> = [];

        for (const transfer of transfers) {
          const blockNumber = transfer.block_number;

          if (blockNumber <= lastBlockNumber) {
            reachedKnown = true;
            continue;
          }

          if (blockNumber > newMaxBlockNumber) {
            newMaxBlockNumber = blockNumber;
          }

          const timestamp = new Date(transfer.timestamp).getTime();
          const amountTao = Number(BigInt(transfer.amount)) / RAO_PER_TAO;
          const to = transfer.to.ss58;
          const from = transfer.from.ss58;

          if (to === walletAddress && from !== walletAddress) {
            deposits.push({
              depositId: `${transfer.id}-in`,
              coin: "TAO",
              amount: amountTao,
              network: "tao",
              status: "CONFIRMED",
              insertTime: timestamp,
              txId: transfer.transaction_hash,
            });
          } else if (from === walletAddress) {
            const feeTao = Number(BigInt(transfer.fee)) / RAO_PER_TAO;
            withdrawals.push({
              withdrawId: `${transfer.id}-out`,
              coin: "TAO",
              amount: amountTao,
              network: "tao",
              status: "CONFIRMED",
              applyTime: timestamp,
              txId: transfer.transaction_hash,
              fee: feeTao,
            });
          }
        }

        if (deposits.length > 0 || withdrawals.length > 0) {
          await ctx.runMutation(api.blockchainSync.bulkInsertTransactions, {
            integrationId: args.integrationId,
            deposits,
            withdrawals,
          });
        }

        if (reachedKnown || transfers.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          page++;
        }
      }

      const newCursor: SyncCursor = { lastBlockNumber: newMaxBlockNumber };

      await ctx.runMutation(internal.integrations.updateSyncState, {
        integrationId: args.integrationId,
        dataset,
        scope,
        cursor: newCursor,
      });

      await ctx.runMutation(internal.integrations.updateSyncStatus, {
        integrationId: args.integrationId,
        syncStatus: "synced",
      });
    } catch (error) {
      await ctx.runMutation(internal.integrations.updateSyncStatus, {
        integrationId: args.integrationId,
        syncStatus: "error",
      });
      throw error;
    }
  },
});
