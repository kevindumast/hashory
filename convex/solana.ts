import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { decryptSecret } from "./utils/encryption";

const HELIUS_API_BASE = "https://api.helius.xyz/v0";
const LAMPORTS_PER_SOL = 1_000_000_000;
const PAGE_SIZE = 100;

interface HeliusNativeTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  amount: number;
}

interface HeliusTokenTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  mint: string;
  tokenAmount: number;
  tokenStandard?: string;
}

interface HeliusTx {
  signature: string;
  timestamp: number;
  fee: number;
  nativeTransfers: HeliusNativeTransfer[];
  tokenTransfers: HeliusTokenTransfer[];
}

interface SyncCursor {
  lastSignature: string | null;
}

export const syncSolanaWallet = action({
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

    if (integration.provider !== "solana") {
      throw new Error("Cette intégration n'est pas de type Solana");
    }

    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) {
      throw new Error("HELIUS_API_KEY not configured in Convex environment");
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
      const dataset = "solana_transactions";
      const scope = walletAddress;

      const state = await ctx.runQuery(api.integrations.getSyncState, {
        integrationId: args.integrationId,
        dataset,
        scope,
      });

      const previousCursor = (state?.cursor ?? null) as SyncCursor | null;
      let beforeSignature: string | null = null;
      let newFirstSignature: string | null = previousCursor?.lastSignature ?? null;
      let hasMore = true;
      let isFirstPage = true;

      while (hasMore) {
        let url = `${HELIUS_API_BASE}/addresses/${walletAddress}/transactions?api-key=${apiKey}&limit=${PAGE_SIZE}`;
        if (beforeSignature) {
          url += `&before=${beforeSignature}`;
        }

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Helius API error: ${response.statusText}`);
        }

        const txs = (await response.json()) as HeliusTx[];

        if (!Array.isArray(txs) || txs.length === 0) {
          hasMore = false;
          break;
        }

        if (isFirstPage) {
          newFirstSignature = txs[0].signature;
          isFirstPage = false;
        }

        let reachedKnown = false;

        for (const tx of txs) {
          if (previousCursor?.lastSignature && tx.signature === previousCursor.lastSignature) {
            reachedKnown = true;
            break;
          }

          const timestamp = tx.timestamp * 1000;
          const feeSol = tx.fee / LAMPORTS_PER_SOL;

          for (const transfer of tx.nativeTransfers) {
            const amount = transfer.amount / LAMPORTS_PER_SOL;
            if (amount <= 0) continue;

            if (transfer.toUserAccount === walletAddress && transfer.fromUserAccount !== walletAddress) {
              await ctx.runMutation(api.kaspa.insertDeposit, {
                integrationId: args.integrationId,
                depositId: `${tx.signature}-sol-${transfer.fromUserAccount.slice(0, 8)}-in`,
                coin: "SOL",
                amount,
                network: "solana",
                status: "CONFIRMED",
                insertTime: timestamp,
                txId: tx.signature,
              });
            } else if (transfer.fromUserAccount === walletAddress && transfer.toUserAccount !== walletAddress) {
              await ctx.runMutation(api.kaspa.insertWithdrawal, {
                integrationId: args.integrationId,
                withdrawId: `${tx.signature}-sol-${transfer.toUserAccount.slice(0, 8)}-out`,
                coin: "SOL",
                amount,
                network: "solana",
                status: "CONFIRMED",
                applyTime: timestamp,
                txId: tx.signature,
                fee: feeSol,
              });
            }
          }

          for (const transfer of tx.tokenTransfers) {
            const amount = transfer.tokenAmount;
            if (amount <= 0) continue;
            const symbol = transfer.mint.slice(0, 8);

            if (transfer.toUserAccount === walletAddress && transfer.fromUserAccount !== walletAddress) {
              await ctx.runMutation(api.kaspa.insertDeposit, {
                integrationId: args.integrationId,
                depositId: `${tx.signature}-spl-${transfer.mint.slice(0, 8)}-in`,
                coin: symbol,
                amount,
                network: "solana",
                status: "CONFIRMED",
                insertTime: timestamp,
                txId: tx.signature,
              });
            } else if (transfer.fromUserAccount === walletAddress && transfer.toUserAccount !== walletAddress) {
              await ctx.runMutation(api.kaspa.insertWithdrawal, {
                integrationId: args.integrationId,
                withdrawId: `${tx.signature}-spl-${transfer.mint.slice(0, 8)}-out`,
                coin: symbol,
                amount,
                network: "solana",
                status: "CONFIRMED",
                applyTime: timestamp,
                txId: tx.signature,
                fee: 0,
              });
            }
          }
        }

        if (reachedKnown || txs.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          beforeSignature = txs[txs.length - 1].signature;
        }
      }

      await ctx.runMutation(api.integrations.updateSyncState, {
        integrationId: args.integrationId,
        dataset,
        scope,
        cursor: { lastSignature: newFirstSignature } as SyncCursor,
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
