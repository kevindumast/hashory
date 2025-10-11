"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navLinks = [{ href: "/dashboard", label: "Dashboard" }];

const hiddenOnRoutes = ["/sign-in", "/sign-up"];

export function SiteHeader() {
  const pathname = usePathname();

  if (hiddenOnRoutes.some((route) => pathname.startsWith(route))) {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-primary shadow-sm">
            O
          </span>
          Oracly
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "transition hover:text-foreground",
                pathname.startsWith(link.href) && "text-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <SignedOut>
            <Button asChild variant="ghost">
              <Link href="/sign-in">Se connecter</Link>
            </Button>
            <Button asChild className="hidden md:inline-flex">
              <Link href="/sign-up">Créer un compte</Link>
            </Button>
          </SignedOut>
          <SignedIn>
            <Button asChild variant="ghost" className="hidden md:inline-flex">
              <Link href="/dashboard">Mon espace</Link>
            </Button>
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-9 w-9 border border-border",
                },
              }}
              afterSignOutUrl="/"
            />
          </SignedIn>
        </div>
      </div>
    </header>
  );
}
