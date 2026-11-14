"use client";

import { useCallback, useEffect } from "react";
import { useTheme } from "next-themes";
import { THEME_COLORS, type ThemeName } from "@/lib/theme";

/** Met à jour toutes les balises `theme-color` de la page. */
export function applyThemeColor(theme: ThemeName) {
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", THEME_COLORS[theme]);
  });
}

/**
 * Bascule clair ↔ sombre en fondu enchaîné (View Transitions), au lieu d'un
 * saut brutal de luminosité. Sans prise en charge du navigateur, la bascule
 * reste instantanée.
 *
 * La classe est posée directement dans le rappel de la transition : la
 * capture « après » doit voir le nouveau thème, et next-themes ne l'applique
 * qu'après son propre rendu.
 */
export function useThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const current: ThemeName = resolvedTheme === "dark" ? "dark" : "light";

  const switchTo = useCallback(
    (next: ThemeName) => {
      const apply = () => {
        const root = document.documentElement;
        root.classList.remove("light", "dark");
        root.classList.add(next);
        root.style.colorScheme = next;
        applyThemeColor(next);
        setTheme(next);
      };
      if (typeof document.startViewTransition !== "function") {
        apply();
        return;
      }
      document.startViewTransition(apply);
    },
    [setTheme]
  );

  const toggle = useCallback(() => switchTo(current === "dark" ? "light" : "dark"), [current, switchTo]);

  return { theme: current, switchTo, toggle };
}

/**
 * Garde `theme-color` aligné sur le thème actif : le site choisit son thème
 * par classe (pas par le réglage du système), les balises `media` ne
 * suffisent donc pas.
 */
export function ThemeColorSync() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (resolvedTheme === "dark" || resolvedTheme === "light") applyThemeColor(resolvedTheme);
  }, [resolvedTheme]);
  return null;
}
