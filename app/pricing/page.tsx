import Link from "next/link";
import { Check, Minus, ArrowRight } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { LandingHeader } from "@/src/components/ui/LandingHeader";

const TIERS = [
    {
        name: "Free",
        price: "$0",
        cadence: "forever",
        description: "Try it with real clients before committing to anything.",
        cta: "Get started free",
        ctaVariant: "outline" as const,
        highlighted: false,
        features: [
            "1 booking page",
            "10 bookings per month",
            "Video calls included",
        ],
    },
    {
        name: "Solo",
        price: "$12",
        cadence: "per month",
        description: "For professionals who rely on Sessionly every day.",
        cta: "Start for free",
        ctaVariant: "primary" as const,
        highlighted: true,
        badge: "Most popular",
        features: [
            "Unlimited booking pages",
            "Unlimited bookings",
            "Video calls included",
            "Accept payments — 0% extra fee",
            "Custom booking URL",
            "Email reminders",
        ],
    },
    {
        name: "Teams",
        price: "$29",
        cadence: "per month",
        description: "Up to 5 people sharing one Sessionly account.",
        cta: "Get started",
        ctaVariant: "outline" as const,
        highlighted: false,
        features: [
            "Everything in Solo",
            "Up to 5 team members",
            "Shared booking pages",
            "Google Calendar sync",
            "Priority support",
        ],
    },
];

// [label, free, solo, teams]
const TABLE: [string, string | boolean, string | boolean, string | boolean][] = [
    ["Booking pages",       "1",         "Unlimited",  "Unlimited"],
    ["Bookings per month",  "10",        "Unlimited",  "Unlimited"],
    ["Video calls",         true,        true,         true],
    ["Accept payments",     false,       true,         true],
    ["Platform fee",        "—",         "0%",         "0%"],
    ["Custom booking URL",  false,       true,         true],
    ["Email reminders",     false,       true,         true],
    ["Team members",        "1",         "1",          "Up to 5"],
    ["Shared booking pages",false,       false,        true],
    ["Google Calendar sync",false,       false,        true],
    ["Priority support",    false,       false,        true],
];

const FAQS = [
    {
        q: "Do you take a cut of what my clients pay me?",
        a: "No. On Solo and Teams you keep 100% of the session price. Your payment provider (Stripe) charges their standard 2.9% + $0.30 per transaction — that's it. We add nothing on top.",
    },
    {
        q: "What counts as a booking?",
        a: "Every time a client schedules time with you through your Sessionly link. The count resets at the start of each calendar month on the Free plan. Solo and Teams have no limit.",
    },
    {
        q: "Do my clients need to create an account?",
        a: "No. Clients book through your public link, get a confirmation email, and click one link to join the video room. No downloads, no sign-ups.",
    },
    {
        q: "Can I cancel anytime?",
        a: "Yes — cancel from your settings at any time. You keep full access until the end of the current billing period. No contracts, no penalties.",
    },
    {
        q: "What's included in the Teams plan?",
        a: "Up to 5 people under one account, each with their own booking page. You can also set up shared pages — for example, clients book with whoever is available next. Full team features are rolling out over the coming months.",
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
        <div className="flex min-h-dvh flex-col" style={{ fontFamily: "var(--font-jakarta, system-ui)" }}>
            <LandingHeader />

            <main className="flex flex-1 flex-col">

                {/* ── Hero ─────────────────────────────────────────── */}
                <section className="relative overflow-hidden px-6 pt-20 pb-16 text-center">
                    <div
                        className="pointer-events-none absolute inset-0 -z-10"
                        style={{
                            background: "radial-gradient(ellipse 80% 50% at 50% -5%, hsl(var(--primary) / 0.10), transparent 65%)",
                        }}
                    />
                    <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-[hsl(var(--foreground))] leading-tight">
                        Straightforward pricing.
                        <br />No surprises.
                    </h1>
                    <p className="mt-4 text-lg text-[hsl(var(--muted-foreground))] max-w-md mx-auto leading-relaxed">
                        We don&apos;t take a percentage of what your clients pay you. Pick a plan, pay monthly, cancel anytime.
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
                                        <span className="rounded-full bg-[hsl(var(--primary))]/10 px-2.5 py-0.5
                                                       text-[9px] font-bold uppercase tracking-widest text-[hsl(var(--primary))]">
                                            {tier.badge}
                                        </span>
                                    )}
                                </div>

                                <div className="flex items-end gap-1.5 mb-1">
                                    <span className="text-4xl font-bold text-[hsl(var(--foreground))]">{tier.price}</span>
                                    <span className="pb-1 text-sm text-[hsl(var(--muted-foreground))]">{tier.cadence}</span>
                                </div>

                                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed mb-6">
                                    {tier.description}
                                </p>

                                <ul className="flex flex-col gap-2.5 flex-1 mb-7">
                                    {tier.features.map(f => (
                                        <li key={f} className="flex items-start gap-2.5 text-sm text-[hsl(var(--foreground))]">
                                            <Check className="size-4 text-[hsl(var(--primary))] shrink-0 mt-0.5" />
                                            {f}
                                        </li>
                                    ))}
                                </ul>

                                <Button variant={tier.ctaVariant} size="lg" className="w-full" asChild>
                                    <Link href="/register">
                                        {tier.cta}
                                        {tier.highlighted && <ArrowRight className="size-4 ml-1" />}
                                    </Link>
                                </Button>
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
                                Sessionly Solo replaces both for $12/mo.
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
                                        <th className="py-4 px-4 text-center text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                                            Free
                                        </th>
                                        <th className="py-4 px-4 text-center text-xs font-semibold text-[hsl(var(--primary))] uppercase tracking-wider">
                                            Solo
                                        </th>
                                        <th className="py-4 pl-4 pr-7 text-center text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                                            Teams
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {TABLE.map(([label, free, solo, teams]) => (
                                        <tr key={label} className="border-b border-[hsl(var(--border))]/50 last:border-0">
                                            <td className="py-3.5 pl-7 pr-4 text-sm text-[hsl(var(--foreground))]">{label}</td>
                                            <td className="py-3.5 px-4 text-center text-sm text-[hsl(var(--muted-foreground))]">
                                                <Cell v={free} />
                                            </td>
                                            <td className="py-3.5 px-4 text-center text-sm text-[hsl(var(--foreground))] font-medium">
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
                <section className="relative overflow-hidden border-t border-[hsl(var(--border))]/60 px-6 py-24 text-center">
                    <div
                        className="pointer-events-none absolute inset-0 -z-10"
                        style={{
                            background: "radial-gradient(ellipse 60% 80% at 50% 120%, hsl(var(--primary) / 0.08), transparent)",
                        }}
                    />
                    <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--foreground))] mb-3">
                        Try it before you decide.
                    </h2>
                    <p className="text-[hsl(var(--muted-foreground))] mb-8 max-w-sm mx-auto leading-relaxed">
                        The Free plan is real — not a 14-day trial. Upgrade only when you need more.
                    </p>
                    <Button size="lg" className="px-10 text-base" asChild>
                        <Link href="/register">Create your free account</Link>
                    </Button>
                </section>

            </main>
        </div>
    );
}
