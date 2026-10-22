import type { Appearance } from "@clerk/types";

// Mêmes valeurs que les jetons de `app/globals.css` : Clerk rend ses
// composants hors de notre feuille de style et ne lit pas les variables CSS.
const LIGHT = {
  ink: "#151b23",
  muted: "#6b7380",
  faint: "#8a96a3",
  surface: "#f3f5f7",
  line: "#e6eaef",
  card: "#ffffff",
  violet: "#6a4fc2",
};

const DARK = {
  ink: "#e9edf2",
  muted: "#8f9aa8",
  faint: "#6b7684",
  surface: "#141a23",
  line: "#232b37",
  card: "#131922",
  violet: "#a48ff0",
};

export function getClerkAppearance(isDark: boolean): Appearance {
  const c = isDark ? DARK : LIGHT;
  // Le bouton principal est à l'encre, comme partout sur le site.
  const buttonText = isDark ? "#0d1117" : "#ffffff";

  return {
    layout: {
      socialButtonsVariant: "iconButton",
    },
    variables: {
      colorPrimary: c.ink,
      colorText: c.ink,
      colorTextSecondary: c.muted,
      colorBackground: c.card,
      colorInputBackground: c.surface,
      colorInputText: c.ink,
      colorNeutral: c.muted,
      borderRadius: "0.75rem",
      fontFamily: "Calibri, var(--font-carlito), 'Segoe UI', Arial, sans-serif",
      fontSize: "15px",
    },
    // Objets de style plutôt que classes : des classes Tailwind construites
    // à partir de variables ne seraient jamais générées.
    elements: {
      card: {
        border: `1px solid ${c.line}`,
        borderRadius: "1.5rem",
        overflow: "hidden",
        boxShadow: "0 30px 80px -40px rgba(21, 27, 35, 0.35)",
      },
      headerTitle: { fontSize: "1.25rem", fontWeight: 700, letterSpacing: "-0.02em", color: c.ink },
      headerSubtitle: { color: c.muted },
      formFieldLabel: { fontSize: "0.75rem", fontWeight: 700, color: c.muted },
      formFieldInput: {
        border: `1px solid ${c.line}`,
        backgroundColor: c.surface,
        color: c.ink,
        borderRadius: "0.75rem",
      },
      formButtonPrimary: {
        backgroundColor: c.ink,
        color: buttonText,
        fontWeight: 700,
        borderRadius: "9999px",
        textTransform: "none",
        boxShadow: "none",
      },
      footerActionLink: { color: c.violet, fontWeight: 700 },
      dividerLine: { backgroundColor: c.line },
      dividerText: { color: c.faint, fontSize: "0.75rem" },
      footer: { background: c.surface, borderTop: `1px solid ${c.line}` },
      socialButtonsIconButton: {
        border: `1px solid ${c.line}`,
        backgroundColor: c.card,
        borderRadius: "9999px",
      },
      identityPreviewText: { color: c.ink },
      identityPreviewEditButton: { color: c.violet },
    },
  };
}
