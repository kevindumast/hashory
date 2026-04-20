import type { Appearance } from "@clerk/types";

export function getClerkAppearance(isDark: boolean): Appearance {
  return {
    layout: {
      socialButtonsVariant: "iconButton",
    },
    variables: {
      colorPrimary: isDark ? "#b4c5ff" : "#2563eb",
      colorText: isDark ? "#dfe4ff" : "#0b1120",
      colorTextSecondary: isDark ? "rgba(180,197,255,0.65)" : "rgba(15,23,42,0.55)",
      colorBackground: isDark ? "#0b1222" : "#ffffff",
      colorInputBackground: isDark ? "#0f1c3a" : "#f1f5f9",
      colorInputText: isDark ? "#dfe4ff" : "#0b1120",
      colorNeutral: isDark ? "#b4c5ff" : "#64748b",
      borderRadius: "0.625rem",
      fontFamily: "var(--font-body)",
      fontSize: "14px",
    },
    elements: {
      card: isDark
        ? "shadow-2xl border border-white/10 rounded-2xl overflow-hidden"
        : "shadow-xl border border-slate-200 rounded-2xl overflow-hidden",
      headerTitle: `text-base font-semibold ${isDark ? "text-[#dfe4ff]" : "text-[#0b1120]"}`,
      headerSubtitle: `text-sm ${isDark ? "text-[rgba(180,197,255,0.65)]" : "text-[rgba(15,23,42,0.55)]"}`,
      formFieldLabel: `text-xs font-medium ${isDark ? "text-[rgba(180,197,255,0.8)]" : "text-[#374151]"}`,
      formFieldInput: isDark
        ? "border border-white/10 bg-[#0f1c3a] text-[#dfe4ff] placeholder:text-[rgba(180,197,255,0.35)] focus:border-[#b4c5ff]/50 rounded-lg"
        : "border border-slate-200 bg-slate-50 text-[#0b1120] placeholder:text-slate-400 focus:border-blue-400 rounded-lg",
      formButtonPrimary: isDark
        ? "bg-[#b4c5ff] text-[#00389a] hover:bg-[#c5d3ff] font-semibold rounded-lg transition-colors"
        : "bg-[#2563eb] text-white hover:bg-[#1d4ed8] font-semibold rounded-lg transition-colors",
      footerActionLink: isDark
        ? "text-[#b4c5ff] hover:text-[#dfe4ff] font-medium"
        : "text-[#2563eb] hover:text-[#1d4ed8] font-medium",
      dividerLine: isDark ? "bg-white/10" : "bg-slate-200",
      dividerText: isDark ? "text-[rgba(180,197,255,0.4)] text-xs" : "text-slate-400 text-xs",
      footer: isDark
        ? "bg-[#070d1f] border-t border-white/5"
        : "bg-slate-50 border-t border-slate-100",
      socialButtonsIconButton: isDark
        ? "border border-white/10 bg-[#0f1c3a] hover:bg-[#162240] rounded-lg transition-colors"
        : "border border-slate-200 bg-white hover:bg-slate-50 rounded-lg transition-colors",
      identityPreviewText: isDark ? "text-[#dfe4ff]" : "text-[#0b1120]",
      identityPreviewEditButton: isDark ? "text-[#b4c5ff]" : "text-[#2563eb]",
    },
  };
}
