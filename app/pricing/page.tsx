import Link from "next/link";
import { Check, Minus, ArrowRight } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { LandingHeader } from "@/src/components/ui/LandingHeader";
import { SiteFooter } from "@/src/components/ui/SiteFooter";

// Free is the only plan that can be signed up for. Solo and Teams are the
// prices we intend to charge; both are listed as unavailable because billing is
// not wired (see internal/plans/plans.go) and neither's headline feature exists.
// When a tier becomes chargeable, set available: true and give it a real cta.
const TIERS = [
    {
        name: "Free",
        price: "$0",
        cadence: "while in beta",
        description: "Everything that currently works, at no cost, with real clients.",
        cta: "Get started free",
        ctaVariant: "primary" as const,
        available: true,
        highlighted: true,
        badge: "Available now",
        features: [
            "1 booking page",
            "10 bookings per month",
            "Video calls included",
            "Google Calendar sync",
            "Guests cancel from their email link",
        ],
    },
    {
        name: "Solo",
        price: "$12",
        cadence: "per month",
        description: "Waiting on paid sessions and on billing. Neither is finished.",
        cta: "Not available yet",
        ctaVariant: "outline" as const,
        available: false,
        highlighted: false,
        badge: "Later",
        features: [
            "Unlimited booking pages",
            "Unlimited bookings",
            "Charge for a session",
            "Custom booking URL",
        ],
    },
    {
        name: "Teams",
        price: "$29",
        cadence: "per month",
        description: "Not started. Sessionly has no concept of a team account today.",
        cta: "Not available yet",
        ctaVariant: "outline" as const,
        available: false,
        highlighted: false,
        badge: "Later",
        features: [
            "Everything in Solo",
            "Up to 5 team members",
            "Shared booking pages",
            "Priority support",
        ],
    },
];

// [label, free, solo, teams]. A row whose Free column is false is a row nobody
// can use yet: Solo and Teams are not purchasable. Google Calendar sync is on
// Free because the server does not gate it by plan at all.
const TABLE: [string, string | boolean, string | boolean, string | boolean][] = [
    ["Booking pages",         "1",   "Unlimited", "Unlimited"],
    ["Bookings per month",    "10",  "Unlimited", "Unlimited"],
    ["Video calls",           true,  true,        true],
    ["Google Calendar sync",  true,  true,        true],
    ["Guest self-cancel",     true,  true,        true],
    ["Custom booking URL",    false, true,        true],
    ["Charge for a session",  false, true,        true],
    ["Team members",          "1",   "1",         "Up to 5"],
    ["Shared booking pages",  false, false,       true],
    ["Priority support",      false, false,       true],
    ["Purchasable today",     true,  false,       false],
];

const FAQS = [
    {
        q: "Can I charge my clients through Sessionly?",
        a: "Not yet. You can set a price on an event type, but the booking flow rejects paid events on purpose and returns a clear error rather than pretending to take a payment. No money moves through Sessionly today, in either direction.",
    },
    {
        q: "So what does it cost right now?",
        a: "Nothing. Free is the only plan you can be on, and there is no card field anywhere in the product. If that changes, we will say so before charging anyone, as the terms already commit us to.",
    },
    {
        q: "Why publish prices you cannot charge?",
        a: "So the eventual bill is not a surprise. $12 and $29 are what we expect Solo and Teams to cost. Both are unbuilt, so both are marked unavailable rather than sold as a waiting list.",
    },
    {
        q: "What counts as a booking?",
        a: "Every time a client schedules time with you through your link. The Free plan allows 10 per calendar month and 1 booking page. If you hit that ceiling, tell us: right now there is no paid plan to escape to, and knowing someone hit it is more useful to us than the cap is.",
    },
    {
        q: "Do my clients need to create an account?",
        a: "No. They book through your public link, get a confirmation email, and click one link to join the video room. No download, no sign-up, no app.",
    },
];

function Cell({ v }: { v: string | boolean }) {
    if (typeof v === "boolean") {
        return v
            ? <Check className="mx-auto size-4 text-[hsl(var(--primary))]" />
            : <Minus className="mx-auto size-4 text-[hsl(var(--muted-foreground))]/30" />;
    }
    return <span>{v}</span>;
}

export default function PricingPage() {
    return (
        <div className="flex min-h-dvh flex-col">
            <LandingHeader />

            <main className="flex flex-1 flex-col">

                {/* ── Hero ─────────────────────────────────────────── */}
                <section className="relative overflow-hidden px-6 pt-20 pb-16 text-center">
                    <div
                        className="pointer-events-none absolute inset-0 -z-10"
                        style={{
                            backgroundImage: "repeating-linear-gradient(0deg, hsl(var(--foreground) / 0.02) 0px, hsl(var(--foreground) / 0.02) 1px, transparent 1px, transparent 4px)",
                        }}
                    />
                    <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-[hsl(var(--foreground))] leading-tight">
                        Free while we&apos;re
                        <br />in beta.
                    </h1>
                    <p className="mt-4 text-lg text-[hsl(var(--muted-foreground))] max-w-lg mx-auto leading-relaxed">
                        One plan is real and it costs nothing. The two below it are the prices we expect
                        to charge once they exist. Neither can be bought today, and we will tell account
                        holders before that changes.
                    </p>
                </section>

                {/* ── Cards ────────────────────────────────────────── */}
                <section className="px-6 pb-16">
                    <div className="mx-auto max-w-5xl grid grid-cols-1 sm:grid-cols-3 gap-5">
                        {TIERS.map((tier) => (
                            <div
                                key={tier.name}
                                className={`rounded-2xl p-7 flex flex-col ${
                                    tier.highlighted
                                        ? "border-2 border-[hsl(var(--primary))] bg-[hsl(var(--card))] shadow-[0_0_0_1px_hsl(var(--primary)/0.1),0_20px_60px_hsl(var(--primary)/0.12)]"
                                        : "border border-[hsl(var(--border))] bg-[hsl(var(--card))]"
                                }`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <p className={`label-caps ${tier.highlighted ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"}`}>
                                        {tier.name}
                                    </p>
                                    {tier.badge && (
                                        <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest ${
                                            tier.available
                                                ? "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"
                                                : "border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]"
                                        }`}>
                                            {tier.badge}
                                        </span>
                                    )}
                                </div>

                                <div className="flex items-end gap-1.5 mb-1">
                                    <span className={`text-4xl font-bold ${tier.available ? "text-[hsl(var(--foreground))]" : "text-[hsl(var(--muted-foreground))]"}`}>{tier.price}</span>
                                    <span className="pb-1 text-sm text-[hsl(var(--muted-foreground))]">{tier.cadence}</span>
                                </div>

                                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed mb-6">
                                    {tier.description}
                                </p>

                                <ul className="flex flex-col gap-2.5 flex-1 mb-7">
                                    {tier.features.map(f => (
                                        <li key={f} className={`flex items-start gap-2.5 text-sm ${tier.available ? "text-[hsl(var(--foreground))]" : "text-[hsl(var(--muted-foreground))]"}`}>
                                            {tier.available
                                                ? <Check className="size-4 text-[hsl(var(--primary))] shrink-0 mt-0.5" />
                                                : <Minus className="size-4 text-[hsl(var(--muted-foreground))]/50 shrink-0 mt-0.5" />}
                                            {f}
                                        </li>
                                    ))}
                                </ul>

                                {tier.available ? (
                                    <Button variant={tier.ctaVariant} size="lg" className="w-full" asChild>
                                        <Link href="/register">
                                            {tier.cta}
                                            <ArrowRight className="size-4 ml-1" />
                                        </Link>
                                    </Button>
                                ) : (
                                    <Button variant={tier.ctaVariant} size="lg" className="w-full" disabled>
                                        {tier.cta}
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* vs comparison */}
                    <div className="mt-6 mx-auto max-w-5xl">
                        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]
                                        px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                            <p className="text-sm text-[hsl(var(--muted-foreground))] text-center sm:text-left">
                                Currently paying for a scheduling tool <em>and</em> a separate video app?
                            </p>
                            <p className="text-sm font-semibold text-[hsl(var(--foreground))] shrink-0">
                                Sessionly does both, free, for as long as the beta runs.
                            </p>
                        </div>
                    </div>
                </section>

                {/* ── Comparison table ─────────────────────────────── */}
                <section className="px-6 pb-20">
                    <div className="mx-auto max-w-5xl">
                        <h2 className="text-xl font-bold text-[hsl(var(--foreground))] mb-6 text-center tracking-tight">
                            Full comparison
                        </h2>
                        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-x-auto">
                            <table className="w-full min-w-[540px]">
                                <thead>
                                    <tr className="border-b border-[hsl(var(--border))]">
                                        <th className="py-4 pl-7 pr-4 text-left text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider w-1/2">
                                            Feature
                                        </th>
                                        <th className="py-4 px-4 text-center text-xs font-semibold text-[hsl(var(--primary))] uppercase tracking-wider">
                                            Free
                                        </th>
                                        <th className="py-4 px-4 text-center text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                                            Solo
                                        </th>
                                        <th className="py-4 pl-4 pr-7 text-center text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                                            Teams
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {TABLE.map(([label, free, solo, teams]) => (
                                        <tr key={label} className="border-b border-[hsl(var(--border))] last:border-0">
                                            <td className="py-3.5 pl-7 pr-4 text-sm text-[hsl(var(--foreground))]">{label}</td>
                                            <td className="py-3.5 px-4 text-center text-sm text-[hsl(var(--foreground))] font-medium">
                                                <Cell v={free} />
                                            </td>
                                            <td className="py-3.5 px-4 text-center text-sm text-[hsl(var(--muted-foreground))]">
                                                <Cell v={solo} />
                                            </td>
                                            <td className="py-3.5 pl-4 pr-7 text-center text-sm text-[hsl(var(--muted-foreground))]">
                                                <Cell v={teams} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                {/* ── FAQ ──────────────────────────────────────────── */}
                <section className="px-6 pb-24 sm:pb-32">
                    <div className="mx-auto max-w-2xl">
                        <h2 className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))] mb-8 text-center">
                            Common questions
                        </h2>
                        <div className="flex flex-col gap-3">
                            {FAQS.map(({ q, a }) => (
                                <div key={q} className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
                                    <p className="font-semibold text-[hsl(var(--foreground))] mb-2">{q}</p>
                                    <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">{a}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Bottom CTA ───────────────────────────────────── */}
                <section className="relative overflow-hidden border-t border-[hsl(var(--border))] px-6 py-24 text-center">
                    <div
                        className="pointer-events-none absolute inset-0 -z-10"
                        style={{
                            backgroundImage: "repeating-linear-gradient(0deg, hsl(var(--foreground) / 0.02) 0px, hsl(var(--foreground) / 0.02) 1px, transparent 1px, transparent 4px)",
                        }}
                    />
                    <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--foreground))] mb-3">
                        Nothing to decide yet.
                    </h2>
                    <p className="text-[hsl(var(--muted-foreground))] mb-8 max-w-sm mx-auto leading-relaxed">
                        The Free plan is the product, not a 14-day trial. Take it, use it with real
                        clients, and tell us where it falls short.
                    </p>
                    <Button size="lg" className="px-10 text-base" asChild>
                        <Link href="/register">Create your free account</Link>
                    </Button>
                </section>

            </main>
            <SiteFooter />
        </div>
    );
}
