import Link from "next/link";

import { SessionlyWordmark } from "@/src/components/ui/SessionlyWordmark";

const LINKS: ReadonlyArray<{ href: string; label: string }> = [
    { href: "/pricing", label: "Pricing" },
    { href: "/changelog", label: "Changelog" },
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
];

/**
 * Site-wide footer. Exists mainly to make the legal pages reachable: Google's
 * OAuth verification requires a privacy policy linked from the app's home page,
 * and a policy nobody can navigate to is not a policy.
 */
export function SiteFooter() {
    return (
        <footer className="border-t border-[hsl(var(--border))]/60 px-5 py-10 sm:px-6">
            <div className="mx-auto flex max-w-5xl flex-col items-center gap-5 sm:flex-row sm:justify-between">
                <Link href="/" aria-label="Sessionly home">
                    <SessionlyWordmark />
                </Link>
                <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                    {LINKS.map((l) => (
                        <Link
                            key={l.href}
                            href={l.href}
                            className="text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
                        >
                            {l.label}
                        </Link>
                    ))}
                </nav>
            </div>
        </footer>
    );
}
