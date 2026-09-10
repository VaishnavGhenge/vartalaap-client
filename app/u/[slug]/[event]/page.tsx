"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Clock, Globe2, Loader2, MailCheck, Video } from "lucide-react";

import { BufferingButtonLabel } from "@/src/components/ui/BufferingButtonLabel";
import { BookingLoadingContent } from "@/src/components/ui/PageLoading";
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
    const [retry, setRetry] = useState(0);
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
    const [displayedMonth, setDisplayedMonth] = useState(monthAnchor);
    const today = useMemo(() => startOfTodayUTC(), []);
    const windowStart = useMemo(() => maxDate(startOfMonth(monthAnchor), today), [monthAnchor, today]);
    const windowEnd = useMemo(() => endOfMonth(monthAnchor), [monthAnchor]);
    const [selectedDay, setSelectedDay] = useState<string | null>(null);

    // Slot reservation lifecycle: hook owns the POST /holds + DELETE /holds
    // round-trips so the page stays free of network mechanics.
    const { selectedSlot, holdToken, holdError, selectSlot, consumeHold } = useSlotHold({
        hostSlug: slug,
        eventTypeSlug: eventSlug,
    });

    const [guestName, setGuestName] = useState("");
    const [guestEmail, setGuestEmail] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const [bookedSlot, setBookedSlot] = useState<string | null>(null);
    const [detailsStarted, setDetailsStarted] = useState(false);
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
        setMetaError(null);
        getPublicEvent(slug, eventSlug)
            .then((res) => {
                if (!cancelled) setMeta(res);
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                if (err instanceof PublicApiError && err.status === 404) {
                    setMetaError("This event isn't available.");
                } else {
                    setMetaError("Couldn't load this event. Try again.");
                }
            });
        return () => {
            cancelled = true;
        };
    }, [slug, eventSlug, retry]);

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
                setDisplayedMonth(monthAnchor);
                const firstVisibleSlot = res.slots.find((iso) => {
                    const date = new Date(iso);
                    return date >= today && isSameMonth(date, monthAnchor);
                });
                setSelectedDay(firstVisibleSlot ? isoDate(new Date(firstVisibleSlot)) : null);
                setSlotsStale(res.calendarSyncDegraded === true);
                setSlotsLoading(false);
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setSlots([]);
                setDisplayedMonth(monthAnchor);
                setSelectedDay(null);
                setSlotsLoading(false);
                if (err instanceof PublicApiError && err.status === 404) {
                    setSlotsError("This event isn't available.");
                } else {
                    setSlotsError("Couldn't load times. Try again.");
                }
            });
        return () => {
            cancelled = true;
        };
    }, [slug, eventSlug, windowStart, windowEnd, monthAnchor, today]);

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
        const first = startOfMonth(displayedMonth);
        const last = endOfMonth(displayedMonth);
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
        // A constant six rows prevents the page moving between months.
        while (cells.length < 42) cells.push(null);
        return cells;
    }, [displayedMonth, slotsByDay, today]);

    const selectedDaySlots = selectedDay ? (slotsByDay.get(selectedDay) ?? []) : [];
    const selectedDate = useMemo(() => {
        for (const cell of monthGrid) {
            if (cell && cell.key === selectedDay) return cell.date;
        }
        return null;
    }, [monthGrid, selectedDay]);

    async function handleConfirm(e: React.FormEvent) {
        e.preventDefault();
        if (!selectedSlot || submitting || confirmed) return;
        setSubmitting(true);
        setSubmitError(null);
        const token = holdToken ?? undefined;
        try {
            const booking = await createBooking({
                hostSlug: slug,
                eventTypeSlug: eventSlug,
                startsAt: selectedSlot,
                guestName,
                guestEmail,
                holdToken: token,
            });
            setBookedSlot(selectedSlot);
            setConfirmed(true);
            consumeHold();
            router.replace(`/m/${booking.meetCode}`);
            // Leave submitting=true — navigation is in progress and we're
            // showing the confirmed state. No finally reset on the happy path.
            return;
        } catch (err: unknown) {
            if (err instanceof PublicApiError && err.code === "SLOT_TAKEN") {
                setSubmitError("That time is no longer available. Pick another.");
                listSlots(slug, eventSlug, isoDate(windowStart), isoDate(addDays(windowEnd, 1)))
                    .then((res) => {
                        setSlots(res.slots);
                        setSlotsStale(res.calendarSyncDegraded === true);
                    })
                    .catch(() => {
                        /* keep stale slots */
                    });
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
                    <Button variant="outline" className="mt-4" onClick={() => setRetry((value) => value + 1)}>
                        Try again
                    </Button>
                </div>
            </Shell>
        );
    }

    if (!meta || slots === null) {
        return (
            <Shell>
                <BookingLoadingContent />
            </Shell>
        );
    }

    return (
        <Shell>
            <div className="experience-card page-enter w-full max-w-6xl lg:grid lg:grid-cols-[300px_minmax(0,1fr)]">
                <header className="rounded-t-2xl border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-2))]/65 p-6 sm:p-8 lg:rounded-l-2xl lg:rounded-tr-none lg:border-b-0 lg:border-r">
                    <Link
                        href={`/u/${meta.host.slug}`}
                        className="mb-7 inline-flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]"
                    >
                        <ChevronLeft className="size-3.5" /> All sessions
                    </Link>
                    <div className="flex items-start gap-4 lg:flex-col lg:gap-5">
                        <Avatar name={meta.host.name} src={meta.host.avatarUrl} size="lg" />
                        <div className="min-w-0 pt-0.5">
                            <Link
                                href={`/u/${meta.host.slug}`}
                                className="transition-colors hover:text-[hsl(var(--primary))]"
                            >
                                <SmallCaps className="text-inherit">{meta.host.name}</SmallCaps>
                            </Link>
                            <h1 className="font-display mt-3 text-3xl leading-tight text-[hsl(var(--foreground))]">
                                {meta.event.title}
                            </h1>
                            <div className="mt-5 flex flex-col gap-3 text-sm text-[hsl(var(--muted-foreground))]">
                                <span className="inline-flex items-center gap-1.5">
                                    <Clock className="size-4 shrink-0" />
                                    {meta.event.durationMin} minutes
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                    <Video className="size-4 shrink-0" /> Private video session
                                </span>
                                <span className="inline-flex items-start gap-1.5 break-words">
                                    <Globe2 className="mt-0.5 size-4 shrink-0" />
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
                    <div className="mt-7 border-t border-[hsl(var(--border))] pt-5 text-xs leading-6 text-[hsl(var(--muted-foreground))]">
                        Your confirmation includes the video room link. No account or download needed to join.
                    </div>
                </header>
                <div className="min-w-0 p-5 sm:p-8">
                    <ol aria-label="Booking progress" className="mb-7 flex flex-wrap items-center gap-4 text-xs">
                        {["Choose a time", "Your details", "Confirmed"].map((label, index) => {
                            const current = confirmed ? 2 : selectedSlot ? 1 : 0;
                            return (
                                <li
                                    key={label}
                                    aria-current={current === index ? "step" : undefined}
                                    className={cn(
                                        "flex items-center gap-2",
                                        current >= index
                                            ? "text-[hsl(var(--primary))]"
                                            : "text-[hsl(var(--muted-foreground))]",
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "flex size-6 items-center justify-center rounded-full text-[10px] font-semibold",
                                            current >= index ? "bg-[hsl(var(--secondary))]" : "bg-[hsl(var(--muted))]",
                                        )}
                                    >
                                        {current > index ? <Check className="size-3" /> : index + 1}
                                    </span>
                                    {label}
                                </li>
                            );
                        })}
                    </ol>
                    <h2 className="text-xl font-semibold tracking-tight">Choose a time to connect.</h2>
                    <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                        Select a date, then a time that works for you.
                    </p>
                    <section className="mt-7">
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
                                    These times couldn&apos;t be checked against {meta.host.name}
                                    &apos;s calendar just now, so one may already be taken. You&apos;ll get an email
                                    either way.
                                </InlineNotice>
                            )}
                            <div className="sm:grid sm:grid-cols-[minmax(240px,1.2fr)_minmax(140px,0.8fr)] sm:gap-6">
                                <div>
                                    <div className="mb-4 flex items-center justify-between">
                                        <div>
                                            <h2 className="text-[0.9375rem] font-semibold tracking-tight text-[hsl(var(--foreground))]">
                                                {displayedMonth.toLocaleDateString(undefined, {
                                                    month: "long",
                                                    year: "numeric",
                                                })}
                                            </h2>
                                        </div>
                                        <div className="flex gap-0.5">
                                            <span
                                                className="flex size-8 items-center justify-center"
                                                role="status"
                                                aria-label={
                                                    slotsLoading ? "Updating available times" : "Availability updated"
                                                }
                                            >
                                                {slotsLoading && (
                                                    <Loader2
                                                        className="size-3.5 animate-spin text-[hsl(var(--muted-foreground))]"
                                                        aria-hidden="true"
                                                    />
                                                )}
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                aria-label="Previous month"
                                                disabled={isSameMonth(monthAnchor, today) || submitting || confirmed}
                                                onClick={() => {
                                                    void selectSlot(null);
                                                    setMonthAnchor((d) => startOfMonth(addMonths(d, -1)));
                                                }}
                                                className="size-8 rounded-full p-0"
                                            >
                                                <ChevronLeft className="size-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                aria-label="Next month"
                                                disabled={submitting || confirmed}
                                                onClick={() => {
                                                    void selectSlot(null);
                                                    setMonthAnchor((d) => startOfMonth(addMonths(d, 1)));
                                                }}
                                                className="size-8 rounded-full p-0"
                                            >
                                                <ChevronRight className="size-4" />
                                            </Button>
                                        </div>
                                    </div>

                                    <div aria-busy={slotsLoading}>
                                        <div className="mb-1 grid grid-cols-7">
                                            {/*
                                              Monday-start week. Two T/S letters
                                              in a row are unavoidable; grid
                                              alignment keeps the columns
                                              readable.
                                            */}
                                            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
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
                                        <div
                                            data-testid="booking-calendar-grid"
                                            className="grid grid-cols-7 justify-items-center gap-y-1"
                                        >
                                            {monthGrid.map((cell, i) => {
                                                if (!cell) {
                                                    return (
                                                        <div
                                                            key={`pad-${i}`}
                                                            className="size-9 max-[360px]:size-8 sm:size-10"
                                                        />
                                                    );
                                                }
                                                const { date, key, dayNum, count, isPast } = cell;
                                                const hasSlots = count > 0;
                                                const isSelected = selectedDay === key;
                                                const isToday = key === isoDate(today);
                                                const disabled = isPast || !hasSlots;
                                                const dayLabel = date.toLocaleDateString(undefined, {
                                                    weekday: "long",
                                                    month: "long",
                                                    day: "numeric",
                                                });
                                                return (
                                                    <button
                                                        key={key}
                                                        type="button"
                                                        disabled={disabled || slotsLoading || submitting || confirmed}
                                                        onClick={() => {
                                                            if (key !== selectedDay) void selectSlot(null);
                                                            setSelectedDay(key);
                                                        }}
                                                        aria-label={
                                                            disabled
                                                                ? `${dayLabel} — no openings`
                                                                : `${dayLabel} — ${count} ${count === 1 ? "slot" : "slots"} available`
                                                        }
                                                        aria-pressed={isSelected}
                                                        aria-current={isToday ? "date" : undefined}
                                                        className={cn(
                                                            "relative flex size-9 max-[360px]:size-8 sm:size-10 cursor-pointer flex-col items-center justify-center rounded-lg text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/50 disabled:cursor-not-allowed",
                                                            isSelected
                                                                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
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

                                        <p
                                            role="status"
                                            className="mt-4 min-h-10 text-center text-xs leading-5 text-[hsl(var(--muted-foreground))]"
                                        >
                                            {slotsError ??
                                                (slots !== null && slots.length === 0
                                                    ? "No times available this month. Try the next one."
                                                    : "Times are shown in your local timezone.")}
                                        </p>
                                    </div>
                                </div>

                                {/*
                              Slot column. On lg+ this sits to the right of the
                              calendar with a vertical divider; below lg it
                              stacks under with a horizontal divider. Always a
                              grid: three columns in the narrow lg sidebar,
                              four when it stacks full width.
                            */}
                                <div className="mt-5 h-96 border-t border-[hsl(var(--border))] pt-4 sm:mt-0 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                                    {selectedDate && selectedDaySlots.length > 0 ? (
                                        <>
                                            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                                                <h2 className="text-[0.9375rem] font-semibold tracking-tight text-[hsl(var(--foreground))]">
                                                    {selectedDate.toLocaleDateString(undefined, {
                                                        weekday: "long",
                                                        month: "long",
                                                        day: "numeric",
                                                    })}
                                                </h2>
                                                <SmallCaps size="xs">
                                                    {selectedDaySlots.length}{" "}
                                                    {selectedDaySlots.length === 1 ? "time" : "times"}
                                                </SmallCaps>
                                            </div>
                                            <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto p-1 sm:grid-cols-1">
                                                {selectedDaySlots.map((iso) => (
                                                    <button
                                                        key={iso}
                                                        type="button"
                                                        onClick={() => {
                                                            setDetailsStarted(true);
                                                            void selectSlot(iso);
                                                        }}
                                                        disabled={slotsLoading || submitting || confirmed}
                                                        aria-pressed={selectedSlot === iso}
                                                        className={cn(
                                                            "w-full cursor-pointer rounded-lg px-1 py-3 text-[0.8125rem] font-medium tabular-nums tracking-tight transition-colors",
                                                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/60",
                                                            selectedSlot === iso
                                                                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                                                                : // These are the page's primary action and used to be
                                                                  // white on cream behind a near-invisible hairline,
                                                                  // which made them the lowest-contrast thing here.
                                                                  "border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.06)] hover:text-[hsl(var(--primary))]",
                                                        )}
                                                    >
                                                        {new Date(iso).toLocaleTimeString([], {
                                                            hour: "numeric",
                                                            minute: "2-digit",
                                                            hour12: true,
                                                        })}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-sm text-[hsl(var(--muted-foreground))]">
                                            <p className="font-medium">Available times</p>
                                            <p className="mt-4 leading-6">
                                                {slotsLoading
                                                    ? "Checking this month’s availability…"
                                                    : "Choose an available date to see times here."}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>

                    {(detailsStarted || confirmed) && (
                        <section className="page-enter mt-4 lg:mt-5">
                            {confirmed ? (
                                <div className="app-panel flex items-center gap-4 rounded-2xl p-5">
                                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--success-soft))]">
                                        <svg
                                            className="size-5 text-[hsl(var(--success))]"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                            aria-hidden
                                        >
                                            <path
                                                fillRule="evenodd"
                                                d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                                                clipRule="evenodd"
                                            />
                                        </svg>
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                                            Booking confirmed!
                                        </p>
                                        <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                                            {new Date(bookedSlot!).toLocaleString([], {
                                                weekday: "short",
                                                month: "short",
                                                day: "numeric",
                                                hour: "numeric",
                                                minute: "2-digit",
                                                hour12: true,
                                            })}
                                            {" · "}
                                            {meta.event.durationMin} min · Taking you to your confirmation…
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <h2 className="label-caps mb-2">Your details</h2>
                                    <form
                                        onSubmit={handleConfirm}
                                        aria-busy={submitting}
                                        className="app-panel rounded-2xl p-4 lg:p-5"
                                    >
                                        <div className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">
                                            <span className="font-medium text-[hsl(var(--foreground))]">
                                                {selectedSlot
                                                    ? new Date(selectedSlot).toLocaleString([], {
                                                          weekday: "short",
                                                          month: "short",
                                                          day: "numeric",
                                                          hour: "numeric",
                                                          minute: "2-digit",
                                                          hour12: true,
                                                      })
                                                    : "Choose a time above to continue"}
                                            </span>
                                            <span> · {meta.event.durationMin} min</span>
                                        </div>

                                        <InlineNotice icon={MailCheck} className="mb-4 text-xs">
                                            We will email your confirmation, meeting link, and cancellation link after
                                            booking.
                                        </InlineNotice>

                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                            <div className="flex flex-col gap-1">
                                                <label htmlFor="name" className="label-caps">
                                                    Name
                                                </label>
                                                <Input
                                                    id="name"
                                                    name="name"
                                                    value={guestName}
                                                    onChange={(e) => setGuestName(e.target.value)}
                                                    placeholder="Your full name"
                                                    required
                                                />
                                            </div>

                                            <div className="flex flex-col gap-1">
                                                <label htmlFor="email" className="label-caps">
                                                    Email
                                                </label>
                                                <Input
                                                    id="email"
                                                    name="email"
                                                    type="email"
                                                    autoComplete="email"
                                                    value={guestEmail}
                                                    onChange={(e) => setGuestEmail(e.target.value)}
                                                    placeholder="you@example.com"
                                                    required
                                                />
                                            </div>

                                            <div className="self-end sm:col-span-2">
                                                <Button
                                                    type="submit"
                                                    size="default"
                                                    disabled={submitting || !selectedSlot || !holdToken || !!holdError}
                                                    className="w-full"
                                                >
                                                    {!selectedSlot ? (
                                                        "Choose a time to continue"
                                                    ) : submitting ? (
                                                        <BufferingButtonLabel label="Confirming…" />
                                                    ) : !holdToken && !holdError ? (
                                                        <BufferingButtonLabel label="Reserving…" />
                                                    ) : (
                                                        "Confirm booking"
                                                    )}
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
            </div>
        </Shell>
    );
}

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative flex min-h-dvh flex-col">
            <main className="flex flex-1 flex-col items-center px-4 py-6 sm:px-6 sm:py-12">
                <StandaloneHeader className="max-w-6xl" />
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
