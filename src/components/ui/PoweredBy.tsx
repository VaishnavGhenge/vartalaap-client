import Link from "next/link";

import { cn } from "@/src/lib/utils";

interface Props {
    className?: string;
}

// Subtle footer line under public booking and confirmation pages. Mirrors the
// landing-page mock so a guest landing here from marketing sees the same
// "Powered by Sessionly" treatment. Intentionally low-contrast — it should
// signal provenance without competing with the host's content.
export function PoweredBy({ className }: Props) {
    return (
        <Link
            href="/"
            className={cn(
                "mt-8 text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]/60 hover:text-[hsl(var(--muted-foreground))]",
                className,
            )}
        >
            Powered by Sessionly
        </Link>
    );
}
