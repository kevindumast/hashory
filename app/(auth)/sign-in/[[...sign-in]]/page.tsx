"use client";

import { SignIn } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { getClerkAppearance } from "@/components/auth/clerk-appearance";

export default function SignInPage() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const isDark = resolvedTheme === "dark";

  return (
    <SignIn
      key={isDark ? "dark" : "light"}
      appearance={getClerkAppearance(isDark)}
      fallbackRedirectUrl="/dashboard"
    />
  );
}
