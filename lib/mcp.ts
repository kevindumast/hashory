/**
 * Mise en forme des données exposées au serveur MCP (`app/api/mcp`).
 *
 * Claude lit ces réponses comme du texte : chaque ligne doit se comprendre
 * seule, sans identifiant interne à déchiffrer, et la réponse doit rester
 * courte. Les fonctions sont pures pour tourner dans une requête Convex et
 * se tester isolément (voir `lib/mcp.test.ts`).
 */

import type { Operation } from "./ledger";

/** Plafond de lignes renvoyées en une fois, quelle que soit la demande. */
export const MAX_TRANSACTIONS = 500;

/** Points d'une série de performance au-delà desquels on échantillonne. */
export const MAX_PERFORMANCE_POINTS = 120;

/**
 * Compare deux secrets en temps constant : la durée ne dit pas combien de
 * caractères étaient justes. Un secret vide ne correspond jamais.
 */
export function secretsMatch(expected: string | undefined, received: string): boolean {
  if (!expected) return false;
  let diff = expected.length ^ received.length;
  for (let index = 0; index < expected.length; index++) {
    diff |= expected.charCodeAt(index) ^ received.charCodeAt(index % Math.max(received.length, 1));
  }
  return diff === 0;
}

export type TransactionKind = "exchange" | "deposit" | "withdrawal";

export type TransactionRow = {
  date: string;
  type: TransactionKind;
  account: string;
  /** Échange : ce qui part. */
  given?: { asset: string; quantity: number };
  /** Échange : ce qui arrive. */
  received?: { asset: string; quantity: number };
  /** Transfert : actif et quantité. */
  asset?: string;
  quantity?: number;
  fee?: { asset: string; quantity: number };
  origin?: string;
  /** Transfert entre deux comptes suivis par Hashory. */
  internal?: boolean;
  txId?: string;
};

export type TransactionFilter = {
  asset?: string;
  type?: TransactionKind;
  /** Identifiant du compte. */
  account?: string;
  from?: number;
  to?: number;
  limit?: number;
};

function touchesAsset(operation: Operation, asset: string): boolean {
  if (operation.kind === "exchange") {
    return operation.given.asset === asset || operation.received.asset === asset;
  }
  return operation.asset === asset;
}

/**
 * Opérations retenues par le filtre, des plus récentes aux plus anciennes,
 * avec le nombre total de correspondances pour signaler une troncature.
 */
export function selectTransactions(
  operations: Operation[],
  filter: TransactionFilter,
  accountNames: Record<string, string>
): { total: number; rows: TransactionRow[] } {
  const asset = filter.asset?.trim().toUpperCase();
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), MAX_TRANSACTIONS);

  const matching = operations.filter(
    (operation) =>
      (!asset || touchesAsset(operation, asset)) &&
      (!filter.type || operation.kind === filter.type) &&
      (!filter.account || operation.account === filter.account) &&
      (filter.from === undefined || operation.timestamp >= filter.from) &&
      (filter.to === undefined || operation.timestamp <= filter.to)
  );
  matching.sort((a, b) => b.timestamp - a.timestamp);

  return {
    total: matching.length,
    rows: matching.slice(0, limit).map((operation) => describeOperation(operation, accountNames)),
  };
}

export function describeOperation(operation: Operation, accountNames: Record<string, string>): TransactionRow {
  const base = {
    date: new Date(operation.timestamp).toISOString(),
    type: operation.kind,
    account: accountNames[operation.account] ?? operation.account,
  };
  if (operation.kind === "exchange") {
    return {
      ...base,
      given: operation.given,
      received: operation.received,
      ...(operation.fee ? { fee: operation.fee } : {}),
      origin: operation.origin,
    };
  }
  return {
    ...base,
    asset: operation.asset,
    quantity: operation.quantity,
    ...(operation.fee ? { fee: { asset: operation.asset, quantity: operation.fee } } : {}),
    ...(operation.counterpart !== undefined ? { internal: true } : {}),
    ...(operation.txId ? { txId: operation.txId } : {}),
  };
}

/**
 * Garde au plus `maxPoints` points répartis régulièrement, toujours avec le
 * premier et le dernier : la tendance reste lisible et la valeur actuelle
 * exacte.
 */
export function samplePoints<T>(points: T[], maxPoints = MAX_PERFORMANCE_POINTS): T[] {
  if (points.length <= maxPoints || maxPoints < 2) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  const sampled: T[] = [];
  for (let index = 0; index < maxPoints; index++) {
    sampled.push(points[Math.round(index * step)]);
  }
  return sampled;
}

/** Date ISO (AAAA-MM-JJ) lue en début de jour UTC, ou undefined. */
export function parseDay(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(timestamp)) throw new Error(`Date invalide : « ${value} ». Format attendu : AAAA-MM-JJ.`);
  return timestamp;
}
