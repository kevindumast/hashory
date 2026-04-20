import type { Appearance } from "@clerk/types";

export function getClerkAppearance(isDark: boolean): Appearance {
  return {
    layout: {
      socialButtonsVariant: "iconButton",
    },
    variables: {
      colorPrimary: isDark ? "#b4c5ff" : "#2563eb",
      colorText: isDark ? "#dfe4ff" : "#0b1120",
      colorTextSecondary: isDark ? "rgba(180,197,255,0.7)" : "rgba(15,23,42,0.62)",
      colorBackground: "transparent",
      colorInputBackground: isDark ? "rgba(10,24,57,0.7)" : "rgba(255,255,255,0.92)",
      colorInputText: isDark ? "#dfe4ff" : "#0b1120",
      borderRadius: "0.75rem",
      fontFamily: "var(--font-body)",
    },
    elements: {
      card: isDark
        ? "shadow-2xl border border-white/10 bg-[rgba(10,24,57,0.85)] backdrop-blur-xl rounded-2xl overflow-hidden"
        : "shadow-2xl border border-black/8 bg-white/90 backdrop-blur-xl rounded-2xl overflow-hidden",
      headerTitle: isDark ? "text-[#dfe4ff]" : "text-[#0b1120]",
      headerSubtitle: isDark ? "text-[rgba(180,197,255,0.7)]" : "text-[rgba(15,23,42,0.62)]",
      formFieldLabel: "text-sm font-medium",
      formButtonPrimary: "transition-opacity hover:opacity-90",
      footerActionLink: "transition-opacity hover:opacity-80",
      identityPreviewEditButton: "",
      dividerLine: isDark ? "bg-[rgba(130,155,210,0.28)]" : "bg-[rgba(15,23,42,0.08)]",
      dividerText: isDark ? "text-[rgba(180,197,255,0.5)]" : "text-[rgba(15,23,42,0.4)]",
      footer: isDark
        ? "bg-[rgba(7,13,31,0.6)] border-t border-white/5"
        : "bg-[rgba(247,248,251,0.8)] border-t border-black/5",
    },
  };
}
