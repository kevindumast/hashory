"use client";

import { useCallback, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { toast } from "@/lib/toast";

import {
  DEFAULT_DECIMAL_SEPARATOR,
  isDecimalSeparator,
  type DecimalSeparator,
  type Sheet,
} from "@/lib/export";
import { downloadCsv } from "@/lib/download";
import { cn } from "@/lib/utils";

/**
 * Préférences d'export, rangées dans les métadonnées Clerk de l'utilisateur :
 * le choix le suit d'un appareil à l'autre sans coûter de lecture Convex.
 */
const METADATA_KEY = "csvDecimalSeparator";

export function useExportPreferences() {
  const { user, isLoaded } = useUser();
  const stored = user?.unsafeMetadata?.[METADATA_KEY];
  const decimalSeparator: DecimalSeparator = isDecimalSeparator(stored) ? stored : DEFAULT_DECIMAL_SEPARATOR;

  const setDecimalSeparator = useCallback(
    async (next: DecimalSeparator) => {
      if (!user) return;
      await user.update({ unsafeMetadata: { ...user.unsafeMetadata, [METADATA_KEY]: next } });
    },
    [user]
  );

  return { decimalSeparator, setDecimalSeparator, isLoaded };
}

/** Téléchargement CSV qui applique le séparateur décimal du profil. */
export function useDownloadCsv() {
  const { decimalSeparator } = useExportPreferences();
  return useCallback((sheet: Sheet) => downloadCsv(sheet, { decimal: decimalSeparator }), [decimalSeparator]);
}

const OPTIONS: { value: DecimalSeparator; label: string; example: string; hint: string }[] = [
  {
    value: ",",
    label: "Virgule",
    example: "1234,56",
    hint: "Excel ou LibreOffice configuré en français.",
  },
  {
    value: ".",
    label: "Point",
    example: "1234.56",
    hint: "Tableur configuré avec le point décimal (anglais, ou réglage Windows modifié).",
  },
];

/** Réglage affiché dans la fenêtre du profil. */
export function ExportPreferencesPanel() {
  const { decimalSeparator, setDecimalSeparator, isLoaded } = useExportPreferences();
  const [saving, setSaving] = useState(false);

  const choose = async (value: DecimalSeparator) => {
    if (value === decimalSeparator || saving) return;
    setSaving(true);
    try {
      await setDecimalSeparator(value);
      toast.success(`Séparateur décimal des exports : ${value === "," ? "virgule" : "point"}`);
    } catch {
      toast.error("Impossible d'enregistrer la préférence.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <fieldset disabled={!isLoaded || saving} className="space-y-2">
      <legend className="mb-2 text-sm font-medium text-foreground">Séparateur décimal des fichiers CSV</legend>
      {OPTIONS.map((option) => {
        const selected = option.value === decimalSeparator;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => void choose(option.value)}
            className={cn(
              "flex w-full cursor-pointer items-start justify-between gap-4 rounded-lg border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
            )}
          >
            <span>
              <span className="block text-sm font-medium text-foreground">{option.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{option.hint}</span>
            </span>
            <span className="num shrink-0 text-sm text-muted-foreground">{option.example}</span>
          </button>
        );
      })}
      <p className="pt-1 text-xs text-muted-foreground">
        S&apos;applique aux exports du portefeuille, des transactions et des cessions. Les colonnes restent
        séparées par un point-virgule.
      </p>
    </fieldset>
  );
}
