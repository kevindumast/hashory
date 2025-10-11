"use client";

import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <SignIn
      appearance={{
        layout: {
          socialButtonsVariant: "iconButton",
        },
        variables: {
          colorPrimary: "#C9A646",
          colorText: "#0B0B0C",
          colorTextSecondary: "#4A4A4F",
          colorBackground: "transparent",
          borderRadius: "1.25rem",
        },
        elements: {
          card: "shadow-none border-0 bg-transparent",
          formFieldLabel: "text-sm font-medium text-foreground",
          formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90",
          footerActionLink: "text-primary hover:text-primary/90",
        },
      }}
      afterSignInUrl="/dashboard"
      redirectUrl="/dashboard"
    />
  );
}
