import { action } from "./_generated/server";
import { v } from "convex/values";
import { runEvmWalletSync } from "./evm";

/**
 * Synchronisation d'un wallet Ethereum.
 *
 * Conservée sous ce nom pour les clients existants ; la lecture est celle de
 * toutes les chaînes EVM (`convex/evm.ts`), avec les curseurs
 * `ethereum_native` et `ethereum_erc20` et les identifiants de transfert
 * d'origine — `lib/evm-transfers.test.ts` le vérifie.
 */
export const syncEthereumWallet = action({
  args: {
    integrationId: v.id("integrations"),
  },
  handler: async (ctx, args) => {
    await runEvmWalletSync(ctx, args.integrationId, "ethereum");
  },
});
