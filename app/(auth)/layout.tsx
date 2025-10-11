import type { ReactNode } from "react";

type AuthLayoutProps = {
  children: ReactNode;
};

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-background to-background px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card/90 p-8 shadow-xl backdrop-blur">
        {children}
      </div>
    </div>
  );
}
