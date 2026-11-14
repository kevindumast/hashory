"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useThemeSwitch } from "@/hooks/useThemeSwitch";

export function ThemeToggle() {
  const { theme, toggle } = useThemeSwitch();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="h-8 w-8" />;
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 cursor-pointer"
      aria-label={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
      onClick={toggle}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4 text-muted-foreground transition-colors hover:text-foreground" />
      ) : (
        <Moon className="h-4 w-4 text-muted-foreground transition-colors hover:text-foreground" />
      )}
    </Button>
  );
}
