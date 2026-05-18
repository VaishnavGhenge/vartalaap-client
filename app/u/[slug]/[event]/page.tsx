"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Video } from "lucide-react";

import { BufferingButtonLabel } from "@/src/components/ui/BufferingButtonLabel";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { SessionlyBrand } from "@/src/components/ui/SessionlyBrand";
import { useSlotHold } from "@/src/hooks/use-slot-hold";
import { PoweredBy } from "@/src/components/ui/PoweredBy";
import { initialsOf } from "@/src/lib/avatar";
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
    const [submitError, setSubmitError] = useState<string | null>(null);

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
            router.push(`/m/${booking.meetCode}`);
        } catch (err: unknown) {
            if (err instanceof PublicApiError && err.code === "SLOT_TAKEN") {
                setSubmitError("Someone just booked this time. Pick another.");
                // Refresh the slot grid so the just-taken slot disappears.
                listSlots(slug, eventSlug, isoDate(windowStart),
                    isoDate(addDays(windowEnd, 1)))
                    .then((res) => setSlots(res.slots))
                    .catch(() => { /* keep stale slots */ });
            } else if (err instanceof PublicApiError) {
                setSubmitError(err.message);
            } else {
                setSubmitError("Couldn't confirm. Try again.");
            }
        } finally {
            setSubmitting(false);
        }
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
                <header className="app-panel rounded-2xl px-5 py-5">
                    <div className="flex items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(var(--primary))] to-violet-500 text-sm font-semibold text-white">
                            {initialsOf(meta.host.name)}
                        </div>
                        <div className="min-w-0">
                            <Link
                                href={`/u/${meta.host.slug}`}
                                className="block truncate text-sm font-semibold text-[hsl(var(--foreground))] hover:text-[hsl(var(--primary))]"
                            >
                                {meta.host.name}
                            </Link>
                            <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">
                                {meta.host.timezone.replace(/_/g, " ")}
                            </p>
                        </div>
                    </div>
                    <div className="mt-4 border-t border-[hsl(var(--border))]/60 pt-4">
                        <h1 className="text-xl font-semibold tracking-tight text-[hsl(var(--foreground))] sm:text-2xl">
                            {meta.event.title}
                        </h1>
                        <div className="mt-1 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                            <Video className="size-3 shrink-0" />
                            <span>
                                Video call · {meta.event.durationMin} min
                                {meta.event.description ? ` · ${meta.event.description}` : ""}
                            </span>
                        </div>
                    </div>
                </header>

                <section className="mt-6">
                    <div className="app-panel no-lift rounded-2xl p-5 lg:p-6">
                        {/*
                          Below lg the calendar and slot picker stack vertically
                          inside one column (mobile-friendly). At lg+ they split
                          into two: calendar on the left at a sane ~340px, time
                          list on the right. Without the split the day cells
                          inflate to ~85px squares on a wide screen — accurate
                          to the grid but unusable.
                        */}
                        <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-6">
                            <div>
                                <div className="mb-4 flex items-center justify-between">
                                    <div>
                                        <h2 className="text-lg font-bold tracking-tight text-[hsl(var(--foreground))]">
                                            {monthAnchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                                        </h2>
                                        <p className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))]">
                                            Times shown in your timezone
                                        </p>
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
                                                <div key={i} className="py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                                                    {d}
                                                </div>
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
                              stacks under with a horizontal divider. Rendered
                              as a vertical list at lg because the column is
                              narrow; below lg it's a 3- or 4-col grid that
                              fills the available width.
                            */}
                            {selectedDate && selectedDaySlots.length > 0 && (
                                <div className="mt-5 border-t border-[hsl(var(--border))]/60 pt-4 lg:mt-0 lg:max-h-[420px] lg:overflow-y-auto lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                                    <div className="mb-3 flex items-center justify-between">
                                        <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                                            {selectedDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                                        </p>
                                        <span className="rounded-full bg-[hsl(var(--primary)/0.1)] px-2 py-0.5 text-xs font-semibold text-[hsl(var(--primary))]">
                                            {selectedDaySlots.length} slot{selectedDaySlots.length === 1 ? "" : "s"}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 lg:grid-cols-4">
                                        {selectedDaySlots.map((iso) => (
                                            <button
                                                key={iso}
                                                type="button"
                                                onClick={() => { void selectSlot(iso); }}
                                                className={cn(
                                                    "press w-full cursor-pointer rounded-lg px-1 py-2.5 text-xs font-medium",
                                                    selectedSlot === iso
                                                        ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_4px_12px_-3px_hsl(var(--primary)/0.45)]"
                                                        : "border border-[hsl(var(--border))] bg-transparent text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary))]/50 hover:bg-[hsl(var(--primary)/0.06)] hover:text-[hsl(var(--primary))]",
                                                )}
                                            >
                                                {new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
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
                        <h2 className="label-caps mb-2">Your details</h2>
                        <form onSubmit={handleConfirm} className="app-panel rounded-2xl p-4 lg:p-5">
                            <div className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">
                                <span className="font-medium text-[hsl(var(--foreground))]">
                                    {new Date(selectedSlot).toLocaleString([], {
                                        weekday: "short", month: "short", day: "numeric",
                                        hour: "numeric", minute: "2-digit",
                                    })}
                                </span>
                                <span> · {meta.event.durationMin} min</span>
                            </div>

                            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_auto]">
                                <div className="flex flex-col gap-1">
                                    <label htmlFor="name" className="label-caps">Name</label>
                                    <Input id="name" name="name" value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
                                </div>

                                <div className="flex flex-col gap-1">
                                    <label htmlFor="email" className="label-caps">Email</label>
                                    <Input
                                        id="email" name="email" type="email"
                                        autoComplete="email"
                                        value={guestEmail}
                                        onChange={(e) => setGuestEmail(e.target.value)}
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

                            {(submitError || holdError) && (
                                <p className="mt-2 text-xs text-[hsl(var(--destructive))]">
                                    {submitError ?? holdError}
                                </p>
                            )}
                        </form>
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
                <Link href="/" className="mb-6 sm:mb-8">
                    <SessionlyBrand size="md" wordmarkClassName="text-2xl" markClassName="size-8" />
                </Link>
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
