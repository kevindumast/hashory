import { serializeCsv, type CsvOptions, type Sheet } from "@/lib/export";

/**
 * Déclenche le téléchargement d'une feuille au format CSV.
 *
 * Volontairement séparé de `lib/export.ts`, qui reste pur et testable : ici
 * on ne fait que toucher au DOM. À n'appeler que depuis du code client — de
 * préférence via `useDownloadCsv`, qui applique le séparateur décimal choisi
 * dans le profil.
 *
 * La marque d'ordre des octets en tête est indispensable pour qu'Excel
 * reconnaisse l'UTF-8 — sans elle, les accents d'un export fiscal
 * s'affichent en caractères parasites chez le comptable.
 */
export function downloadCsv(sheet: Sheet, options: CsvOptions = {}): void {
  const content = "﻿" + serializeCsv(sheet, options);
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = sheet.filename;
  link.click();

  URL.revokeObjectURL(url);
}
