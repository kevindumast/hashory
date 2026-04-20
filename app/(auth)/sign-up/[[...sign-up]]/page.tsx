"use client";

import { SignUp } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { getClerkAppearance } from "@/components/auth/clerk-appearance";

export default function SignUpPage() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = !mounted || resolvedTheme === "dark";

  return (
    <SignUp
      appearance={getClerkAppearance(isDark)}
      fallbackRedirectUrl="/dashboard"
    />
  );
}
