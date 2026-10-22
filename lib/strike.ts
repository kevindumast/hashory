/**
 * Lecture des relevés CSV de Strike (strike.me).
 *
 * Strike n'expose pas ses achats par API : le relevé exporté depuis
 * Documents (ou Activity › Export) est la seule source. Son format a déjà
 * changé une fois, cassant les imports d'autres outils ; la lecture se fait
 * donc par nom de colonne, jamais par position, et chaque ligne est classée
 * d'après le **sens des montants** plutôt que d'après son libellé :
 *
 * | fiat | BTC | lecture                         |
 * |------|-----|---------------------------------|
 * | +    |     | dépôt de fiat                   |
 * | −    |     | retrait de fiat                 |
 * | −    | +   | achat de BTC                    |
 * | +    | −   | vente de BTC                    |
 * |      | +   | réception de BTC                |
 * |      | −   | envoi de BTC                    |
 *
 * Un achat débite un montant fiat **frais compris** : 55,00 € pour
 * 0,00070123 BTC à 77 663,53 €, soit 54,46 € de BTC et 0,54 € de frais.
 */

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** « Dec 09 2025 11:03:06 », toujours en UTC ; ISO accepté en repli. */
export function parseStrikeDate(raw: string): number | null {
  const match = raw.trim().match(/^([A-Za-z]{3})\w*\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const month = MONTHS[match[1].toLowerCase()];
    if (month === undefined) return null;
    return Date.UTC(Number(match[3]), month, Number(match[2]), Number(match[4]), Number(match[5]), Number(match[6] ?? 0));
  }
  const iso = Date.parse(raw.trim().replace(" ", "T").replace(/(T[\d:]+)$/, "$1Z"));
  return Number.isNaN(iso) ? null : iso;
}

/** Découpe une ligne CSV en respectant les guillemets. */
function splitLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function amount(raw: string | undefined): number {
  if (!raw) return 0;
  const value = Number(raw.replace(/[\s,]/g, "").replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(value) ? value : 0;
}

export type StrikeTrade = {
  externalId: string;
  executedAt: number;
  side: "BUY" | "SELL";
  fiatCurrency: string;
  /** Fiat débité (achat, frais compris) ou crédité (vente). */
  fiatAmount: number;
  /** Frais en fiat, compris dans le montant d'un achat. */
  fee: number;
  btcAmount: number;
  /** Cours du BTC appliqué, en fiat. */
  price?: number;
};

export type StrikeTransfer = {
  externalId: string;
  executedAt: number;
  asset: string;
  amount: number;
  /** Frais dans l'actif transféré. */
  fee: number;
  txId?: string;
  destination?: string;
};

export type StrikeImport = {
  trades: StrikeTrade[];
  deposits: StrikeTransfer[];
  withdrawals: StrikeTransfer[];
  /** Lignes illisibles ou sans montant, avec leur numéro. */
  skipped: { line: number; reason: string }[];
  fiatCurrency: string;
};

export function parseStrikeCsv(text: string): StrikeImport {
  const content = text.replace(/^﻿/, "");
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  const result: StrikeImport = { trades: [], deposits: [], withdrawals: [], skipped: [], fiatCurrency: "EUR" };
  if (lines.length < 2) return result;

  const headers = splitLine(lines[0]).map((header) => header.toLowerCase());
  const column = (...names: string[]) => headers.findIndex((header) => names.some((name) => header.startsWith(name)));

  // La devise du compte se lit dans l'en-tête : « Amount EUR », « Amount USD »…
  const fiatHeader = headers.find((header) => /^amount [a-z]{3}$/.test(header) && header !== "amount btc");
  const fiat = (fiatHeader?.slice(-3) ?? "eur").toUpperCase();
  result.fiatCurrency = fiat;
  const lowerFiat = fiat.toLowerCase();

  const iReference = column("reference", "transaction id", "id");
  const iDate = column("date");
  const iType = column("transaction type", "type");
  const iFiat = column(`amount ${lowerFiat}`);
  const iFiatFee = column(`fee ${lowerFiat}`);
  const iBtc = column("amount btc");
  const iBtcFee = column("fee btc");
  const iPrice = column("btc price");
  const iDestination = column("destination");
  const iHash = column("transaction hash");

  if (iDate === -1 || (iFiat === -1 && iBtc === -1)) {
    result.skipped.push({ line: 1, reason: "En-tête non reconnu : ce n'est pas un relevé Strike." });
    return result;
  }

  for (let index = 1; index < lines.length; index++) {
    const cells = splitLine(lines[index]);
    const get = (i: number) => (i === -1 ? undefined : cells[i]);
    const executedAt = parseStrikeDate(get(iDate) ?? "");
    if (executedAt === null) {
      result.skipped.push({ line: index + 1, reason: "Date illisible." });
      continue;
    }

    const externalId = get(iReference) || `row-${index}-${executedAt}`;
    const fiatAmount = amount(get(iFiat));
    const fiatFee = Math.abs(amount(get(iFiatFee)));
    const btc = amount(get(iBtc));
    const btcFee = Math.abs(amount(get(iBtcFee)));
    const price = amount(get(iPrice)) || undefined;
    const txId = get(iHash) || undefined;
    const destination = get(iDestination) || undefined;

    if (fiatAmount < 0 && btc > 0) {
      result.trades.push({ externalId, executedAt, side: "BUY", fiatCurrency: fiat, fiatAmount: -fiatAmount, fee: fiatFee, btcAmount: btc, price });
    } else if (fiatAmount > 0 && btc < 0) {
      result.trades.push({ externalId, executedAt, side: "SELL", fiatCurrency: fiat, fiatAmount, fee: fiatFee, btcAmount: -btc, price });
    } else if (btc > 0) {
      result.deposits.push({ externalId, executedAt, asset: "BTC", amount: btc, fee: 0, txId });
    } else if (btc < 0) {
      result.withdrawals.push({ externalId, executedAt, asset: "BTC", amount: -btc, fee: btcFee, txId, destination });
    } else if (fiatAmount > 0) {
      result.deposits.push({ externalId, executedAt, asset: fiat, amount: fiatAmount, fee: 0 });
    } else if (fiatAmount < 0) {
      result.withdrawals.push({ externalId, executedAt, asset: fiat, amount: -fiatAmount, fee: fiatFee, destination });
    } else {
      const type = get(iType) || "inconnu";
      result.skipped.push({ line: index + 1, reason: `« ${type} » sans montant.` });
    }
  }

  return result;
}
