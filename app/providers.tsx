"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ReactNode, Suspense } from "react";
import { convexClient, isConvexConfigured } from "@/convex/client";

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: "#C9A646",
        },
      }}
    >
      {isConvexConfigured && convexClient ? (
        <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
          <Suspense fallback={null}>{children}</Suspense>
        </ConvexProviderWithClerk>
      ) : (
        <Suspense fallback={null}>{children}</Suspense>
      )}
    </ClerkProvider>
  );
}
