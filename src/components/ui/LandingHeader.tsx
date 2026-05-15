"use client";

import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import { SessionlyWordmark } from "@/src/components/ui/SessionlyWordmark";
import { ThemeToggle } from "@/src/components/ui/ThemeToggle";

const NAV = [
    { label: "Features",   href: "/#features" },
    { label: "Pricing",    href: "/pricing" },
    { label: "Changelog",  href: "/changelog" },
];

export function LandingHeader() {
    return (
        <header className="sticky top-0 z-50 w-full px-3 pt-3">
            <div className="mx-auto grid h-14 max-w-6xl items-center rounded-2xl border border-[hsl(var(--border))]/70 bg-[hsl(var(--background))]/82 px-4 shadow-xl backdrop-blur-xl
                            grid-cols-[1fr_auto_1fr]">

                <Link href="/" className="flex items-center select-none">
                    <SessionlyWordmark className="text-[1.05rem] text-[hsl(var(--foreground))]" />
                </Link>

                <nav className="hidden md:flex items-center gap-1">
                    {NAV.map(({ label, href }) => (
                        <Link
                            key={label}
                            href={href}
                            className="px-3.5 py-2 rounded-lg text-sm font-medium
                                       text-[hsl(var(--muted-foreground))]
                                       hover:text-[hsl(var(--foreground))]
                                       hover:bg-[hsl(var(--muted))]/70
                                       transition-colors"
                        >
                            {label}
                        </Link>
                    ))}
                </nav>

                <div className="flex items-center gap-2 justify-end">
                    <ThemeToggle />
                    <Button
                        variant="ghost"
                        size="sm"
                        className="hidden text-sm font-medium sm:inline-flex"
                        asChild
                    >
                        <Link href="/login">Sign in</Link>
                    </Button>
                    <Button size="sm" className="px-4 text-sm font-semibold" asChild>
                        <Link href="/register">Get started free</Link>
                    </Button>
                </div>

            </div>
        </header>
    );
}
