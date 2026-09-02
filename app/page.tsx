"use client";

import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { Check, Minus, ArrowRight, Video, Globe, CalendarCheck, Link2, Mic, PhoneOff } from "lucide-react";
import { Eyebrow } from "@/src/components/ui/Eyebrow";
import { LandingHeader } from "@/src/components/ui/LandingHeader";
import { SiteFooter } from "@/src/components/ui/SiteFooter";

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
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/brand/demo-host-jane.webp"
                            alt=""
                            width={36}
                            height={36}
                            className="size-9 shrink-0 rounded-full object-cover ring-1 ring-[hsl(var(--border))]"
                        />
                        <div>
                            <p className="text-sm font-semibold text-[hsl(var(--foreground))] leading-tight">Jane Smith</p>
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">Business Coach</p>
                        </div>
                    </div>
                    <div className="mt-3">
                        <p className="text-sm font-semibold text-[hsl(var(--foreground))]">60-min Strategy Session</p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                            <Video className="size-3 shrink-0" />
                            <span>Video call included</span>
                        </div>
                    </div>
                </div>
                <div className="px-5 py-4">
                    <div className="mb-3 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-bold tracking-tight text-[hsl(var(--foreground))]">October 2026</p>
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
                        <p className="text-xs font-semibold text-[hsl(var(--foreground))]">Wed, Oct 7</p>
                        <span className="rounded-full bg-[hsl(var(--primary)/0.1)] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--primary))]">5 slots</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 mb-4">
                        {MOCK_SLOTS.map(({ time, active, muted }) => (
                            <span key={time} className={`text-center text-[11px] py-2 rounded-lg border font-medium ${
                                active ? "border-transparent bg-[hsl(var(--primary))] text-white shadow-[0_4px_12px_-3px_hsl(var(--primary)/0.45)]"
                                : muted ? "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]/45"
                                : "border-[hsl(var(--border))] bg-transparent text-[hsl(var(--foreground))]"
                            }`}>{time}</span>
                        ))}
                    </div>
                    <div className="w-full rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] py-2.5 text-center text-xs font-semibold">
                        Confirm booking
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
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-2))]/60 sm:px-4">
                <span className="truncate text-[10px] sm:text-[11px] text-[hsl(var(--muted-foreground))] font-medium">getsessionly.com/room/abc-defg</span>
                <span className="flex shrink-0 items-center gap-1.5 text-[10px] sm:text-[11px] font-medium text-emerald-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live
                </span>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 bg-[hsl(var(--background))]">
                <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-[hsl(var(--surface-3))]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src="/brand/demo-host-jane.webp"
                        alt=""
                        width={48}
                        height={48}
                        className="size-12 rounded-full object-cover ring-2 ring-[hsl(var(--surface))]/70"
                    />
                    <div className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white">Jane</div>
                    <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-black/40 flex items-center justify-center">
                        <Mic className="size-2.5 text-white" />
                    </div>
                </div>
                <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-[hsl(var(--surface-2))]">
                    <div className="font-display flex size-12 items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-base text-[hsl(var(--secondary-foreground))]">AC</div>
                    <div className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-0.5 text-[10px] text-white font-medium">Alex</div>
                    <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-black/40 flex items-center justify-center">
                        <Mic className="size-2.5 text-white" />
                    </div>
                </div>
            </div>
            <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-[hsl(var(--border))] bg-[hsl(var(--surface-2))]/40">
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

// Sessionly has no users yet, so it has no testimonials. This strip runs in
// their place: the same three columns, saying what actually works instead of
// quoting people who do not exist. Keep it accurate or delete it.
const STATUS = [
    {
        label: "Working now",
        body: "Booking page on your own URL, availability read from your Google Calendar, and a private video room for every confirmed booking. Free to use.",
    },
    {
        label: "Being built",
        body: "Paid sessions. The price field exists and the booking flow refuses it on purpose, because taking money before the payout path is finished would be worse than waiting.",
    },
    {
        label: "Not started",
        body: "Teams. One account for several people with shared booking pages. There is nothing behind this yet and the pricing page says so.",
    },
];

// Published so the eventual price is not a surprise, not so it can be bought.
// Nothing here is billable: internal/plans/plans.go carries the same numbers and
// its own comment says billing is not wired. Keep the two in step.
const PLANNED_TIERS = [
    {
        name: "Solo",
        price: "$12",
        blurb: "Needs billing and paid sessions. Neither is finished.",
        features: ["Unlimited booking pages", "Unlimited bookings", "Charge for a session", "Custom booking URL"],
    },
    {
        name: "Teams",
        price: "$29",
        blurb: "Nothing built yet. No team accounts exist in the product.",
        features: ["Everything in Solo", "Up to 5 team members", "Shared booking pages", "Priority support"],
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
        title: "Client picks a time",
        body: "They visit your link and choose a slot in their own timezone. Both of you get a confirmation email with the room link in it.",
    },
    {
        n: "03",
        title: "Show up, the room is already open",
        body: "One click opens the private video room. No app to install, no account for your client to create.",
    },
];

function LandingPage() {
    return (
        <div>
            <LandingHeader />

            {/* ── Hero ─────────────────────────────────────────────────────── */}
            <section className="relative overflow-hidden px-5 pb-14 pt-10 sm:px-6 sm:pb-20 sm:pt-16">
                <div
                    className="pointer-events-none absolute inset-0 -z-10"
                    style={{ backgroundImage: "repeating-linear-gradient(0deg, hsl(var(--foreground) / 0.02) 0px, hsl(var(--foreground) / 0.02) 1px, transparent 1px, transparent 4px)" }}
                />
                {/* Asymmetric on purpose: 7/5 rather than a centred 50/50, so the
                    headline owns the page and the product shot sits as evidence
                    beside it rather than competing with it. */}
                <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-10">
                    <div className="lg:col-span-7">
                        <Eyebrow>For coaches, consultants and therapists</Eyebrow>
                        <h1 className="mt-7 font-display text-[clamp(2.75rem,8.5vw,5.5rem)] font-normal leading-[0.95] text-[hsl(var(--foreground))]">
                            Book clients.<br />
                            Meet online.<br />
                            <span className="text-[hsl(var(--primary))]">One link.</span>
                        </h1>
                        <p className="mt-7 max-w-md text-[1.0625rem] leading-relaxed text-[hsl(var(--muted-foreground))]">
                            Your client picks a time on your page and joins the video call from
                            the confirmation email. No app to install, no account to create.
                        </p>
                        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                            <Button size="lg" className="w-full px-7 text-base sm:w-auto" asChild>
                                <Link href="/register">Create your page free <ArrowRight className="size-4" /></Link>
                            </Button>
                            <Button variant="ghost" size="lg" className="w-full text-base sm:w-auto" asChild>
                                <Link href="/pricing">See pricing</Link>
                            </Button>
                        </div>
                        {/* Beta status is the sharpest true thing on the page, so it is
                            set as type under a rule rather than hidden in a chip. The
                            paid plans are not chargeable yet; saying so here costs
                            nothing and keeps the page level with /terms. */}
                        <div className="mt-9 max-w-md border-t border-[hsl(var(--border))] pt-4 text-sm">
                            <span className="font-medium text-[hsl(var(--foreground))]">Free while we&apos;re in beta.</span>
                            <span className="mx-2.5 text-[hsl(var(--border))]">/</span>
                            <span className="text-[hsl(var(--muted-foreground))]">No card, no paid plan to buy yet.</span>
                        </div>
                    </div>
                    <div className="flex w-full justify-center lg:col-span-5 lg:justify-end">
                        <BookingMockup />
                    </div>
                </div>
            </section>

            {/* ── Where the product actually is ────────────────────────────── */}
            <section className="border-t border-[hsl(var(--border))] px-5 py-12 sm:px-6 sm:py-16">
                <div className="mx-auto max-w-5xl">
                    <Eyebrow index={1}>Where Sessionly is today</Eyebrow>
                    {/* Rules, not cards. Dividers let the three states read as one
                        continuous statement rather than three competing claims. */}
                    <div className="mt-8 grid grid-cols-1 divide-y divide-[hsl(var(--border))] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                        {STATUS.map(({ label, body }) => (
                            <div key={label} className="flex flex-col gap-2.5 py-6 sm:px-6 sm:py-2 sm:first:pl-0 sm:last:pr-0">
                                <p className="label-caps text-[hsl(var(--primary))]">{label}</p>
                                <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{body}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Features bento ───────────────────────────────────────────── */}
            <section id="features" className="border-t border-[hsl(var(--border))] px-5 py-16 sm:px-6 sm:py-24 lg:py-28">
                <div className="mx-auto max-w-5xl">
                    <div className="mb-10 sm:mb-12">
                        <Eyebrow index={2}>What you get</Eyebrow>
                        <h2 className="font-display mt-6 max-w-xl text-[2rem] font-normal leading-[1.05] text-[hsl(var(--foreground))] sm:text-[2.75rem]">
                            Replace two tools with one
                        </h2>
                        <p className="mt-3 max-w-sm text-[hsl(var(--muted-foreground))]">
                            A scheduling link and a video app, in one place, on one URL.
                        </p>
                    </div>

                    {/* Spotlight card: video room */}
                    <div className="app-panel rounded-2xl p-5 sm:p-7 mb-4 grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 items-center">
                        <div className="order-2 lg:order-1">
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] mb-4">
                                <Video className="h-5 w-5" />
                            </div>
                            <h3 className="text-xl font-bold text-[hsl(var(--foreground))] mb-2 leading-snug">
                                Private video room, no Zoom needed
                            </h3>
                            <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed mb-4">
                                Every booking gets its own private video room. Your client clicks the link in their confirmation email and they&apos;re in. No app, no account, no setup.
                            </p>
                            <ul className="flex flex-col gap-2 text-sm">
                                {[
                                    "Works in any browser, on any device",
                                    "HD video powered by Cloudflare edge",
                                    "Each room belongs to one booking, not a standing link",
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
                                body: "Share your booking page URL. Clients pick a time, get a confirmation email, and join from the room link inside it.",
                            },
                            {
                                icon: Globe,
                                title: "Slots in their timezone",
                                body: "Your availability is stored in your timezone and rendered in theirs. Nobody does the arithmetic and nobody shows up an hour late.",
                            },
                            {
                                icon: CalendarCheck,
                                title: "Real availability, always",
                                body: "Connect Google Calendar and your busy hours stop being offered as slots. If Google is unreachable we still show your availability rather than take the page down, so that is the one window where a clash can slip through.",
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

                    {/* Paid sessions are the most-asked-for thing and the least
                        finished. Naming that here is cheaper than letting someone
                        discover it at the booking form. */}
                    <p className="mt-6 text-sm text-[hsl(var(--muted-foreground))]">
                        <span className="font-medium text-[hsl(var(--foreground))]">Paid sessions are in development.</span>{" "}
                        You cannot charge a client through Sessionly yet, and we do not touch money that moves
                        between you and them. Everything above is free to use in the meantime.
                    </p>
                </div>
            </section>

            {/* ── How it works ─────────────────────────────────────────────── */}
            <section id="how-it-works" className="border-t border-[hsl(var(--border))] px-5 py-16 sm:px-6 sm:py-24 lg:py-28">
                <div className="mx-auto max-w-4xl">
                    <div className="text-center mb-10 sm:mb-14">
                        <Eyebrow index={3}>Simple by design</Eyebrow>
                        <h2 className="font-display mt-6 text-[2rem] font-normal leading-[1.05] text-[hsl(var(--foreground))] sm:text-[2.75rem]">
                            Up and running in minutes
                        </h2>
                    </div>
                    <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-8">
                        {/* Dashed connector, desktop only */}
                        <div className="hidden sm:block absolute top-7 left-[calc(16.66%+1rem)] right-[calc(16.66%+1rem)] h-px border-t border-dashed border-[hsl(var(--border))]" />
                        {STEPS.map(({ n, title, body }) => (
                            <div key={n} className="relative flex flex-col items-center sm:items-start text-center sm:text-left">
                                <div className="relative z-10 mb-5 flex size-12 items-center justify-center border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
                                    <span className="font-display text-xl text-[hsl(var(--primary))]">{n}</span>
                                </div>
                                <p className="font-semibold text-[hsl(var(--foreground))] mb-2 text-base">{title}</p>
                                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed max-w-xs sm:max-w-none">{body}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Pricing preview ───────────────────────────────────────────── */}
            <section className="border-t border-[hsl(var(--border))] px-5 py-16 sm:px-6 sm:py-24 lg:py-28">
                <div className="mx-auto max-w-5xl">
                    <div className="mb-10 sm:mb-12">
                        <Eyebrow index={4}>Pricing</Eyebrow>
                        <h2 className="font-display mt-6 text-[2rem] font-normal leading-[1.05] text-[hsl(var(--foreground))] sm:text-[2.75rem]">
                            One plan works. Two are on paper.
                        </h2>
                        <p className="mt-3 max-w-lg text-[hsl(var(--muted-foreground))]">
                            Free is the only plan you can be on right now. Solo and Teams are what we
                            intend to charge, published early so the price is not a surprise later.
                            Neither is billable and neither is built.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                        <div className="app-panel rounded-2xl p-6 flex flex-col">
                            <div className="flex items-center justify-between">
                                <p className="label-caps text-[hsl(var(--muted-foreground))]">Free</p>
                                <span className="rounded-full bg-[hsl(var(--primary))]/10 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[hsl(var(--primary))]">Available now</span>
                            </div>
                            <div className="mt-3 flex items-end gap-1">
                                <span className="text-3xl font-bold text-[hsl(var(--foreground))]">$0</span>
                                <span className="pb-0.5 text-sm text-[hsl(var(--muted-foreground))]">while in beta</span>
                            </div>
                            <ul className="mt-5 flex flex-col gap-2.5 flex-1 text-sm">
                                {["1 booking page", "10 bookings a month", "Video calls included", "Google Calendar sync"].map(f => (
                                    <li key={f} className="flex items-center gap-2 text-[hsl(var(--foreground))]">
                                        <Check className="size-4 text-[hsl(var(--primary))] shrink-0" />{f}
                                    </li>
                                ))}
                            </ul>
                            <Button variant="outline" size="sm" className="mt-6 w-full" asChild>
                                <Link href="/register">Get started</Link>
                            </Button>
                        </div>
                        {PLANNED_TIERS.map(({ name, price, blurb, features }) => (
                            <div key={name} className="app-panel rounded-2xl p-6 flex flex-col">
                                <div className="flex items-center justify-between">
                                    <p className="label-caps text-[hsl(var(--muted-foreground))]">{name}</p>
                                    <span className="rounded-full border border-[hsl(var(--border))] px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Later</span>
                                </div>
                                <div className="mt-3 flex items-end gap-1">
                                    <span className="text-3xl font-bold text-[hsl(var(--muted-foreground))]">{price}</span>
                                    <span className="pb-0.5 text-sm text-[hsl(var(--muted-foreground))]">/ month</span>
                                </div>
                                <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{blurb}</p>
                                <ul className="mt-5 flex flex-col gap-2.5 flex-1 text-sm">
                                    {features.map(f => (
                                        <li key={f} className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
                                            <Minus className="size-4 shrink-0 text-[hsl(var(--muted-foreground))]/50" />{f}
                                        </li>
                                    ))}
                                </ul>
                                <Button variant="outline" size="sm" className="mt-6 w-full" disabled>
                                    Not available yet
                                </Button>
                            </div>
                        ))}
                    </div>
                    <p className="text-center text-sm text-[hsl(var(--muted-foreground))]">
                        <Link href="/pricing" className="link">See full plan comparison →</Link>
                    </p>
                </div>
            </section>

            {/* ── Footer CTA ────────────────────────────────────────────────── */}
            <section className="border-t border-[hsl(var(--border))] px-5 py-16 sm:px-6 sm:py-24 text-center relative overflow-hidden">
                <div
                    className="pointer-events-none absolute inset-0 -z-10"
                    style={{ backgroundImage: "repeating-linear-gradient(0deg, hsl(var(--foreground) / 0.02) 0px, hsl(var(--foreground) / 0.02) 1px, transparent 1px, transparent 4px)" }}
                />
                <h2 className="font-display mb-5 text-[2rem] font-normal leading-[1.05] text-[hsl(var(--foreground))] sm:text-[2.75rem]">
                    Your booking page is<br className="hidden sm:block" /> two minutes away.
                </h2>
                <p className="text-[hsl(var(--muted-foreground))] mb-7 max-w-sm mx-auto">
                    Free while we&apos;re in beta. No credit card, because there is nothing to charge you for yet.
                </p>
                <Button size="lg" className="w-full max-w-xs px-10 text-base sm:w-auto" asChild>
                    <Link href="/register">Create your free account</Link>
                </Button>
            </section>

            <SiteFooter />
        </div>
    );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function Home() {
    return <LandingPage />;
}
