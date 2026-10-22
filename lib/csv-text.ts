/**
 * Décodage d'un fichier CSV exporté par une plateforme.
 *
 * Les exports sont en principe en UTF-8. Mais un fichier ouvert puis
 * réenregistré dans Excel sous Windows repart souvent en Windows-1252 :
 * lu comme de l'UTF-8, « Échange » devient illisible et la ligne est
 * ignorée. On tente donc l'UTF-8 strict, puis Windows-1252 si les octets
 * n'en sont pas. Une marque d'ordre d'octets éventuelle est retirée.
 */
export function decodeCsvText(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(view);
  } catch {
    text = new TextDecoder("windows-1252").decode(view);
  }
  return text.replace(/^﻿/, "");
}
