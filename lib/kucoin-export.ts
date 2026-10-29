/**
 * Lecture des exports KuCoin (Orders → Export, Assets → History).
 *
 * L'API KuCoin ne remonte pas au-delà de la création de la clé ni, pour
 * les ordres, au-delà de quelques mois : les exports sont la seule source
 * de l'historique ancien. Chaque fichier est reconnu à ses en-têtes, pas à
 * son nom, pour qu'on puisse tous les déposer d'un coup.
 *
 * Ce que chaque fichier apporte, et ce qu'on en écarte pour ne rien compter
 * deux fois :
 * - « Spot Orders_Filled Orders » : un ordre par ligne. La variante
 *   « Show Order-Splitting » détaille les mêmes ordres exécution par
 *   exécution : elle est reconnue et ignorée.
 * - « Convert Orders » : les conversions instantanées. Elles n'y sont
 *   datées que de leur « mise à jour », une à deux minutes après coup ;
 *   l'heure réelle est celle du relevé de compte (voir plus bas).
 * - « Deposit History » / « Withdrawal History » : les mouvements on-chain,
 *   avec leur hash — c'est lui qui les rapproche de la synchronisation API.
 * - « Fiat Orders_Fast Trade Orders » : les achats par carte, avec le
 *   montant réellement débité en euros. Les autres exports « Fiat Orders »
 *   (virements, P2P, paiement tiers) ne sont pas encore pris en charge :
 *   s'ils contiennent des lignes, le fichier le signale.
 * - « Account History » : les achats par carte (« Credit Card
 *   Transactions ») y figurent aussi, mais sans le prix payé. Ses autres lignes
 *   (dépôts, retraits, trades, conversions, transferts entre sous-comptes)
 *   répètent les fichiers précédents ; les reprendre doublerait les
 *   mouvements, et un retrait y apparaît frais inclus. Ses lignes
 *   « Convert Market » servent seulement à redater les conversions : datées
 *   de leur mise à jour, elles passaient après les achats payés avec leur
 *   produit, si bien que ces achats puisaient dans un solde encore vide.
 */

export type KucoinSpotTrade = {
  orderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  avgFilledPrice: number;
  filledAmount: number;
  filledVolume: number;
  fee: number;
  feeAsset: string;
  executedAt: number;
};

export type KucoinConvert = {
  sellAsset: string;
  sellAmount: number;
  buyAsset: string;
  buyAmount: number;
  symbol: string;
  side: "BUY" | "SELL";
  executedAt: number;
};

export type KucoinTransfer = {
  hash: string;
  coin: string;
  amount: number;
  fee: number;
  address: string;
  network: string;
  executedAt: number;
};

/** Achat par carte bancaire. */
export type KucoinCardPurchase = {
  coin: string;
  amount: number;
  /** Prestataire de paiement indiqué par KuCoin (Visa/MasterCard, finaro…). */
  channel: string;
  executedAt: number;
  /**
   * Ce qui a été débité, frais compris — seul l'export « Fast Trade
   * Orders » le donne ; le relevé de compte n'indique que la crypto reçue.
   */
  fiat?: { currency: string; amount: number; fee: number };
};

/** Crédit d'une conversion vu par le relevé de compte, à son heure réelle. */
export type KucoinConvertFill = { asset: string; amount: number; executedAt: number };

export type KucoinExportKind =
  | "spot"
  | "spot_split"
  | "convert"
  | "deposit"
  | "withdrawal"
  | "account"
  | "fiat_fast_trade"
  /** Autres exports « Fiat Orders » : reconnus, pas encore importés. */
  | "fiat_other"
  | "unknown";

export type KucoinExport = {
  kind: KucoinExportKind;
  spotTrades: KucoinSpotTrade[];
  converts: KucoinConvert[];
  deposits: KucoinTransfer[];
  withdrawals: KucoinTransfer[];
  cardPurchases: KucoinCardPurchase[];
  convertFills: KucoinConvertFill[];
  /** Lignes lues mais écartées (statut non abouti, doublon d'un autre fichier…). */
  skipped: number;
};

const PREFERRED_QUOTES = new Set(["USDT", "USDC", "USD", "DAI", "FDUSD", "TUSD", "BUSD", "EUR", "GBP", "BTC", "ETH", "KCS"]);

export function resolveConvertSymbol(fromAsset: string, toAsset: string): { symbol: string; side: "BUY" | "SELL" } {
  const from = fromAsset.toUpperCase();
  const to = toAsset.toUpperCase();
  if (PREFERRED_QUOTES.has(from) && !PREFERRED_QUOTES.has(to)) return { symbol: `${to}${from}`, side: "BUY" };
  if (PREFERRED_QUOTES.has(to) && !PREFERRED_QUOTES.has(from)) return { symbol: `${from}${to}`, side: "SELL" };
  return { symbol: `${to}${from}`, side: "BUY" };
}

/**
 * Fuseau d'un export, lu dans l'en-tête de ses colonnes de date :
 * « Time(UTC+08:00) », « Time(UTC-0) »… KuCoin laisse le choisir à
 * l'export et ne le répète pas dans les cellules. UTC+08:00 par défaut,
 * celui de la plateforme.
 */
export function exportTimeZone(headers: string[]): string {
  for (const header of headers) {
    const match = /\(UTC\s*([+-])\s*(\d{1,2})(?::(\d{2}))?\)/i.exec(String(header ?? ""));
    if (match) return `${match[1]}${match[2].padStart(2, "0")}:${match[3] ?? "00"}`;
    if (/\(UTC\)/i.test(String(header ?? ""))) return "+00:00";
  }
  return "+08:00";
}

export function parseKucoinTime(raw: string, timeZone = "+08:00"): number | null {
  const text = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(text)) return null;
  if (!/^[+-]\d{2}:\d{2}$/.test(timeZone)) return null;
  const ts = Date.parse(`${text.replace(" ", "T")}${timeZone}`);
  return Number.isNaN(ts) ? null : ts;
}

/** « 77.1727 KAS » → 77.1727 KAS. */
function parseAmountCurrency(raw: string): { amount: number; currency: string } | null {
  const parts = String(raw ?? "").trim().split(/\s+/);
  if (parts.length < 2) return null;
  const amount = Number(parts[0]);
  const currency = parts[parts.length - 1].toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0 || !/^[A-Z0-9]{1,20}$/.test(currency)) return null;
  return { amount, currency };
}

function number(raw: string | undefined): number {
  const value = Number(String(raw ?? "").trim());
  return Number.isFinite(value) ? value : 0;
}

function coin(raw: string | undefined): string {
  const value = String(raw ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{1,20}$/.test(value) ? value : "";
}

function column(headers: string[], name: string): number {
  return headers.indexOf(name);
}

/** En-têtes normalisés : minuscules, fuseau horaire retiré. */
function normalizeHeaders(row: string[]): string[] {
  return row.map((h) => String(h ?? "").trim().toLowerCase().replace(/\(utc[^)]*\)/, "").trim());
}

export function detectKind(headers: string[]): KucoinExportKind {
  const has = (name: string) => headers.includes(name);
  if (has("sell") && has("buy") && has("time of update")) return "convert";
  if (has("order id") && has("filled amount")) return has("status") ? "spot" : "spot_split";
  if (has("hash") && has("deposit address")) return "deposit";
  if (has("hash") && has("withdrawal address/account")) return "withdrawal";
  if (has("currency") && has("side") && has("remark") && has("type")) return "account";
  if (has("order id") && has("crypto quantity") && has("fiat amount") && has("payment method")) return "fiat_fast_trade";
  if (has("order id") && has("currency (fiat)") && has("fiat amount")) return "fiat_other";
  return "unknown";
}

function empty(kind: KucoinExportKind): KucoinExport {
  return { kind, spotTrades: [], converts: [], deposits: [], withdrawals: [], cardPurchases: [], convertFills: [], skipped: 0 };
}

/** Analyse les lignes d'un export, en-tête compris. */
export function parseKucoinExport(rows: string[][]): KucoinExport {
  if (rows.length === 0) return empty("unknown");
  const headers = normalizeHeaders(rows[0]);
  const kind = detectKind(headers);
  const result = empty(kind);
  const timeZone = exportTimeZone(rows[0]);
  const time = (raw: string) => parseKucoinTime(raw, timeZone);
  // « No matching records found. » : une période sans activité.
  const data = rows
    .slice(1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim()) && !/no matching records/i.test(row.join(" ")));
  const at = (row: string[], name: string) => String(row[column(headers, name)] ?? "").trim();

  if (kind === "spot_split" || kind === "unknown" || kind === "fiat_other") {
    result.skipped = data.length;
    return result;
  }

  for (const row of data) {
    if (kind === "convert") {
      const sell = parseAmountCurrency(at(row, "sell"));
      const buy = parseAmountCurrency(at(row, "buy"));
      const executedAt = time(at(row, "time of update"));
      if (at(row, "status").toUpperCase() !== "SUCCESS" || !sell || !buy || !executedAt) {
        result.skipped++;
        continue;
      }
      const { symbol, side } = resolveConvertSymbol(sell.currency, buy.currency);
      result.converts.push({
        sellAsset: sell.currency,
        sellAmount: sell.amount,
        buyAsset: buy.currency,
        buyAmount: buy.amount,
        symbol,
        side,
        executedAt,
      });
      continue;
    }

    if (kind === "spot") {
      const status = at(row, "status").toLowerCase();
      const orderId = at(row, "order id");
      const symbol = at(row, "symbol").toUpperCase();
      const side = at(row, "side").toUpperCase();
      const filledAmount = number(at(row, "filled amount"));
      const executedAt = time(at(row, "filled time"));
      if (
        (status !== "deal" && status !== "part_deal") ||
        !/^[A-Za-z0-9]{1,64}$/.test(orderId) ||
        !/^[A-Z0-9]{1,20}-[A-Z0-9]{1,20}$/.test(symbol) ||
        (side !== "BUY" && side !== "SELL") ||
        !(filledAmount > 0) ||
        !executedAt
      ) {
        result.skipped++;
        continue;
      }
      result.spotTrades.push({
        orderId,
        symbol: symbol.replace("-", ""),
        side,
        avgFilledPrice: number(at(row, "avg. filled price")),
        filledAmount,
        filledVolume: number(at(row, "filled volume")),
        fee: Math.max(0, number(at(row, "fee"))),
        feeAsset: coin(at(row, "fee currency")),
        executedAt,
      });
      continue;
    }

    if (kind === "deposit" || kind === "withdrawal") {
      const executedAt = time(at(row, "time"));
      const asset = coin(at(row, "coin"));
      const amount = number(at(row, "amount"));
      const hash = at(row, "hash");
      if (at(row, "status").toUpperCase() !== "SUCCESS" || !executedAt || !asset || !(amount > 0) || !hash || hash.length > 200) {
        result.skipped++;
        continue;
      }
      const transfer: KucoinTransfer = {
        hash,
        coin: asset,
        amount,
        fee: Math.max(0, number(at(row, "fee"))),
        address: at(row, kind === "deposit" ? "deposit address" : "withdrawal address/account").slice(0, 200),
        network: at(row, "transfer network").slice(0, 40),
        executedAt,
      };
      (kind === "deposit" ? result.deposits : result.withdrawals).push(transfer);
      continue;
    }

    if (kind === "fiat_fast_trade") {
      const executedAt = time(at(row, "time"));
      const asset = coin(at(row, "currency (crypto)"));
      const amount = number(at(row, "crypto quantity"));
      const currency = coin(at(row, "currency (fiat)"));
      const fiatAmount = number(at(row, "fiat amount"));
      if (at(row, "status").toUpperCase() !== "SUCCEEDED" || !executedAt || !asset || !(amount > 0) || !currency || !(fiatAmount > 0)) {
        result.skipped++;
        continue;
      }
      result.cardPurchases.push({
        coin: asset,
        amount,
        channel: at(row, "payment method").slice(0, 40),
        executedAt,
        fiat: { currency, amount: fiatAmount, fee: Math.max(0, number(at(row, "fee (fiat)"))) },
      });
      continue;
    }

    // Relevé de compte : seuls les achats par carte sont repris.
    const executedAt = time(at(row, "time"));
    const asset = coin(at(row, "currency"));
    const amount = number(at(row, "amount"));
    if (/^convert/i.test(at(row, "type")) && at(row, "side").toLowerCase() === "deposit" && executedAt && asset && amount > 0) {
      result.convertFills.push({ asset, amount, executedAt });
    }
    if (
      at(row, "type") === "Credit Card Transactions" &&
      at(row, "side").toLowerCase() === "deposit" &&
      executedAt &&
      asset &&
      amount > 0
    ) {
      result.cardPurchases.push({ coin: asset, amount, channel: at(row, "remark").slice(0, 40), executedAt });
    } else {
      result.skipped++;
    }
  }
  return result;
}

/** Fusionne plusieurs exports, en écartant les lignes présentes deux fois. */
export function mergeKucoinExports(exports: KucoinExport[]): Omit<KucoinExport, "kind" | "convertFills"> {
  const unique = <T>(items: T[], key: (item: T) => string) => [...new Map(items.map((item) => [key(item), item])).values()];
  const all = exports;
  return {
    // Les relevés 2024 et 2025 se recouvrent parfois d'un jour : la clé de
    // chaque ligne évite de la compter deux fois.
    spotTrades: unique(all.flatMap((e) => e.spotTrades), (t) => t.orderId),
    converts: retimeConverts(
      unique(all.flatMap((e) => e.converts), (c) => `${c.executedAt}|${c.sellAsset}|${c.sellAmount}`),
      all.flatMap((e) => e.convertFills)
    ),
    deposits: unique(all.flatMap((e) => e.deposits), (d) => d.hash.toLowerCase()),
    withdrawals: unique(all.flatMap((e) => e.withdrawals), (w) => w.hash.toLowerCase()),
    cardPurchases: mergeCardPurchases(unique(all.flatMap((e) => e.cardPurchases), (p) => `${cardPurchaseId(p)}|${p.fiat ? "fiat" : ""}`)),
    skipped: all.reduce((sum, e) => sum + e.skipped, 0),
  };
}

/** Délai maximal entre une conversion et sa « mise à jour ». */
export const CONVERT_SETTLE_MS = 5 * 60_000;

/**
 * Donne à chaque conversion l'heure du crédit inscrit au relevé de compte :
 * même jeton reçu, même quantité, dans les minutes qui précèdent sa mise à
 * jour. Sans relevé, l'heure de mise à jour reste.
 */
function retimeConverts(converts: KucoinConvert[], fills: KucoinConvertFill[]): KucoinConvert[] {
  const used = new Set<KucoinConvertFill>();
  return converts.map((convert) => {
    const fill = fills.find(
      (candidate) =>
        !used.has(candidate) &&
        candidate.asset === convert.buyAsset &&
        Math.abs(candidate.amount - convert.buyAmount) <= Math.max(1e-9, convert.buyAmount * 1e-9) &&
        convert.executedAt - candidate.executedAt >= 0 &&
        convert.executedAt - candidate.executedAt <= CONVERT_SETTLE_MS
    );
    if (!fill) return convert;
    used.add(fill);
    return { ...convert, executedAt: fill.executedAt };
  });
}

/** Écart toléré entre l'heure du relevé de compte et celle de l'ordre « Fast Trade ». */
const CARD_MATCH_MS = 15 * 60_000;

/**
 * Même achat par carte vu par deux exports : même jeton, même quantité au
 * dernier chiffre près, à quelques minutes d'écart.
 */
export function sameCardPurchase(
  a: Pick<KucoinCardPurchase, "coin" | "amount" | "executedAt">,
  b: Pick<KucoinCardPurchase, "coin" | "amount" | "executedAt">
): boolean {
  return (
    a.coin === b.coin &&
    Math.abs(a.amount - b.amount) <= Math.max(1e-9, b.amount * 1e-9) &&
    Math.abs(a.executedAt - b.executedAt) <= CARD_MATCH_MS
  );
}

/**
 * Le relevé de compte et l'export « Fast Trade » décrivent les mêmes achats.
 * On garde la ligne du relevé — son heure fonde l'identifiant déjà en base —
 * complétée du montant débité ; un ordre sans ligne de relevé est gardé tel
 * quel.
 */
function mergeCardPurchases(purchases: KucoinCardPurchase[]): KucoinCardPurchase[] {
  const fromAccount = purchases.filter((p) => !p.fiat);
  const fromOrders = purchases.filter((p) => p.fiat);
  const used = new Set<KucoinCardPurchase>();
  const merged = fromAccount.map((purchase) => {
    const order = fromOrders.find((candidate) => !used.has(candidate) && sameCardPurchase(candidate, purchase));
    if (!order) return purchase;
    used.add(order);
    return { ...purchase, fiat: order.fiat };
  });
  return [...merged, ...fromOrders.filter((order) => !used.has(order))];
}

/** Identifiant stable d'un achat par carte : le relevé n'en fournit aucun. */
export function cardPurchaseId(purchase: KucoinCardPurchase): string {
  return `kucoin-card:${purchase.executedAt}:${purchase.coin}:${purchase.amount}`;
}

/** Lit un CSV d'export (séparateur virgule ou point-virgule, guillemets). */
export function parseCsvRows(text: string): string[][] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];
  const separator = lines[0].includes(";") ? ";" : ",";
  return lines.map((line) => {
    const fields: string[] = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = !quoted;
      } else if (char === separator && !quoted) {
        fields.push(field.trim());
        field = "";
      } else field += char;
    }
    fields.push(field.trim());
    return fields;
  });
}
