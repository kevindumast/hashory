"use client";

import { ThemeProvider } from "@/components/theme-provider";
import { ReactNode } from "react";
import { ThemeColorSync } from "@/hooks/useThemeSwitch";

type RootLayoutClientProps = {
  children: ReactNode;
};

export function RootLayoutClient({ children }: RootLayoutClientProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <ThemeColorSync />
      {children}
    </ThemeProvider>
  );
}
