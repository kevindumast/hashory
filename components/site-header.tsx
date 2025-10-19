"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const navLinks = [{ href: "/dashboard", label: "Dashboard" }];

const hiddenOnRoutes = ["/sign-in", "/sign-up", "/dashboard"];

export function SiteHeader() {
  const pathname = usePathname();

  if (hiddenOnRoutes.some((route) => pathname.startsWith(route))) {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground sm:text-lg"
        >
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary shadow-sm">
            O
          </span>
          <span className="leading-none">Oracly</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn("transition hover:text-foreground", pathname.startsWith(link.href) && "text-foreground")}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <SignedOut>
            <Button asChild variant="ghost" className="hidden md:inline-flex">
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
          <Sheet>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Ouvrir le menu de navigation"
              >
                <Menu className="h-5 w-5 text-foreground" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="flex w-full max-w-xs flex-col gap-6 bg-background">
              <div className="flex flex-col gap-2 pt-6">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "rounded-lg px-2 py-3 text-base font-medium transition hover:bg-muted/40 hover:text-foreground",
                      pathname.startsWith(link.href) && "bg-muted/40 text-foreground"
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
              <div className="flex flex-col gap-3">
                <SignedOut>
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/sign-in">Se connecter</Link>
                  </Button>
                  <Button asChild className="w-full">
                    <Link href="/sign-up">Créer un compte</Link>
                  </Button>
                </SignedOut>
                <SignedIn>
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/dashboard">Mon espace</Link>
                  </Button>
                  <div className="flex justify-start">
                    <UserButton
                      appearance={{
                        elements: {
                          avatarBox: "h-10 w-10 border border-border",
                        },
                      }}
                      afterSignOutUrl="/"
                    />
                  </div>
                </SignedIn>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
