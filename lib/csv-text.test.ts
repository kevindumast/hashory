import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodeCsvText } from "./csv-text";

describe("décodage des CSV", () => {
  it("lit un export UTF-8, celui que produisent les plateformes", () => {
    const bytes = new TextEncoder().encode("Type\nÉchange\nDépôt\n");
    assert.equal(decodeCsvText(bytes), "Type\nÉchange\nDépôt\n");
  });

  it("lit un fichier réenregistré par Excel en Windows-1252", () => {
    // « Échange » et « Dépôt » en Windows-1252 : É = 0xC9, é = 0xE9, ô = 0xF4.
    const bytes = Uint8Array.from([0x54, 0x79, 0x70, 0x65, 0x0a, 0xc9, 0x63, 0x68, 0x61, 0x6e, 0x67, 0x65, 0x0a, 0x44, 0xe9, 0x70, 0xf4, 0x74]);
    assert.equal(decodeCsvText(bytes), "Type\nÉchange\nDépôt");
  });

  it("retire la marque d'ordre d'octets", () => {
    const bytes = new TextEncoder().encode("﻿Type\n");
    assert.equal(decodeCsvText(bytes), "Type\n");
  });
});
