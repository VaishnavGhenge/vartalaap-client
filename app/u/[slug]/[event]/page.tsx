"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MailCheck, Video } from "lucide-react";

import { BufferingButtonLabel } from "@/src/components/ui/BufferingButtonLabel";
import { Button } from "@/src/components/ui/button";
import { FormError } from "@/src/components/ui/FormError";
import { InlineNotice } from "@/src/components/ui/InlineNotice";
import { Input } from "@/src/components/ui/input";
import { StandaloneHeader } from "@/src/components/ui/StandaloneHeader";
import { useSlotHold } from "@/src/hooks/use-slot-hold";
import { PoweredBy } from "@/src/components/ui/PoweredBy";
import { SmallCaps } from "@/src/components/ui/SmallCaps";
import { Avatar } from "@/src/components/ui/Avatar";
import { cn } from "@/src/lib/utils";
import {
    PublicApiError,
    createBooking,
    getPublicEvent,
    listSlots,
    type PublicEventResponse,
} from "@/src/services/api/public";
import { use } from "react";

interface PageProps {
    params: Promise<{ slug: string; event: string }>;
}

export default function PublicEventPage({ params }: PageProps) {
    const { slug, event: eventSlug } = use(params);
    const router = useRouter();

    const [meta, setMeta] = useState<PublicEventResponse | null>(null);
    const [metaError, setMetaError] = useState<string | null>(null);
    const [slots, setSlots] = useState<string[] | null>(null);
    const [slotsStale, setSlotsStale] = useState(false);
    // The times on this page are rendered in the VIEWER's timezone, so that is
    // the one to name. Resolved after mount rather than during render: the
    // server has no idea where the guest is, and rendering its own zone first
    // would hydrate into a different string.
    const [viewerTimezone, setViewerTimezone] = useState<string | null>(null);
    const [slotsError, setSlotsError] = useState<string | null>(null);
    const [slotsLoading, setSlotsLoading] = useState(true);

    // The picker shows one calendar month at a time, with prev/next navigating
    // whole months — the familiar Calendly/Google pattern. For the current
    // month we clip the window to start at today (no point listing past days).
    const [monthAnchor, setMonthAnchor] = useState<Date>(() => startOfTodayUTC());
    const today = useMemo(() => startOfTodayUTC(), []);
    const windowStart = useMemo(
        () => maxDate(startOfMonth(monthAnchor), today),
        [monthAnchor, today],
    );
    const windowEnd = useMemo(() => endOfMonth(monthAnchor), [monthAnchor]);
    const [selectedDay, setSelectedDay] = useState<string | null>(null);

    // Slot reservation lifecycle: hook owns the POST /holds + DELETE /holds
    // round-trips so the page stays free of network mechanics.
    const {
        selectedSlot, holdToken, holdError,
        selectSlot, consumeHold,
    } = useSlotHold({ hostSlug: slug, eventTypeSlug: eventSlug });

    const [guestName, setGuestName] = useState("");
    const [guestEmail, setGuestEmail] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    useEffect(() => {
        try {
            setViewerTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
        } catch {
            // Some locked-down browsers throw here. Falling back to no label is
            // better than naming the wrong zone on a booking page.
            setViewerTimezone(null);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        getPublicEvent(slug, eventSlug)
            .then((res) => { if (!cancelled) setMeta(res); })
            .catch((err: unknown) => {
                if (cancelled) return;
                if (err instanceof PublicApiError && err.status === 404) {
                    setMetaError("This event isn't available.");
                } else {
                    setMetaError("Couldn't load this event. Try again.");
                }
            });
        return () => { cancelled = true; };
    }, [slug, eventSlug]);

    useEffect(() => {
        let cancelled = false;
        setSlotsLoading(true);
        setSlotsError(null);
        const from = isoDate(windowStart);
        // Server `to` is exclusive — pass the day after windowEnd.
        const to = isoDate(addDays(windowEnd, 1));
        listSlots(slug, eventSlug, from, to)
            .then((res) => {
                if (cancelled) return;
                setSlots(res.slots);
                setSlotsStale(res.calendarSyncDegraded === true);
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setSlots([]);
                if (err instanceof PublicApiError && err.status === 404) {
                    setSlotsError("This event isn't available.");
                } else {
                    setSlotsError("Couldn't load times. Try again.");
                }
            })
            .finally(() => { if (!cancelled) setSlotsLoading(false); });
        return () => { cancelled = true; };
    }, [slug, eventSlug, windowStart, windowEnd]);

    // Bucket slots by local calendar date so each day gets its own column. We
    // do this in the guest's timezone, not the host's, so "Tuesday at 9am" is
    // shown in the guest's reading of "Tuesday".
    const slotsByDay = useMemo(() => {
        const map = new Map<string, string[]>();
        for (const iso of slots ?? []) {
            const key = isoDate(new Date(iso));
            const list = map.get(key) ?? [];
            list.push(iso);
            map.set(key, list);
        }
        return map;
    }, [slots]);

    // Full month grid (Monday-start). Leading cells before the 1st and
    // trailing cells after the last day are null so the 7-col grid renders
    // a clean rectangle. Each non-null cell carries its slot count + a
    // past-day flag so the renderer doesn't recompute.
    type MonthCell = {
        date: Date;
        key: string;
        dayNum: number;
        count: number;
        isPast: boolean;
    } | null;
    const monthGrid = useMemo<MonthCell[]>(() => {
        const first = startOfMonth(monthAnchor);
        const last = endOfMonth(monthAnchor);
        const leading = (first.getDay() + 6) % 7;
        const cells: MonthCell[] = [];
        for (let i = 0; i < leading; i++) cells.push(null);
        for (let d = 1; d <= last.getDate(); d++) {
            const date = new Date(first.getFullYear(), first.getMonth(), d);
            const key = isoDate(date);
            cells.push({
                date,
                key,
                dayNum: d,
                count: slotsByDay.get(key)?.length ?? 0,
                isPast: date.getTime() < today.getTime(),
            });
        }
        while (cells.length % 7 !== 0) cells.push(null);
        return cells;
    }, [monthAnchor, slotsByDay, today]);

    // When the slot window changes, jump to the first day that has openings so
    // the user always sees times immediately instead of an empty column.
    useEffect(() => {
        if (!slots) return;
        if (slots.length === 0) {
            setSelectedDay(null);
            return;
        }
        for (const cell of monthGrid) {
            if (cell && cell.count > 0 && !cell.isPast) {
                setSelectedDay(cell.key);
                return;
            }
        }
        setSelectedDay(null);
    }, [slots, monthGrid]);

    const selectedDaySlots = selectedDay ? (slotsByDay.get(selectedDay) ?? []) : [];
    const selectedDate = useMemo(() => {
        for (const cell of monthGrid) {
            if (cell && cell.key === selectedDay) return cell.date;
        }
        return null;
    }, [monthGrid, selectedDay]);

    async function handleConfirm(e: React.FormEvent) {
        e.preventDefault();
        if (!selectedSlot) return;
        setSubmitting(true);
        setSubmitError(null);
        // Capture the token now; consumeHold clears local state so the page
        // shows a clean reset on the (rare) error path below.
        const token = consumeHold() ?? undefined;
        try {
            const booking = await createBooking({
                hostSlug: slug,
                eventTypeSlug: eventSlug,
                startsAt: selectedSlot,
                guestName,
                guestEmail,
                holdToken: token,
            });
            setConfirmed(true);
            router.push(`/m/${booking.meetCode}`);
            // Leave submitting=true — navigation is in progress and we're
            // showing the confirmed state. No finally reset on the happy path.
            return;
        } catch (err: unknown) {
            if (err instanceof PublicApiError && err.code === "SLOT_TAKEN") {
                setSubmitError("That time is no longer available. Pick another.");
                listSlots(slug, eventSlug, isoDate(windowStart),
                    isoDate(addDays(windowEnd, 1)))
                    .then((res) => {
                        setSlots(res.slots);
                        setSlotsStale(res.calendarSyncDegraded === true);
                    })
                    .catch(() => { /* keep stale slots */ });
            } else if (err instanceof PublicApiError) {
                setSubmitError(err.message);
            } else {
                setSubmitError("Couldn't confirm. Try again.");
            }
        }
        setSubmitting(false);
    }

    if (metaError) {
        return (
            <Shell>
                <div className="app-panel mx-auto w-full max-w-md rounded-2xl px-6 py-8 text-center">
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">{metaError}</p>
                </div>
            </Shell>
        );
    }

    if (!meta) {
        return (
            <Shell>
                <div className="app-panel mx-auto w-full max-w-md rounded-2xl px-6 py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                    Loading…
                </div>
            </Shell>
        );
    }

    return (
        <Shell>
            <div className="w-full max-w-2xl lg:max-w-3xl">
                {/*
                  Header card matches the landing-page booking mock: avatar +
                  host name on top, then the event title with a Video-icon
                  meta line. Same brand-gradient circle so a guest landing
                  here from the marketing site sees a continuous visual.
                */}
                <header className="border-b border-[hsl(var(--border))] pb-7">
                    <div className="flex items-start gap-4">
                        <Avatar name={meta.host.name} src={meta.host.avatarUrl} size="lg" />
                        <div className="min-w-0 pt-0.5">
                            <Link
                                href={`/u/${meta.host.slug}`}
                                className="transition-colors hover:text-[hsl(var(--primary))]"
                            >
                                <SmallCaps className="text-inherit">{meta.host.name}</SmallCaps>
                            </Link>
                            {/* The session title is the headline of this page. It is what
                                the guest is deciding about, so it gets display type
                                rather than sharing a size with the host's timezone. */}
                            <h1 className="font-display mt-1.5 text-[1.75rem] font-normal leading-[1.1] text-[hsl(var(--foreground))] sm:text-[2.125rem]">
                                {meta.event.title}
                            </h1>
                            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[hsl(var(--muted-foreground))]">
                                <span className="inline-flex items-center gap-1.5">
                                    <Video className="size-3.5 shrink-0" />
                                    {meta.event.durationMin} min video call
                                </span>
                                <span aria-hidden className="text-[hsl(var(--border))]">/</span>
                                {/* The viewer's zone, not the host's. Every time
                                    on this page is rendered in the guest's
                                    locale, so naming the host's zone here (as
                                    this did) put "Asia/Kolkata" above times in
                                    London and gave the guest no way to tell. */}
                                <span>
                                    {viewerTimezone
                                        ? `Times in ${viewerTimezone.replace(/_/g, " ")}`
                                        : "Times in your local timezone"}
                                </span>
                            </div>
                            {meta.event.description && (
                                <p className="mt-3 max-w-prose text-[0.9375rem] leading-relaxed text-[hsl(var(--muted-foreground))]">
                                    {meta.event.description}
                                </p>
                            )}
                        </div>
                    </div>
                </header>

                <section className="mt-6">
                    <div className="pt-1">
                        {/*
                          Below lg the calendar and slot picker stack vertically
                          inside one column (mobile-friendly). At lg+ they split
                          into two: calendar on the left at a sane ~340px, time
                          list on the right. Without the split the day cells
                          inflate to ~85px squares on a wide screen — accurate
                          to the grid but unusable.
                        */}
                            {/* The host connected a calendar but we could not
                                read it, so a listed time may already be taken.
                                Better to say so than to let the guest find out
                                when the host cancels. */}
                            {slotsStale && !slotsError && (
                                <InlineNotice tone="warning" className="mb-5 text-xs">
                                    These times couldn&apos;t be checked against {meta.host.name}&apos;s
                                    calendar just now, so one may already be taken. You&apos;ll get an email
                                    either way.
                                </InlineNotice>
                            )}
                        <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-6">
                            <div>
                                <div className="mb-4 flex items-center justify-between">
                                    <div>
                                        <h2 className="text-[0.9375rem] font-semibold tracking-tight text-[hsl(var(--foreground))]">
                                            {monthAnchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                                        </h2>
                                    </div>
                                    <div className="flex gap-0.5">
                                        <Button
                                            variant="ghost" size="sm"
                                            aria-label="Previous month"
                                            disabled={isSameMonth(monthAnchor, today)}
                                            onClick={() => setMonthAnchor((d) => startOfMonth(addMonths(d, -1)))}
                                            className="size-8 rounded-full p-0"
                                        >
                                            <ChevronLeft className="size-4" />
                                        </Button>
                                        <Button
                                            variant="ghost" size="sm"
                                            aria-label="Next month"
                                            onClick={() => setMonthAnchor((d) => startOfMonth(addMonths(d, 1)))}
                                            className="size-8 rounded-full p-0"
                                        >
                                            <ChevronRight className="size-4" />
                                        </Button>
                                    </div>
                                </div>


                                {slotsError ? (
                                    <div className="py-6 text-center text-sm text-[hsl(var(--destructive))]">
                                        {slotsError}
                                    </div>
                                ) : slotsLoading ? (
                                    <div className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                                        Loading available times…
                                    </div>
                                ) : (
                                    <>
                                        <div className="mb-1 grid grid-cols-7">
                                            {/*
                                              Monday-start week. Two T/S letters
                                              in a row are unavoidable; grid
                                              alignment keeps the columns
                                              readable.
                                            */}
                                            {["M","T","W","T","F","S","S"].map((d, i) => (
                                                <SmallCaps
                                                    key={i}
                                                    size="xs"
                                                    as="div"
                                                    className={cn(
                                                        "py-1 text-center",
                                                        // Weekends are dimmer so a greyed-out 5th and 6th
                                                        // read as "the weekend" rather than "unexplained".
                                                        i >= 5 && "text-[hsl(var(--muted-foreground))]/50",
                                                    )}
                                                >
                                                    {d}
                                                </SmallCaps>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-7 gap-0.5">
                                            {monthGrid.map((cell, i) => {
                                                if (!cell) {
                                                    return <div key={`pad-${i}`} className="aspect-square" />;
                                                }
                                                const { date, key, dayNum, count, isPast } = cell;
                                                const hasSlots = count > 0;
                                                const isSelected = selectedDay === key;
                                                const isToday = key === isoDate(today);
                                                const disabled = isPast || !hasSlots;
                                                const dayLabel = date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
                                                return (
                                                    <button
                                                        key={key}
                                                        type="button"
                                                        disabled={disabled}
                                                        onClick={() => setSelectedDay(key)}
                                                        aria-label={
                                                            disabled
                                                                ? `${dayLabel} — no openings`
                                                                : `${dayLabel} — ${count} ${count === 1 ? "slot" : "slots"} available`
                                                        }
                                                        aria-current={isSelected ? "date" : undefined}
                                                        className={cn(
                                                            "press relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded-full text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/50 disabled:cursor-not-allowed",
                                                            isSelected
                                                                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_4px_14px_-4px_hsl(var(--primary)/0.45)]"
                                                                : isToday && !disabled
                                                                    ? "font-semibold text-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]/50 hover:bg-[hsl(var(--primary)/0.08)]"
                                                                    : disabled
                                                                        ? "text-[hsl(var(--muted-foreground))]/30"
                                                                        : "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--primary))]",
                                                        )}
                                                    >
                                                        {dayNum}
                                                        {hasSlots && !isSelected && !disabled && (
                                                            <span className="absolute bottom-[4px] left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-[hsl(var(--primary))]" />
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {(slots?.length ?? 0) === 0 && (
                                            <p className="mt-4 text-center text-sm text-[hsl(var(--muted-foreground))]">
                                                No times available this month. Try the next one.
                                            </p>
                                        )}
                                    </>
                                )}
                            </div>

                            {/*
                              Slot column. On lg+ this sits to the right of the
                              calendar with a vertical divider; below lg it
                              stacks under with a horizontal divider. Always a
                              grid: three columns in the narrow lg sidebar,
                              four when it stacks full width.
                            */}
                            {selectedDate && selectedDaySlots.length > 0 && (
                                <div className="mt-5 border-t border-[hsl(var(--border))] pt-4 lg:mt-0 lg:max-h-none lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                                    <div className="mb-3 flex items-center justify-between">
                                        <h2 className="text-[0.9375rem] font-semibold tracking-tight text-[hsl(var(--foreground))]">
                                            {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                                        </h2>
                                        <SmallCaps size="xs">
                                            {selectedDaySlots.length} {selectedDaySlots.length === 1 ? "time" : "times"}
                                        </SmallCaps>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">
                                        {selectedDaySlots.map((iso) => (
                                            <button
                                                key={iso}
                                                type="button"
                                                onClick={() => { void selectSlot(iso); }}
                                                className={cn(
                                                    "press w-full cursor-pointer rounded-lg px-1 py-3 text-[0.8125rem] font-medium tabular-nums tracking-tight transition-colors",
                                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/60",
                                                    selectedSlot === iso
                                                        ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                                                        // These are the page's primary action and used to be
                                                        // white on cream behind a near-invisible hairline,
                                                        // which made them the lowest-contrast thing here.
                                                        : "border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.06)] hover:text-[hsl(var(--primary))]",
                                                )}
                                            >
                                                {new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {selectedSlot && (
                    <section className="mt-4 lg:mt-5">
                        {confirmed ? (
                            <div className="app-panel flex items-center gap-4 rounded-2xl p-5">
                                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                                    <svg className="size-5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                                    </svg>
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-[hsl(var(--foreground))]">Booking confirmed!</p>
                                    <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                                        {new Date(selectedSlot).toLocaleString([], {
                                            weekday: "short", month: "short", day: "numeric",
                                            hour: "numeric", minute: "2-digit", hour12: true,
                                        })}
                                        {" · "}{meta.event.durationMin} min · Taking you to your confirmation…
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <>
                                <h2 className="label-caps mb-2">Your details</h2>
                                <form onSubmit={handleConfirm} className="app-panel rounded-2xl p-4 lg:p-5">
                                    <div className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">
                                        <span className="font-medium text-[hsl(var(--foreground))]">
                                            {new Date(selectedSlot).toLocaleString([], {
                                                weekday: "short", month: "short", day: "numeric",
                                                hour: "numeric", minute: "2-digit", hour12: true,
                                            })}
                                        </span>
                                        <span> · {meta.event.durationMin} min</span>
                                    </div>

                                    <InlineNotice icon={MailCheck} className="mb-4 text-xs">
                                        We will email your confirmation, meeting link, and cancellation link after booking.
                                    </InlineNotice>

                                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_auto]">
                                        <div className="flex flex-col gap-1">
                                            <label htmlFor="name" className="label-caps">Name</label>
                                            <Input id="name" name="name" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Your full name" required />
                                        </div>

                                        <div className="flex flex-col gap-1">
                                            <label htmlFor="email" className="label-caps">Email</label>
                                            <Input
                                                id="email" name="email" type="email"
                                                autoComplete="email"
                                                value={guestEmail}
                                                onChange={(e) => setGuestEmail(e.target.value)}
                                                placeholder="you@example.com"
                                                required
                                            />
                                        </div>

                                        <div className="self-end">
                                            <Button
                                                type="submit" size="default"
                                                disabled={submitting || !holdToken || !!holdError}
                                                className="w-full lg:w-auto lg:shrink-0"
                                            >
                                                {submitting
                                                    ? <BufferingButtonLabel label="Confirming…" />
                                                    : !holdToken && !holdError
                                                        ? <BufferingButtonLabel label="Reserving…" />
                                                        : "Confirm"}
                                            </Button>
                                        </div>
                                    </div>

                                    <FormError className="mt-3 text-xs">{submitError ?? holdError}</FormError>
                                </form>
                            </>
                        )}
                    </section>
                )}
            </div>
        </Shell>
    );
}

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative flex min-h-dvh flex-col">
            <main className="flex flex-1 flex-col items-center px-4 py-6 sm:px-6 sm:py-12">
                <StandaloneHeader />
                {children}
                <PoweredBy />
            </main>
        </div>
    );
}


// ─── Date helpers ─────────────────────────────────────────────────────────────
// Kept inline because they're 5 trivial lines each; if a third caller needs
// them, lift them to src/lib/date.ts.

function startOfTodayUTC(): Date {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number): Date {
    const out = new Date(d);
    out.setDate(out.getDate() + n);
    return out;
}
function isoDate(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function pad(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}
function maxDate(a: Date, b: Date): Date {
    return a.getTime() > b.getTime() ? a : b;
}
function startOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function addMonths(d: Date, n: number): Date {
    return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function isSameMonth(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}
