import { serializeCsv, type Sheet } from "@/lib/export";

/**
 * Déclenche le téléchargement d'une feuille au format CSV.
 *
 * Volontairement séparé de `lib/export.ts`, qui reste pur et testable : ici
 * on ne fait que toucher au DOM. À n'appeler que depuis du code client.
 *
 * La marque d'ordre des octets en tête est indispensable pour qu'Excel
 * reconnaisse l'UTF-8 — sans elle, les accents d'un export fiscal
 * s'affichent en caractères parasites chez le comptable.
 */
export function downloadCsv(sheet: Sheet): void {
  const content = "\uFEFF" + serializeCsv(sheet);
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = sheet.filename;
  link.click();

  URL.revokeObjectURL(url);
}
