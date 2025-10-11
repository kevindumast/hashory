"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { ConvexProvider } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ReactNode } from "react";
import { convexClient, isConvexConfigured } from "@/convex/client";
import { TooltipProvider } from "@/components/ui/tooltip";

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  let content = (
    <TooltipProvider delayDuration={150}>
      {children}
    </TooltipProvider>
  );

  if (isConvexConfigured && convexClient) {
    if (publishableKey) {
      content = (
        <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
          {content}
        </ConvexProviderWithClerk>
      );
    } else {
      content = <ConvexProvider client={convexClient}>{content}</ConvexProvider>;
    }
  }

  if (!publishableKey) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[oracly] NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set. Clerk features are disabled for this build."
      );
    }
    return content;
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
      dynamic
    >
      {content}
    </ClerkProvider>
  );
}
