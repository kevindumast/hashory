"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

const navLinks = [
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Tarifs" },
  { href: "/dashboard", label: "Dashboard" },
];

const hiddenOnRoutes = ["/sign-in", "/sign-up", "/dashboard"];

export function SiteHeader() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  if (hiddenOnRoutes.some((route) => pathname.startsWith(route))) {
    return null;
  }

  return (
    <div className="sticky top-4 z-40 mx-auto w-full max-w-6xl px-4 md:px-6">
      <header className="rounded-2xl border border-border/60 bg-background/80 shadow-lg shadow-black/10 backdrop-blur">
        <div className="flex h-14 w-full items-center justify-between px-4 md:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground sm:text-lg"
          >
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-sm font-bold text-primary shadow-sm">
              T
            </span>
            <span className="leading-none">Termenva</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "transition-colors hover:text-foreground",
                  pathname === link.href && "text-foreground"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <SignedOut>
              <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
                <Link href="/sign-in">Se connecter</Link>
              </Button>
              <Button asChild size="sm" className="hidden md:inline-flex">
                <Link href="/sign-up">Commencer gratuitement</Link>
              </Button>
            </SignedOut>
            <SignedIn>
              <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
                <Link href="/dashboard">Mon espace</Link>
              </Button>
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "h-8 w-8 border border-border",
                  },
                }}
                afterSignOutUrl="/"
              />
            </SignedIn>
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
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
              <SheetContent
                side="right"
                className="flex w-full max-w-xs flex-col gap-6 bg-background overscroll-contain"
              >
                <div className="flex flex-col gap-2 pt-6">
                  {navLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        "rounded-lg px-2 py-3 text-base font-medium transition hover:bg-muted/40 hover:text-foreground",
                        pathname === link.href && "bg-muted/40 text-foreground"
                      )}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
                <div className="flex flex-col gap-3">
                  <SignedOut>
                    <Button asChild variant="outline" className="w-full" onClick={() => setIsOpen(false)}>
                      <Link href="/sign-in">Se connecter</Link>
                    </Button>
                    <Button asChild className="w-full" onClick={() => setIsOpen(false)}>
                      <Link href="/sign-up">Commencer gratuitement</Link>
                    </Button>
                  </SignedOut>
                  <SignedIn>
                    <Button asChild variant="outline" className="w-full" onClick={() => setIsOpen(false)}>
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
    </div>
  );
}
