/**
 * Lecture de la première feuille d'un classeur .xlsx, sans dépendance.
 *
 * Les exports KuCoin sont des classeurs, pas des CSV. La bibliothèque
 * `xlsx` publiée sur npm est figée sur une version qui porte des failles
 * connues (pollution de prototype, expressions régulières exponentielles)
 * à la lecture d'un fichier piégé. Or un .xlsx n'est qu'une archive zip de
 * XML : lire des cellules texte et nombre tient en peu de code, et ce code
 * ne fait confiance ni aux tailles annoncées ni au contenu.
 *
 * Garde-fous : taille d'archive et de chaque fichier décompressé bornées
 * (une « bombe zip » s'arrête net), nombre de lignes et de colonnes borné,
 * aucune évaluation du XML — seules les balises de cellule sont lues.
 */

const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;
const MAX_ENTRY_BYTES = 50 * 1024 * 1024;
const MAX_ROWS = 100_000;
const MAX_COLUMNS = 200;

export class XlsxError extends Error {}

type ZipEntry = { name: string; method: number; compressedSize: number; localOffset: number };

function readEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Fin du répertoire central : cherchée depuis la fin, commentaire compris.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new XlsxError("Fichier .xlsx illisible.");

  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new XlsxError("Fichier .xlsx illisible.");
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    entries.push({ name, method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_ENTRY_BYTES) {
      await reader.cancel();
      throw new XlsxError("Fichier .xlsx trop volumineux.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

async function readEntry(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const at = entry.localOffset;
  if (at + 30 > bytes.length || view.getUint32(at, true) !== 0x04034b50) {
    throw new XlsxError("Fichier .xlsx illisible.");
  }
  // Les tailles de l'en-tête local peuvent être nulles (descripteur de
  // données) : seules celles du répertoire central font foi.
  const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
  const end = start + entry.compressedSize;
  if (end > bytes.length) throw new XlsxError("Fichier .xlsx tronqué.");
  const data = bytes.subarray(start, end);
  if (entry.method === 0) {
    if (data.length > MAX_ENTRY_BYTES) throw new XlsxError("Fichier .xlsx trop volumineux.");
    return new TextDecoder().decode(data);
  }
  if (entry.method !== 8) throw new XlsxError("Compression .xlsx non prise en charge.");
  return new TextDecoder().decode(await inflate(data));
}

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, code: string) => {
    const lower = code.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    const point = lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
    return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : whole;
  });
}

/** Texte d'un élément <si> ou <is>, morceaux de texte enrichi compris. */
function textRuns(xml: string): string {
  let text = "";
  for (const match of xml.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)) text += match[1];
  return decodeXml(text);
}

function columnIndex(ref: string): number {
  let index = 0;
  for (const char of ref) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) break;
    index = index * 26 + (code - 64);
  }
  return index - 1;
}

/** Lignes de la première feuille, cellules en texte, vides comblées par "". */
export async function readFirstSheet(buffer: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length > MAX_ARCHIVE_BYTES) throw new XlsxError("Fichier .xlsx trop volumineux.");
  const entries = readEntries(bytes);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));

  const sheetEntry =
    byName.get("xl/worksheets/sheet1.xml") ??
    entries
      .filter((entry) => /^xl\/worksheets\/[^/]+\.xml$/.test(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name))[0];
  if (!sheetEntry) throw new XlsxError("Aucune feuille dans ce fichier .xlsx.");

  const shared: string[] = [];
  const sharedEntry = byName.get("xl/sharedStrings.xml");
  if (sharedEntry) {
    const xml = await readEntry(bytes, sharedEntry);
    for (const match of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textRuns(match[1]));
  }

  const sheet = await readEntry(bytes, sheetEntry);
  const rows: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    if (rows.length >= MAX_ROWS) throw new XlsxError("Trop de lignes dans ce fichier .xlsx.");
    const row: string[] = [];
    let next = 0;
    for (const cell of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cell[1];
      const body = cell[2] ?? "";
      const ref = /\br="([A-Z]+)\d*"/.exec(attributes)?.[1];
      const index = ref ? columnIndex(ref) : next;
      if (index < 0 || index >= MAX_COLUMNS) continue;
      const type = /\bt="(\w+)"/.exec(attributes)?.[1];
      const raw = /<v>([^<]*)<\/v>/.exec(body)?.[1];
      let value = "";
      if (type === "inlineStr") value = textRuns(body);
      else if (type === "s") value = raw !== undefined ? shared[Number(raw)] ?? "" : "";
      else if (raw !== undefined) value = decodeXml(raw);
      while (row.length < index) row.push("");
      row[index] = value;
      next = index + 1;
    }
    rows.push(row);
  }
  return rows;
}
