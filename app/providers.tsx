"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { ConvexProvider } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ReactNode } from "react";
import { convexClient, isConvexConfigured } from "@/convex/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClerkUserSync } from "@/components/auth/clerk-user-sync";

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  const tooltipWrapped = <TooltipProvider delayDuration={150}>{children}</TooltipProvider>;

  if (!publishableKey) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[oracly] NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set. Clerk features are disabled for this build."
      );
    }
    if (isConvexConfigured && convexClient) {
      return <ConvexProvider client={convexClient}>{tooltipWrapped}</ConvexProvider>;
    }
    return tooltipWrapped;
  }

  if (isConvexConfigured && convexClient) {
    return (
      <ClerkProvider
        publishableKey={publishableKey}
        appearance={{
          baseTheme: dark,
          variables: {
            colorPrimary: "#C9A646",
          },
        }}
      >
        <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
          <ClerkUserSync />
          {tooltipWrapped}
        </ConvexProviderWithClerk>
      </ClerkProvider>
    );
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: "#C9A646",
        },
      }}
    >
      {tooltipWrapped}
    </ClerkProvider>
  );
}
