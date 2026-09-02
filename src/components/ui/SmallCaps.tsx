import type { ElementType, ReactNode } from "react";

import { cn } from "@/src/lib/utils";

/**
 * The uppercase letterspaced label used for eyebrows, column labels, weekday
 * headers and footer marks.
 *
 * It existed in four places with four specs: 0.6875rem/0.16em on the host
 * name, 10px/tracking-wider on the weekday row, 0.75rem/0.14em on the slot
 * count, 10px/tracking-wider at 60% on the footer. Same idea each time, near
 * enough to look like a mistake rather than a choice. One spec, two sizes.
 */

type Size = "xs" | "sm";

const SIZES: Record<Size, string> = {
    // Column headers and dense grids, where the label sits under a number.
    xs: "text-[0.625rem] tracking-[0.14em]",
    // The default: an eyebrow above a heading, or a label beside one.
    sm: "text-[0.6875rem] tracking-[0.18em]",
};

interface SmallCapsProps {
    children: ReactNode;
    size?: Size;
    /** Render as something other than a span, e.g. "dt" or "h2". */
    as?: ElementType;
    className?: string;
    id?: string;
}

export function SmallCaps({ children, size = "sm", as, className, id }: SmallCapsProps) {
    const Tag = as ?? "span";
    return (
        <Tag id={id} className={cn("font-medium uppercase text-[hsl(var(--muted-foreground))]", SIZES[size], className)}>
            {children}
        </Tag>
    );
}
