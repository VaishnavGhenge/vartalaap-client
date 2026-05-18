import { LandingHeader } from "@/src/components/ui/LandingHeader";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";

const ENTRIES = [
    {
        version: "0.3",
        date: "May 2025",
        badge: "Beta",
        headline: "Booking pages, video rooms, and pricing",
        description: "The core loop is complete. Create a booking page, share your link, and meet clients in a built-in video room — all without leaving Sessionly.",
        changes: [
            "Booking pages with custom URL (e.g. getsessionly.com/u/jane-smith)",
            "Private video room generated for every confirmed booking",
            "5-step onboarding wizard to get set up in under two minutes",
            "Free, Solo ($12/mo), and Teams ($29/mo) pricing tiers",
            "Accept payments from clients — 0% platform fee",
            "Profile page with timezone and display name settings",
        ],
    },
    {
        version: "0.2",
        date: "April 2025",
        badge: "Alpha",
        headline: "Authentication and instant meetings",
        description: "Login, registration, and the first version of instant video calls via meeting code.",
        changes: [
            "Email and password authentication with secure session management",
            "Instant video meetings — start a call and share a code",
            "Dark and light theme with system preference detection",
            "Responsive layout across desktop and mobile",
        ],
    },
    {
        version: "0.1",
        date: "March 2025",
        badge: "Internal",
        headline: "Private alpha",
        description: "Initial peer-to-peer video calling infrastructure. Internal testing only.",
        changes: [
            "WebRTC peer-to-peer video calls",
            "Room-based signaling server",
            "Basic UI scaffolding",
        ],
    },
];

export default function ChangelogPage() {
    return (
        <div className="flex min-h-dvh flex-col" style={{ fontFamily: "var(--font-jakarta, system-ui)" }}>
            <LandingHeader />

            <main className="flex-1 px-6 pt-20 pb-32">
                <div className="mx-auto max-w-2xl">

                    {/* Header */}
                    <div className="mb-16">
                        <p className="label-caps text-[hsl(var(--primary))] mb-3">What&apos;s new</p>
                        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-[hsl(var(--foreground))]">
                            Changelog
                        </h1>
                        <p className="mt-4 text-lg text-[hsl(var(--muted-foreground))] leading-relaxed">
                            Every meaningful update to Sessionly, documented.
                        </p>
                    </div>

                    {/* Entries */}
                    <div className="relative">
                        {/* Vertical line */}
                        <div className="absolute left-0 top-2 bottom-0 w-px bg-[hsl(var(--border))]" />

                        <div className="flex flex-col gap-14">
                            {ENTRIES.map((entry) => (
                                <div key={entry.version} className="pl-10 relative">
                                    {/* Dot */}
                                    <div className="absolute left-0 top-1.5 -translate-x-[calc(50%-0.5px)]
                                                    h-2.5 w-2.5 rounded-full bg-[hsl(var(--primary))]
                                                    shadow-[0_0_0_3px_hsl(var(--background)),0_0_0_4px_hsl(var(--primary)/0.3)]" />

                                    {/* Meta */}
                                    <div className="flex flex-wrap items-center gap-2.5 mb-3">
                                        <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-widest">
                                            {entry.date}
                                        </span>
                                        <span className="text-[hsl(var(--border))]">·</span>
                                        <span className="text-sm font-bold text-[hsl(var(--foreground))]">
                                            v{entry.version}
                                        </span>
                                        <span className="rounded-full bg-[hsl(var(--primary))]/10 px-2.5 py-0.5
                                                       text-[9px] font-bold uppercase tracking-widest text-[hsl(var(--primary))]">
                                            {entry.badge}
                                        </span>
                                    </div>

                                    {/* Content */}
                                    <h2 className="text-xl font-bold text-[hsl(var(--foreground))] mb-2 tracking-tight">
                                        {entry.headline}
                                    </h2>
                                    <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed mb-5">
                                        {entry.description}
                                    </p>

                                    {/* Changes list */}
                                    <ul className="flex flex-col gap-2">
                                        {entry.changes.map((c) => (
                                            <li key={c} className="flex items-start gap-3 text-sm text-[hsl(var(--foreground))]">
                                                <span className="mt-[0.4rem] h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]/50 shrink-0" />
                                                {c}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* CTA */}
                    <div className="mt-20 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 text-center">
                        <p className="font-semibold text-[hsl(var(--foreground))] mb-1">
                            Want to follow along?
                        </p>
                        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-5">
                            We&apos;re shipping fast. Create a free account and grow with us.
                        </p>
                        <Button asChild>
                            <Link href="/register">Get started free</Link>
                        </Button>
                    </div>

                </div>
            </main>
        </div>
    );
}
