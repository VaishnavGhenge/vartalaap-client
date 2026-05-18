"use client";

import { Button } from "@/src/components/ui/button";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/src/hooks/use-auth";
import { Check, ArrowRight, Video, CreditCard, CalendarCheck, Link2, Mic, PhoneOff } from "lucide-react";
import { LandingHeader } from "@/src/components/ui/LandingHeader";

// ─── Booking mockup ───────────────────────────────────────────────────────────

const MOCK_DAYS = [
    { d: null }, { d: null }, { d: null }, { d: 1, muted: true }, { d: 2, muted: true }, { d: 3, muted: true }, { d: 4, muted: true },
    { d: 5, muted: true }, { d: 6, muted: true }, { d: 7, active: true }, { d: 8 }, { d: 9 }, { d: 10 }, { d: 11 },
    { d: 12 }, { d: 13 }, { d: 14 }, { d: 15 }, { d: 16 }, { d: 17 }, { d: 18, muted: true },
    { d: 19 }, { d: 20 }, { d: 21 }, { d: 22 }, { d: 23 }, { d: 24 }, { d: 25, muted: true },
    { d: 26 }, { d: 27 }, { d: 28 }, { d: 29 }, { d: 30 }, { d: 31 }, { d: null },
];

const MOCK_SLOTS = [
    { time: "9:00 AM" },
    { time: "10:30 AM", active: true },
    { time: "12:00 PM" },
    { time: "2:00 PM" },
    { time: "3:30 PM" },
    { time: "5:00 PM", muted: true },
];

function BookingMockup() {
    return (
        <div className="relative w-full max-w-[300px] sm:max-w-[340px]" aria-hidden="true">
            <div className="absolute -inset-4 sm:-inset-8 rounded-3xl bg-[hsl(var(--primary))]/8 blur-2xl -z-10" />
            <div className="w-full rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl overflow-hidden">
                <div className="px-5 pt-5 pb-4 border-b border-[hsl(var(--border))]">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full shrink-0 flex items-center justify-center bg-gradient-to-br from-[hsl(var(--primary))] to-violet-500 text-white font-semibold text-sm">JS</div>
                        <div>
                            <p className="text-sm font-semibold text-[hsl(var(--foreground))] leading-tight">Jane Smith</p>
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">Business Coach</p>
                        </div>
                    </div>
                    <div className="mt-3">
                        <p className="text-sm font-semibold text-[hsl(var(--foreground))]">60-min Strategy Session</p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                            <Video className="size-3 shrink-0" />
                            <span>Video call included · $75</span>
                        </div>
                    </div>
                </div>
                <div className="px-5 py-4">
                    <div className="mb-3 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-bold tracking-tight text-[hsl(var(--foreground))]">May 2025</p>
                            <p className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">Times shown in your timezone</p>
                        </div>
                        <div className="flex gap-0.5">
                            <span className="flex size-6 items-center justify-center rounded-full text-xs text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))]">‹</span>
                            <span className="flex size-6 items-center justify-center rounded-full text-xs text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))]">›</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-7 mb-1">
                        {["M","T","W","T","F","S","S"].map((d, i) => (
                            <div key={i} className="text-[9px] text-center text-[hsl(var(--muted-foreground))] font-semibold py-1">{d}</div>
                        ))}
                    </div>
                    <div className="mb-4 grid grid-cols-7 gap-0.5">
                        {MOCK_DAYS.map(({ d, active, muted }, i) => (
                            <div key={i} className={`relative flex aspect-square flex-col items-center justify-center rounded-full text-[11px] leading-none ${
                                !d ? "" :
                                active ? "bg-[hsl(var(--primary))] text-white font-semibold shadow-[0_4px_14px_-4px_hsl(var(--primary)/0.45)]" :
                                muted ? "text-[hsl(var(--muted-foreground))]/30" :
                                "text-[hsl(var(--foreground))]"
                            }`}>
                                {d || ""}
                                {d && !active && !muted && (
                                    <span className="absolute bottom-[3px] left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-[hsl(var(--primary))]" />
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold text-[hsl(var(--foreground))]">Wed, May 7</p>
                        <span className="rounded-full bg-[hsl(var(--primary)/0.1)] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--primary))]">5 slots</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 mb-4">
                        {MOCK_SLOTS.map(({ time, active, muted }) => (
                            <span key={time} className={`text-center text-[11px] py-2 rounded-lg border font-medium ${
                                active ? "border-transparent bg-[hsl(var(--primary))] text-white shadow-[0_4px_12px_-3px_hsl(var(--primary)/0.45)]"
                                : muted ? "border-[hsl(var(--border))]/60 text-[hsl(var(--muted-foreground))]/45"
                                : "border-[hsl(var(--border))] bg-transparent text-[hsl(var(--foreground))]"
                            }`}>{time}</span>
                        ))}
                    </div>
                    <div className="w-full rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] py-2.5 text-center text-xs font-semibold">
                        Pay $75 and confirm
                    </div>
                    <p className="mt-2.5 text-center text-[9px] text-[hsl(var(--muted-foreground))]/50">Powered by Sessionly</p>
                </div>
            </div>
        </div>
    );
}

// ─── Video room mockup ────────────────────────────────────────────────────────

function VideoRoomMockup() {
    return (
        <div className="relative w-full rounded-xl overflow-hidden border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-xl" aria-hidden="true">
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-[hsl(var(--border))]/60 bg-[hsl(var(--surface-2))]/60 sm:px-4">
                <span className="truncate text-[10px] sm:text-[11px] text-[hsl(var(--muted-foreground))] font-medium">getsessionly.com/room/abc-defg</span>
                <span className="flex shrink-0 items-center gap-1.5 text-[10px] sm:text-[11px] font-medium text-emerald-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live
                </span>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 bg-[hsl(var(--background))]">
                <div className="relative aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-[hsl(var(--surface-2))] to-[hsl(var(--surface-3))] flex items-center justify-center">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[hsl(var(--primary))] to-violet-500 flex items-center justify-center text-white font-semibold text-sm">JS</div>
                    <div className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-0.5 text-[10px] text-white font-medium">Jane</div>
                    <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-black/40 flex items-center justify-center">
                        <Mic className="size-2.5 text-white" />
                    </div>
                </div>
                <div className="relative aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-indigo-900/30 to-violet-900/30 flex items-center justify-center">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white font-semibold text-sm">AC</div>
                    <div className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-0.5 text-[10px] text-white font-medium">Alex</div>
                    <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-black/40 flex items-center justify-center">
                        <Mic className="size-2.5 text-white" />
                    </div>
                </div>
            </div>
            <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-[hsl(var(--border))]/60 bg-[hsl(var(--surface-2))]/40">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--surface-3))] text-[hsl(var(--foreground))]">
                    <Mic className="size-4" />
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--surface-3))] text-[hsl(var(--foreground))]">
                    <Video className="size-4" />
                </div>
                <div className="flex h-9 items-center justify-center gap-1.5 rounded-full bg-red-500/90 px-3 text-white text-xs font-semibold">
                    <PhoneOff className="size-3.5" /> Leave
                </div>
            </div>
        </div>
    );
}

// ─── Testimonials ─────────────────────────────────────────────────────────────

const TESTIMONIALS = [
    {
        quote: "I cancelled Calendly and Zoom the same day. Sessionly handles both for less than half the price.",
        name: "Sarah M.",
        role: "Executive Coach",
        avatar: "SM",
        color: "from-rose-500 to-pink-500",
    },
    {
        quote: "My clients love that they can book, pay, and join the call from one link. Zero friction.",
        name: "David K.",
        role: "Business Consultant",
        avatar: "DK",
        color: "from-amber-500 to-orange-500",
    },
    {
        quote: "Setup took 5 minutes. I shared my link that afternoon and had my first booking that evening.",
        name: "Priya N.",
        role: "Career Therapist",
        avatar: "PN",
        color: "from-teal-500 to-emerald-500",
    },
];

const STEPS = [
    {
        n: "01",
        title: "Create your booking page",
        body: "Set your availability, add your services, pick a URL. Done in under two minutes.",
    },
    {
        n: "02",
        title: "Client picks a time and pays",
        body: "They visit your link, choose a slot, and pay if you've set a price. You get a confirmation instantly.",
    },
    {
        n: "03",
        title: "Show up — room is already open",
        body: "One click opens the private video room. No app to install, no account for your client to create.",
    },
];

function LandingPage() {
    return (
        <div style={{ fontFamily: "var(--font-jakarta, system-ui)" }}>
            <LandingHeader />

            {/* ── Hero ─────────────────────────────────────────────────────── */}
            <section className="relative overflow-hidden px-5 pb-14 pt-10 sm:px-6 sm:pb-20 sm:pt-16">
                <div
                    className="pointer-events-none absolute inset-0 -z-10"
                    style={{ background: "radial-gradient(ellipse 80% 50% at 50% -8%, hsl(var(--primary) / 0.13), transparent 68%)" }}
                />
                <div className="mx-auto flex max-w-6xl flex-col gap-10 lg:flex-row lg:items-center lg:gap-12">
                    <div className="w-full max-w-xl flex-1 text-left">
                        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-1.5 text-[11px] sm:text-xs text-[hsl(var(--muted-foreground))] shadow-sm">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            For coaches, consultants, and therapists
                        </div>
                        <h1 className="font-[var(--font-montserrat)] text-[clamp(2.25rem,9vw,5rem)] font-bold leading-[1.05] tracking-tight text-[hsl(var(--foreground))]">
                            Book clients.<br />Meet online.<br />Get paid.
                        </h1>
                        <p className="mt-5 max-w-md text-base leading-relaxed text-[hsl(var(--muted-foreground))] sm:text-[1.05rem]">
                            One link. Your client picks a time, joins the video call, and pays — all without leaving your page.
                        </p>
                        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                            <Button size="lg" className="w-full sm:w-auto px-7 text-base" asChild>
                                <Link href="/register">Create your page free <ArrowRight className="size-4" /></Link>
                            </Button>
                            <Button variant="outline" size="lg" className="w-full sm:w-auto text-base" asChild>
                                <Link href="/pricing">See pricing</Link>
                            </Button>
                        </div>
                        {/* Comparison strip — centered on mobile (matches full-width buttons), left-aligned from sm+ (matches auto-width buttons) */}
                        <div className="mt-6 flex justify-center sm:justify-start">
                            <div className="inline-flex flex-col items-center gap-1 rounded-xl border border-[hsl(var(--border))]/80 bg-[hsl(var(--surface-2))]/60 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-3">
                                <span className="text-[hsl(var(--muted-foreground))]/70 line-through">Calendly + Zoom — $25/mo</span>
                                <span className="hidden text-[hsl(var(--border))] sm:inline">→</span>
                                <span className="font-semibold text-[hsl(var(--foreground))]">Sessionly — $12/mo</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex w-full flex-1 justify-center lg:justify-end">
                        <BookingMockup />
                    </div>
                </div>
            </section>

            {/* ── Social proof ─────────────────────────────────────────────── */}
            <section className="border-t border-[hsl(var(--border))]/60 px-5 py-12 sm:px-6 sm:py-16">
                <div className="mx-auto max-w-5xl">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        {TESTIMONIALS.map(({ quote, name, role, avatar, color }) => (
                            <div key={name} className="app-panel rounded-2xl p-5 sm:p-6 flex flex-col gap-4">
                                <p className="text-sm leading-relaxed text-[hsl(var(--foreground))] flex-1">
                                    &ldquo;{quote}&rdquo;
                                </p>
                                <div className="flex items-center gap-2.5">
                                    <div className={`h-8 w-8 rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white text-xs font-semibold shrink-0`}>
                                        {avatar}
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-[hsl(var(--foreground))] leading-tight">{name}</p>
                                        <p className="text-xs text-[hsl(var(--muted-foreground))]">{role}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Features bento ───────────────────────────────────────────── */}
            <section id="features" className="border-t border-[hsl(var(--border))]/60 px-5 py-16 sm:px-6 sm:py-24 lg:py-28">
                <div className="mx-auto max-w-5xl">
                    <div className="text-center mb-10 sm:mb-12">
                        <p className="label-caps text-[hsl(var(--primary))] mb-2">What you get</p>
                        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[hsl(var(--foreground))] leading-tight">
                            Replace two tools with one
                        </h2>
                        <p className="mt-3 text-[hsl(var(--muted-foreground))] max-w-sm mx-auto">
                            Stop paying for Calendly and Zoom separately. Sessionly does both.
                        </p>
                    </div>

                    {/* Spotlight card: video room */}
                    <div className="app-panel rounded-2xl p-5 sm:p-7 mb-4 grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 items-center">
                        <div className="order-2 lg:order-1">
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] mb-4">
                                <Video className="h-5 w-5" />
                            </div>
                            <h3 className="text-xl font-bold text-[hsl(var(--foreground))] mb-2 leading-snug">
                                Private video room — no Zoom needed
                            </h3>
                            <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed mb-4">
                                Every booking gets its own private video room. Your client clicks the link in their confirmation email and they&apos;re in — no app, no account, no setup.
                            </p>
                            <ul className="flex flex-col gap-2 text-sm">
                                {[
                                    "Works in any browser, on any device",
                                    "HD video powered by Cloudflare edge",
                                    "Room disappears after the session ends",
                                ].map(f => (
                                    <li key={f} className="flex items-start gap-2 text-[hsl(var(--foreground))]">
                                        <Check className="size-4 text-[hsl(var(--primary))] shrink-0 mt-0.5" />{f}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="order-1 lg:order-2">
                            <VideoRoomMockup />
                        </div>
                    </div>

                    {/* 3 secondary features */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {[
                            {
                                icon: Link2,
                                title: "One link for everything",
                                body: "Share your booking page URL. Clients pick a time, pay if required, and get a room link — all in one place.",
                            },
                            {
                                icon: CreditCard,
                                title: "Collect payment upfront",
                                body: "Set a price on any service. Payment is collected at booking — no chasing invoices after the call.",
                            },
                            {
                                icon: CalendarCheck,
                                title: "Real availability, always",
                                body: "Connect Google Calendar and Sessionly reads your schedule automatically. Double-booking becomes impossible.",
                            },
                        ].map(({ icon: Icon, title, body }) => (
                            <div key={title} className="app-panel rounded-2xl p-5 sm:p-6 flex flex-col gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
                                    <Icon className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="font-semibold text-[hsl(var(--foreground))] mb-1">{title}</p>
                                    <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">{body}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── How it works ─────────────────────────────────────────────── */}
            <section id="how-it-works" className="border-t border-[hsl(var(--border))]/60 px-5 py-16 sm:px-6 sm:py-24 lg:py-28">
                <div className="mx-auto max-w-4xl">
                    <div className="text-center mb-10 sm:mb-14">
                        <p className="label-caps text-[hsl(var(--primary))] mb-2">Simple by design</p>
                        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[hsl(var(--foreground))] leading-tight">
                            Up and running in minutes
                        </h2>
                    </div>
                    <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-8">
                        {/* Dashed connector — desktop only */}
                        <div className="hidden sm:block absolute top-7 left-[calc(16.66%+1rem)] right-[calc(16.66%+1rem)] h-px border-t border-dashed border-[hsl(var(--border))]" />
                        {STEPS.map(({ n, title, body }) => (
                            <div key={n} className="relative flex flex-col items-center sm:items-start text-center sm:text-left">
                                <div className="relative z-10 mb-4 sm:mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
                                    <span className="text-lg font-bold text-[hsl(var(--primary))]">{n}</span>
                                </div>
                                <p className="font-semibold text-[hsl(var(--foreground))] mb-2 text-base">{title}</p>
                                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed max-w-xs sm:max-w-none">{body}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Pricing preview ───────────────────────────────────────────── */}
            <section className="border-t border-[hsl(var(--border))]/60 px-5 py-16 sm:px-6 sm:py-24 lg:py-28">
                <div className="mx-auto max-w-5xl">
                    <div className="text-center mb-10 sm:mb-12">
                        <p className="label-caps text-[hsl(var(--primary))] mb-2">Pricing</p>
                        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[hsl(var(--foreground))] leading-tight">
                            Honest pricing. No surprises.
                        </h2>
                        <p className="mt-3 text-[hsl(var(--muted-foreground))]">
                            We don&apos;t take a cut of what your clients pay you.
                        </p>
                    </div>
                    {/* Popular plan first on mobile so the recommended choice is above the fold; restored to middle on sm+ */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                        <div className="app-panel rounded-2xl p-6 flex flex-col order-2 sm:order-1">
                            <p className="label-caps text-[hsl(var(--muted-foreground))]">Free</p>
                            <div className="mt-3 flex items-end gap-1">
                                <span className="text-3xl font-bold text-[hsl(var(--foreground))]">$0</span>
                                <span className="pb-0.5 text-sm text-[hsl(var(--muted-foreground))]">forever</span>
                            </div>
                            <ul className="mt-5 flex flex-col gap-2.5 flex-1 text-sm">
                                {["1 booking page", "10 bookings / mo", "Video calls included"].map(f => (
                                    <li key={f} className="flex items-center gap-2 text-[hsl(var(--foreground))]">
                                        <Check className="size-4 text-[hsl(var(--primary))] shrink-0" />{f}
                                    </li>
                                ))}
                            </ul>
                            <Button variant="outline" size="sm" className="mt-6 w-full" asChild>
                                <Link href="/register">Get started</Link>
                            </Button>
                        </div>
                        <div className="rounded-2xl p-6 flex flex-col border-2 border-[hsl(var(--primary))] bg-[hsl(var(--card))] shadow-lg order-1 sm:order-2">
                            <div className="flex items-center justify-between">
                                <p className="label-caps text-[hsl(var(--primary))]">Solo</p>
                                <span className="rounded-full bg-[hsl(var(--primary))]/10 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[hsl(var(--primary))]">Popular</span>
                            </div>
                            <div className="mt-3 flex items-end gap-1">
                                <span className="text-3xl font-bold text-[hsl(var(--foreground))]">$12</span>
                                <span className="pb-0.5 text-sm text-[hsl(var(--muted-foreground))]">/ month</span>
                            </div>
                            <ul className="mt-5 flex flex-col gap-2.5 flex-1 text-sm">
                                {["Unlimited booking pages", "Unlimited bookings", "Accept payments — 0% fee", "Custom booking URL"].map(f => (
                                    <li key={f} className="flex items-center gap-2 text-[hsl(var(--foreground))]">
                                        <Check className="size-4 text-[hsl(var(--primary))] shrink-0" />{f}
                                    </li>
                                ))}
                            </ul>
                            <Button size="sm" className="mt-6 w-full" asChild>
                                <Link href="/register">Start free <ArrowRight className="size-3.5" /></Link>
                            </Button>
                        </div>
                        <div className="app-panel rounded-2xl p-6 flex flex-col order-3">
                            <p className="label-caps text-[hsl(var(--muted-foreground))]">Teams</p>
                            <div className="mt-3 flex items-end gap-1">
                                <span className="text-3xl font-bold text-[hsl(var(--foreground))]">$29</span>
                                <span className="pb-0.5 text-sm text-[hsl(var(--muted-foreground))]">/ month</span>
                            </div>
                            <ul className="mt-5 flex flex-col gap-2.5 flex-1 text-sm">
                                {["Everything in Solo", "Up to 5 team members", "Shared booking pages", "Google Calendar sync"].map(f => (
                                    <li key={f} className="flex items-center gap-2 text-[hsl(var(--foreground))]">
                                        <Check className="size-4 text-[hsl(var(--primary))] shrink-0" />{f}
                                    </li>
                                ))}
                            </ul>
                            <Button variant="outline" size="sm" className="mt-6 w-full" asChild>
                                <Link href="/register">Get started</Link>
                            </Button>
                        </div>
                    </div>
                    <p className="text-center text-sm text-[hsl(var(--muted-foreground))]">
                        <Link href="/pricing" className="link">See full plan comparison →</Link>
                    </p>
                </div>
            </section>

            {/* ── Footer CTA ────────────────────────────────────────────────── */}
            <section className="border-t border-[hsl(var(--border))]/60 px-5 py-16 sm:px-6 sm:py-24 text-center relative overflow-hidden">
                <div
                    className="pointer-events-none absolute inset-0 -z-10"
                    style={{ background: "radial-gradient(ellipse 80% 80% at 50% 120%, hsl(var(--primary) / 0.12), transparent)" }}
                />
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[hsl(var(--foreground))] mb-4 leading-tight">
                    Your booking page is<br className="hidden sm:block" /> two minutes away.
                </h2>
                <p className="text-[hsl(var(--muted-foreground))] mb-7 max-w-sm mx-auto">
                    Free plan, no credit card. Upgrade only when you need more.
                </p>
                <Button size="lg" className="w-full max-w-xs px-10 text-base sm:w-auto" asChild>
                    <Link href="/register">Create your free account</Link>
                </Button>
            </section>
        </div>
    );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function Home() {
    const { isAuthenticated, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && isAuthenticated) router.replace("/dashboard");
    }, [isAuthenticated, isLoading, router]);

    if (isLoading) return <div className="flex min-h-dvh flex-col" />;
    if (isAuthenticated) return <div className="flex min-h-dvh flex-col" />;

    return <LandingPage />;
}
