"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();
  // Sur mobile, les notifications restent hors de l'encoche et de
  // l'indicateur d'accueil ; dans le tableau de bord, au-dessus de la barre
  // d'onglets du bas.
  const aboveTabBar = usePathname().startsWith("/dashboard");
  const mobileOffset = {
    bottom: aboveTabBar
      ? "calc(6rem + env(safe-area-inset-bottom))"
      : "max(16px, calc(env(safe-area-inset-bottom) + 8px))",
    left: "max(16px, env(safe-area-inset-left))",
    right: "max(16px, env(safe-area-inset-right))",
  };

  return (
    <Sonner
      theme={(resolvedTheme as ToasterProps["theme"]) ?? "dark"}
      position="bottom-right"
      closeButton
      mobileOffset={mobileOffset}
      richColors={false}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-lg group-[.toaster]:backdrop-blur",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-md",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-md",
          success: "group-[.toaster]:text-positive",
          error: "group-[.toaster]:text-destructive",
        },
      }}
      {...props}
    />
  );
}
