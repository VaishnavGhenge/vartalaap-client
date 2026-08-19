import type { ReactNode } from "react";

import { LandingHeader } from "@/src/components/ui/LandingHeader";
import { SiteFooter } from "@/src/components/ui/SiteFooter";

/**
 * Shared shell for /privacy and /terms. One layout rather than two so the two
 * documents can never drift apart visually, and so a third legal page costs
 * nothing to add.
 */
export function LegalPage({
    title,
    updated,
    intro,
    children,
}: {
    title: string;
    /** Human-readable date, e.g. "19 August 2026". */
    updated: string;
    intro: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="min-h-dvh bg-[hsl(var(--background))]">
            <LandingHeader />
            <main className="mx-auto max-w-2xl px-5 py-14 sm:px-6 sm:py-20">
                <h1 className="text-3xl font-bold tracking-tight text-[hsl(var(--foreground))] sm:text-4xl">
                    {title}
                </h1>
                <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Last updated {updated}</p>
                <div className="mt-6 text-[15px] leading-relaxed text-[hsl(var(--muted-foreground))]">{intro}</div>
                <div className="mt-10 flex flex-col gap-9">{children}</div>
            </main>
            <SiteFooter />
        </div>
    );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
    return (
        <section>
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">{heading}</h2>
            <div className="mt-2.5 flex flex-col gap-3 text-[15px] leading-relaxed text-[hsl(var(--muted-foreground))]">
                {children}
            </div>
        </section>
    );
}

export function LegalList({ items }: { items: ReactNode[] }) {
    return (
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
            {items.map((item, i) => (
                <li key={i}>{item}</li>
            ))}
        </ul>
    );
}
