import type { ReactNode } from "react";

import { cn } from "@/src/lib/utils";

/**
 * Small letterspaced label above a heading, optionally numbered.
 *
 * Replaces the rounded pill-with-a-coloured-dot that sat above the hero. That
 * pill is one of the most recognisable template signatures in software
 * marketing; a rule and a set of small caps does the same job (orient the
 * reader) and belongs to the editorial register the rest of the page is in.
 */
export function Eyebrow({
    children,
    index,
    className,
}: {
    children: ReactNode;
    /** Zero-padded section number, e.g. 2 renders "02". Editorial rhythm. */
    index?: number;
    className?: string;
}) {
    return (
        <div className={cn("flex items-center gap-3", className)}>
            {index !== undefined && (
                <span className="font-display text-sm tabular-nums text-[hsl(var(--primary))]">
                    {String(index).padStart(2, "0")}
                </span>
            )}
            <span className="text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
                {children}
            </span>
            <span aria-hidden className="h-px flex-1 bg-[hsl(var(--border))]" />
        </div>
    );
}
