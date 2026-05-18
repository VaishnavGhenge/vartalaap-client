"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { SessionlyBrand } from "@/src/components/ui/SessionlyBrand";

const NAV = [
    { label: "Features",   href: "/#features" },
    { label: "Pricing",    href: "/pricing" },
    { label: "Changelog",  href: "/changelog" },
];

export function LandingHeader() {
    const [open, setOpen] = useState(false);
    const pathname = usePathname();

    // Close the sheet whenever the route changes (covers hash links too).
    useEffect(() => { setOpen(false); }, [pathname]);

    // Lock body scroll while the mobile sheet is open.
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, [open]);

    return (
        <header className="sticky top-0 z-50 w-full px-3 pt-3">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between rounded-2xl border border-[hsl(var(--border))]/70 bg-[hsl(var(--background))]/82 px-4 shadow-xl backdrop-blur-xl
                            md:grid md:grid-cols-[1fr_auto_1fr]">

                <Link href="/" className="flex items-center select-none" onClick={() => setOpen(false)}>
                    <SessionlyBrand size="sm" />
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
                    <Button
                        variant="ghost"
                        size="sm"
                        className="hidden text-sm font-medium md:inline-flex"
                        asChild
                    >
                        <Link href="/login">Sign in</Link>
                    </Button>
                    <Button size="sm" className="hidden px-4 text-sm font-semibold md:inline-flex" asChild>
                        <Link href="/register">Get started free</Link>
                    </Button>

                    <button
                        type="button"
                        aria-label={open ? "Close menu" : "Open menu"}
                        aria-expanded={open}
                        aria-controls="landing-mobile-nav"
                        onClick={() => setOpen(v => !v)}
                        className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg
                                   text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/70
                                   transition-colors"
                    >
                        {open ? <X className="size-5" /> : <Menu className="size-5" />}
                    </button>
                </div>
            </div>

            {/* Mobile nav sheet */}
            <div
                id="landing-mobile-nav"
                role="dialog"
                aria-modal="true"
                aria-hidden={!open}
                className={`md:hidden fixed inset-x-0 top-[4.25rem] bottom-0 z-40 transition-opacity duration-200 ${
                    open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                }`}
            >
                {/* Backdrop */}
                <button
                    type="button"
                    aria-label="Close menu"
                    onClick={() => setOpen(false)}
                    className="absolute inset-0 bg-[hsl(var(--background))]/70 backdrop-blur-sm"
                />
                {/* Panel */}
                <div
                    className={`relative mx-3 mt-1 rounded-2xl border border-[hsl(var(--border))]/70
                               bg-[hsl(var(--background))]/95 shadow-2xl backdrop-blur-xl
                               transition-transform duration-200 ease-out
                               ${open ? "translate-y-0" : "-translate-y-3"}`}
                >
                    <nav className="flex flex-col p-2">
                        {NAV.map(({ label, href }) => (
                            <Link
                                key={label}
                                href={href}
                                onClick={() => setOpen(false)}
                                className="px-4 py-3 rounded-xl text-base font-medium
                                           text-[hsl(var(--foreground))]
                                           hover:bg-[hsl(var(--muted))]/70 transition-colors"
                            >
                                {label}
                            </Link>
                        ))}
                    </nav>
                    <div className="border-t border-[hsl(var(--border))]/60 p-3 flex flex-col gap-2">
                        <Button variant="outline" size="lg" className="w-full text-base" asChild>
                            <Link href="/login" onClick={() => setOpen(false)}>Sign in</Link>
                        </Button>
                        <Button size="lg" className="w-full text-base font-semibold" asChild>
                            <Link href="/register" onClick={() => setOpen(false)}>Get started free</Link>
                        </Button>
                    </div>
                </div>
            </div>
        </header>
    );
}
