import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deflateRawSync } from "node:zlib";

import { readFirstSheet, XlsxError } from "./xlsx-reader";

/**
 * Archive zip minimale, écrite comme KuCoin le fait : compression deflate
 * et tailles nulles dans l'en-tête local (bit 3, descripteur de données).
 */
function buildZip(files: Record<string, string>, options: { store?: boolean } = {}): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content, "utf8");
    const data = options.store ? raw : deflateRawSync(raw);
    const nameBytes = Buffer.from(name, "utf8");
    const method = options.store ? 0 : 8;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(nameBytes.length, 26);
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(data.length, 8);
    descriptor.writeUInt32LE(raw.length, 12);
    locals.push(local, nameBytes, data, descriptor);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += 30 + nameBytes.length + data.length + 16;
  }
  const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, ...centrals, end]));
}

const inline = (ref: string, text: string) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;

function buildSheet(rows: string[][]): Uint8Array {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const body = rows
    .map(
      (row, r) =>
        `<row r="${r + 1}">${row
          .map((cell, c) => (cell === "" ? "" : inline(`${letters[c]}${r + 1}`, cell)))
          .join("")}</row>`
    )
    .join("\n");
  return buildZip({
    "[Content_Types].xml": "<Types/>",
    "xl/workbook.xml": "<workbook/>",
    "xl/sharedStrings.xml": '<sst count="0" uniqueCount="0"/>',
    "xl/worksheets/sheet1.xml": `<?xml version="1.0"?><worksheet><sheetData>\n${body}\n</sheetData></worksheet>`,
  });
}

describe("lecture des classeurs .xlsx", () => {
  it("lit les cellules en texte en ligne, comme dans les exports KuCoin", async () => {
    const rows = await readFirstSheet(
      buildSheet([
        ["UID", "Sell", "Buy"],
        ["1", "10 USDT", "77.1 KAS"],
      ])
    );
    assert.deepEqual(rows, [
      ["UID", "Sell", "Buy"],
      ["1", "10 USDT", "77.1 KAS"],
    ]);
  });

  it("comble les cellules vides pour garder les colonnes alignées", async () => {
    const rows = await readFirstSheet(buildSheet([["A", "B", "C"], ["1", "", "3"]]));
    assert.deepEqual(rows[1], ["1", "", "3"]);
  });

  it("lit un classeur réenregistré par Excel : chaînes partagées, nombres, entités", async () => {
    const bytes = buildZip({
      "xl/sharedStrings.xml": "<sst><si><t>Coin</t></si><si><r><t>Ach</t></r><r><t>at &amp; co</t></r></si></sst>",
      "xl/worksheets/sheet1.xml":
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
        '<row r="2"><c r="A2"><v>12.5</v></c><c r="B2" t="str"><v>&lt;x&gt;</v></c></row></sheetData></worksheet>',
    });
    assert.deepEqual(await readFirstSheet(bytes), [
      ["Coin", "", "Achat & co"],
      ["12.5", "<x>"],
    ]);
  });

  it("lit une archive sans compression", async () => {
    const bytes = buildZip(
      { "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="1">${inline("A1", "ok")}</row></sheetData></worksheet>` },
      { store: true }
    );
    assert.deepEqual(await readFirstSheet(bytes), [["ok"]]);
  });

  it("refuse un fichier qui n'est pas une archive", async () => {
    await assert.rejects(readFirstSheet(new TextEncoder().encode("UID,Sell\n1,2")), XlsxError);
  });

  it("refuse une archive tronquée", async () => {
    const bytes = buildSheet([["A"]]);
    const truncated = new Uint8Array([...bytes.subarray(0, 40), ...bytes.subarray(bytes.length - 200)]);
    await assert.rejects(readFirstSheet(truncated), XlsxError);
  });

  it("arrête une bombe zip au lieu de la décompresser", async () => {
    // 60 Mo de zéros compressés en quelques dizaines de Ko.
    const bomb = buildZip({ "xl/worksheets/sheet1.xml": "0".repeat(60 * 1024 * 1024) });
    assert.ok(bomb.length < 1024 * 1024);
    await assert.rejects(readFirstSheet(bomb), /trop volumineux/);
  });
});
