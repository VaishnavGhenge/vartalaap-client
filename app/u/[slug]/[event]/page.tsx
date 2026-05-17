"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { BufferingButtonLabel } from "@/src/components/ui/BufferingButtonLabel";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { SessionlyBrand } from "@/src/components/ui/SessionlyBrand";
import { ThemeToggle } from "@/src/components/ui/ThemeToggle";
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

// Two weeks visible at a time mirrors the server default. The picker fetches
// `?from=<today>` and lets the user paginate forward in 14-day blocks.
const PAGE_DAYS = 14;

export default function PublicEventPage({ params }: PageProps) {
    const { slug, event: eventSlug } = use(params);
    const router = useRouter();

    const [meta, setMeta] = useState<PublicEventResponse | null>(null);
    const [metaError, setMetaError] = useState<string | null>(null);
    const [slots, setSlots] = useState<string[] | null>(null);
    const [slotsError, setSlotsError] = useState<string | null>(null);
    const [slotsLoading, setSlotsLoading] = useState(true);

    const [windowStart, setWindowStart] = useState<Date>(() => startOfTodayUTC());
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

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
        const to = isoDate(addDays(windowStart, PAGE_DAYS));
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
    }, [slug, eventSlug, windowStart]);

    // Bucket slots by local calendar date so each day gets its own column. We
    // do this in the guest's timezone, not the host's, so "Tuesday at 9am" is
    // shown in the guest's reading of "Tuesday".
    const slotsByDay = useMemo(() => {
        const map = new Map<string, string[]>();
        for (const iso of slots ?? []) {
            const d = new Date(iso);
            const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
            const list = map.get(key) ?? [];
            list.push(iso);
            map.set(key, list);
        }
        return map;
    }, [slots]);

    const days = useMemo(() => {
        const out: Date[] = [];
        for (let i = 0; i < PAGE_DAYS; i++) out.push(addDays(windowStart, i));
        return out;
    }, [windowStart]);

    async function handleConfirm(e: React.FormEvent) {
        e.preventDefault();
        if (!selectedSlot) return;
        setSubmitting(true);
        setSubmitError(null);
        try {
            const booking = await createBooking({
                hostSlug: slug,
                eventTypeSlug: eventSlug,
                startsAt: selectedSlot,
                guestName,
                guestEmail,
            });
            router.push(`/m/${booking.meetCode}`);
        } catch (err: unknown) {
            if (err instanceof PublicApiError && err.code === "SLOT_TAKEN") {
                setSubmitError("Someone just booked this time. Pick another.");
                setSelectedSlot(null);
                // Refresh the slot grid so the just-taken slot disappears.
                listSlots(slug, eventSlug, isoDate(windowStart),
                    isoDate(addDays(windowStart, PAGE_DAYS)))
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
            <div className="w-full max-w-2xl">
                <header>
                    <p className="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                        Book a time with <Link href={`/u/${meta.host.slug}`} className="link">{meta.host.name}</Link>
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))] sm:text-3xl">
                        {meta.event.title}
                    </h1>
                    <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                        {meta.event.durationMin} min
                        {meta.event.description ? ` · ${meta.event.description}` : ""}
                    </p>
                </header>

                <section className="mt-8">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="label-caps">Pick a time</h2>
                        <div className="flex gap-2">
                            <Button
                                variant="secondary" size="sm"
                                disabled={isSameDay(windowStart, startOfTodayUTC())}
                                onClick={() => setWindowStart((d) => maxDate(addDays(d, -PAGE_DAYS), startOfTodayUTC()))}
                            >
                                ← Earlier
                            </Button>
                            <Button
                                variant="secondary" size="sm"
                                onClick={() => setWindowStart((d) => addDays(d, PAGE_DAYS))}
                            >
                                Later →
                            </Button>
                        </div>
                    </div>

                    {slotsError ? (
                        <div className="app-panel rounded-2xl px-5 py-6 text-center text-sm text-[hsl(var(--destructive))]">
                            {slotsError}
                        </div>
                    ) : slotsLoading ? (
                        <div className="app-panel rounded-2xl px-5 py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                            Loading available times…
                        </div>
                    ) : (slots?.length ?? 0) === 0 ? (
                        <div className="app-panel rounded-2xl px-5 py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                            No times available in this window. Try the next two weeks.
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                            {days.map((day) => {
                                const key = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
                                const dayList = slotsByDay.get(key) ?? [];
                                if (dayList.length === 0) return null;
                                return (
                                    <div key={key} className="app-panel rounded-2xl px-3 py-3">
                                        <p className="px-1 pb-2 text-xs font-medium text-[hsl(var(--muted-foreground))]">
                                            {day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                                        </p>
                                        <div className="flex flex-col gap-1.5">
                                            {dayList.map((iso) => (
                                                <button
                                                    key={iso}
                                                    type="button"
                                                    onClick={() => setSelectedSlot(iso)}
                                                    className={
                                                        "press cursor-pointer w-full rounded-lg px-2 py-1.5 text-xs " +
                                                        (selectedSlot === iso
                                                            ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                                                            : "bg-[hsl(var(--surface-2))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-3))]")
                                                    }
                                                >
                                                    {new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                {selectedSlot && (
                    <section className="mt-8">
                        <h2 className="label-caps mb-3">Your details</h2>
                        <form onSubmit={handleConfirm} className="app-panel flex flex-col gap-4 rounded-2xl p-5">
                            <div className="text-sm text-[hsl(var(--muted-foreground))]">
                                <span className="text-[hsl(var(--foreground))]">
                                    {new Date(selectedSlot).toLocaleString([], {
                                        weekday: "long", month: "short", day: "numeric",
                                        hour: "numeric", minute: "2-digit",
                                    })}
                                </span>
                                <span> · {meta.event.durationMin} min</span>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="name" className="label-caps">Name</label>
                                <Input id="name" name="name" value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="email" className="label-caps">Email</label>
                                <Input
                                    id="email" name="email" type="email"
                                    autoComplete="email"
                                    value={guestEmail}
                                    onChange={(e) => setGuestEmail(e.target.value)}
                                    required
                                />
                            </div>

                            {submitError && (
                                <p className="text-xs text-[hsl(var(--destructive))]">{submitError}</p>
                            )}

                            <Button type="submit" size="lg" disabled={submitting}>
                                {submitting ? <BufferingButtonLabel label="Confirming…" /> : "Confirm booking"}
                            </Button>
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
            <div className="absolute right-4 top-4 z-10">
                <ThemeToggle />
            </div>
            <main className="flex flex-1 flex-col items-center px-4 py-12 sm:px-6">
                <Link href="/" className="mb-8">
                    <SessionlyBrand size="md" wordmarkClassName="text-2xl" markClassName="size-8" />
                </Link>
                {children}
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
function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function maxDate(a: Date, b: Date): Date {
    return a.getTime() > b.getTime() ? a : b;
}
