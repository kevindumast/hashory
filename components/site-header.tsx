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
import { HashoryLogo } from "@/components/hashory-logo";
import { ScrollProgress } from "@/components/motion";

const navLinks = [
  { href: "/#apercu", label: "Aperçu" },
  { href: "/#features", label: "Fonctionnalités" },
  { href: "/#workflow", label: "Comment ça marche" },
  { href: "/#transparence", label: "Transparence" },
  { href: "/changelog", label: "Changelog" },
];

const hiddenOnRoutes = ["/sign-in", "/sign-up", "/dashboard"];

export function SiteHeader() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  if (hiddenOnRoutes.some((route) => pathname.startsWith(route))) {
    return null;
  }

  return (
    <div className="sticky top-0 z-40 border-b border-line bg-background/85 backdrop-blur">
      <header className="mx-auto w-full max-w-7xl px-4 sm:px-8">
        <div className="flex h-16 w-full items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 text-foreground">
            <HashoryLogo size={24} />
            <span className="text-sm font-bold uppercase leading-none tracking-[0.28em]">Hashory</span>
          </Link>
          <nav className="hidden items-center gap-8 text-[15px] text-slate lg:flex">
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
              <Link
                href="/sign-in"
                className="hidden px-2 text-[15px] text-slate transition-colors hover:text-foreground md:inline"
              >
                Se connecter
              </Link>
              <Button asChild size="sm" className="hidden h-9 px-4 md:inline-flex">
                <Link href="/sign-up">Commencer</Link>
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
                  className="lg:hidden"
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
                        "rounded-xl px-3 py-3 text-base font-bold transition hover:bg-muted hover:text-foreground",
                        pathname === link.href && "bg-muted text-foreground"
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
      <ScrollProgress className="absolute inset-x-0 -bottom-px" />
    </div>
  );
}
