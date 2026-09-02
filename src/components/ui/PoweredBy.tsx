import Link from "next/link";

import { cn } from "@/src/lib/utils";
import { SmallCaps } from "@/src/components/ui/SmallCaps";

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
                "mt-8 text-[hsl(var(--muted-foreground))]/60 transition-colors hover:text-[hsl(var(--muted-foreground))]",
                className,
            )}
        >
            <SmallCaps size="xs" className="text-inherit">Powered by Sessionly</SmallCaps>
        </Link>
    );
}
