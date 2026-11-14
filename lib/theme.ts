export type ThemeName = "light" | "dark";

/**
 * Couleur de la barre d'état et du navigateur pour chaque thème : le fond
 * en haut de page (`--background`). Partagée entre le serveur (balise
 * initiale) et le client (synchronisation au changement de thème).
 */
export const THEME_COLORS: Record<ThemeName, string> = {
  light: "#ffffff",
  dark: "#0d1117",
};
