/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as ai from "../ai.js";
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as balances from "../balances.js";
import type * as binance from "../binance.js";
import type * as binanceDepositAddresses from "../binanceDepositAddresses.js";
import type * as bitcoin from "../bitcoin.js";
import type * as client from "../client.js";
import type * as cmcTokenMap from "../cmcTokenMap.js";
import type * as convertTrades from "../convertTrades.js";
import type * as deposits from "../deposits.js";
import type * as ethereum from "../ethereum.js";
import type * as fiatTransactions from "../fiatTransactions.js";
import type * as integrations from "../integrations.js";
import type * as kaspa from "../kaspa.js";
import type * as migrateTradeTypes from "../migrateTradeTypes.js";
import type * as orders from "../orders.js";
import type * as portfolios from "../portfolios.js";
import type * as resetCursors from "../resetCursors.js";
import type * as solana from "../solana.js";
import type * as trades from "../trades.js";
import type * as users from "../users.js";
import type * as utils_encryption from "../utils/encryption.js";
import type * as withdrawals from "../withdrawals.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  analytics: typeof analytics;
  auth: typeof auth;
  balances: typeof balances;
  binance: typeof binance;
  binanceDepositAddresses: typeof binanceDepositAddresses;
  bitcoin: typeof bitcoin;
  client: typeof client;
  cmcTokenMap: typeof cmcTokenMap;
  convertTrades: typeof convertTrades;
  deposits: typeof deposits;
  ethereum: typeof ethereum;
  fiatTransactions: typeof fiatTransactions;
  integrations: typeof integrations;
  kaspa: typeof kaspa;
  migrateTradeTypes: typeof migrateTradeTypes;
  orders: typeof orders;
  portfolios: typeof portfolios;
  resetCursors: typeof resetCursors;
  solana: typeof solana;
  trades: typeof trades;
  users: typeof users;
  "utils/encryption": typeof utils_encryption;
  withdrawals: typeof withdrawals;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
