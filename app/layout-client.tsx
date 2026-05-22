"use client";

import { ThemeProvider } from "@/components/theme-provider";
import { ReactNode } from "react";

type RootLayoutClientProps = {
  children: ReactNode;
};

export function RootLayoutClient({ children }: RootLayoutClientProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
