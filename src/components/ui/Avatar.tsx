import type { CSSProperties } from "react";

import { initialsOf } from "@/src/lib/avatar";
import { cn } from "@/src/lib/utils";

/**
 * A person, as a photo or as their initials.
 *
 * There were four fallback treatments in the app: a blush circle with serif
 * initials on the landing mock and the booking page, a random saturated
 * Tailwind colour with white sans initials in call tiles, a purple-to-violet
 * gradient in the dashboard, and an unused DiceBear SVG component. The same
 * person could appear three different ways between booking a call and joining
 * it, which reads as three different products.
 *
 * One treatment now, the blush one: it is the only one built from theme tokens
 * rather than an arbitrary palette, so it follows light and dark instead of
 * fighting them. Seeded random colours were the thing to lose. They looked
 * lively in a grid of strangers and wrong everywhere else, and they gave the
 * warm palette a teal or violet it has nowhere else.
 */

type Size = "xs" | "sm" | "md" | "lg";

const SIZES: Record<Size, string> = {
    xs: "size-8 text-[0.6875rem]",
    sm: "size-9 text-xs",
    md: "size-12 text-base",
    lg: "size-16 text-xl",
};

interface AvatarProps {
    name: string;
    /** Photo, when the person has one. Falls back to initials without it. */
    src?: string | null;
    size?: Size;
    /**
     * Escape hatch for the call tiles, which scale the circle with the video
     * frame rather than sitting on the type scale. Overrides `size`.
     */
    style?: CSSProperties;
    className?: string;
    /**
     * Avatars beside a name are decorative: the name is already there, so
     * announcing initials twice is noise. Set this where the avatar stands
     * alone, e.g. a video tile with the camera off.
     */
    label?: string;
}

export function Avatar({ name, src, size = "sm", style, className, label }: AvatarProps) {
    const a11y = label
        ? { role: "img" as const, "aria-label": label }
        : { "aria-hidden": true as const };

    if (src) {
        return (
            <img
                src={src}
                alt={label ?? ""}
                style={style}
                className={cn(
                    "shrink-0 rounded-full object-cover ring-1 ring-[hsl(var(--border))]",
                    !style && SIZES[size],
                    className,
                )}
            />
        );
    }

    return (
        <div
            {...a11y}
            style={style}
            className={cn(
                "font-display flex shrink-0 items-center justify-center rounded-full",
                "bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]",
                !style && SIZES[size],
                className,
            )}
        >
            {initialsOf(name)}
        </div>
    );
}
