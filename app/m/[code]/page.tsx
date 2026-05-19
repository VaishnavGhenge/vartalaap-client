import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Info } from "lucide-react";

import { CancelBookingButton } from "@/src/components/booking/CancelBookingButton";
import { Button } from "@/src/components/ui/button";
import { PoweredBy } from "@/src/components/ui/PoweredBy";
import { StandaloneHeader } from "@/src/components/ui/StandaloneHeader";
import { httpServerUri } from "@/src/services/api/config";
import type { BookingResponse } from "@/src/services/api/public";

// Server-rendered: the confirmation page must work from a cold link in an
// email so it can't depend on client-side state. We re-fetch on every request
// because booking status (e.g. cancelled) can change and we want this page
// to reflect that without a stale-cache window.
async function fetchBooking(code: string): Promise<BookingResponse | null> {
    const res = await fetch(`${httpServerUri}/m/${encodeURIComponent(code)}`, {
        cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`booking fetch ${res.status}`);
    return (await res.json()) as BookingResponse;
}

interface PageProps {
    params: Promise<{ code: string }>;
    searchParams: Promise<{ t?: string | string[] }>;
}

export async function generateMetadata({ params }: PageProps) {
    const { code } = await params;
    return {
        title: `Booking ${code} · Sessionly`,
        // Confirmations should never be indexed.
        robots: { index: false, follow: false },
    };
}

export default async function ConfirmationPage({ params, searchParams }: PageProps) {
    const { code } = await params;
    const { t } = await searchParams;
    // searchParams values can be string | string[] in Next 15. Only the first
    // hit is meaningful — the token isn't a multi-value param.
    const cancelToken = Array.isArray(t) ? t[0] : t;
    const booking = await fetchBooking(code);
    if (!booking) notFound();

    const start = new Date(booking.startsAt);
    const end = new Date(booking.endsAt);
    const roomOpen = booking.roomStatus === "open";
    const roomHint = roomAccessHint(booking);
    const cancelledByLabel = booking.cancelledBy === "host"
        ? "host"
        : booking.cancelledBy === "guest"
            ? "guest"
            : null;

    return (
        <div className="relative flex min-h-dvh flex-col">
            <main className="flex flex-1 flex-col items-center px-4 py-6 sm:px-6 sm:py-12">
                <StandaloneHeader />

                <div className="w-full max-w-md">
                    <div className="app-panel rounded-2xl px-6 py-8">
                        <p className="label-caps text-[hsl(var(--primary))]">
                            {booking.status === "cancelled" ? "Cancelled" : "Booked"}
                        </p>
                        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
                            {booking.eventTitle ?? "Your meeting"}
                        </h1>
                        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                            {start.toLocaleString([], {
                                weekday: "long", month: "long", day: "numeric",
                                hour: "numeric", minute: "2-digit",
                            })}
                            {" – "}
                            {end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </p>

                        <dl className="mt-6 grid gap-3 text-sm">
                            <div className="flex justify-between gap-3">
                                <dt className="text-[hsl(var(--muted-foreground))]">Guest</dt>
                                <dd className="text-[hsl(var(--foreground))]">{booking.guestName}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="text-[hsl(var(--muted-foreground))]">Email</dt>
                                <dd className="truncate text-[hsl(var(--foreground))]">{booking.guestEmail}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="text-[hsl(var(--muted-foreground))]">Meet code</dt>
                                <dd className="font-mono text-[hsl(var(--foreground))]">{booking.meetCode}</dd>
                            </div>
                        </dl>

                        {booking.status === "cancelled" && booking.cancellationReason && (
                            <div className="mt-6 rounded-xl border border-[hsl(var(--destructive))]/20 bg-[hsl(var(--destructive))]/10 px-4 py-3">
                                <p className="label-caps text-[hsl(var(--destructive))]">
                                    {cancelledByLabel ? `Cancelled by ${cancelledByLabel}` : "Cancellation reason"}
                                </p>
                                <p className="mt-1 text-sm text-[hsl(var(--foreground))]">{booking.cancellationReason}</p>
                            </div>
                        )}

                        {booking.status !== "cancelled" && (
                            <div className="mt-6 flex flex-col gap-3">
                                <div className="flex items-center gap-2 rounded-lg bg-[hsl(var(--surface-2))] px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
                                    <Clock className="size-3.5 shrink-0" />
                                    {roomHint}
                                </div>
                                {roomOpen ? (
                                    <Button asChild size="lg" className="w-full">
                                        <Link href={`/room/${booking.meetCode}`} prefetch>
                                            Open meeting room
                                        </Link>
                                    </Button>
                                ) : (
                                    <Button size="lg" className="w-full" disabled>
                                        {booking.roomStatus === "too_early" ? "Room opens soon" : "Room unavailable"}
                                    </Button>
                                )}
                                <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">
                                    Use the same confirmation link if you need to return later.
                                </p>
                                {cancelToken && (
                                    <div className="mt-2 border-t border-[hsl(var(--border))]/60 pt-3">
                                        <CancelBookingButton meetCode={booking.meetCode} cancelToken={cancelToken} />
                                    </div>
                                )}
                                {!cancelToken && (
                                    <div className="flex items-center gap-2 rounded-lg bg-[hsl(var(--surface-2))] px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
                                        <Info className="size-3.5 shrink-0" />
                                        To cancel, open the confirmation link from your email or contact the host.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                <PoweredBy />
            </main>
        </div>
    );
}

function roomAccessHint(booking: BookingResponse): string {
    if (booking.roomStatus === "open") return "The meeting room is open for this booking.";
    if (booking.roomStatus === "too_early") {
        if (booking.roomOpensAt) {
            return `The meeting room opens ${formatDateTime(new Date(booking.roomOpensAt))}.`;
        }
        return booking.roomMessage || "The meeting room opens shortly before the scheduled time.";
    }
    if (booking.roomStatus === "ended") return "The meeting room window has ended.";
    if (booking.roomStatus === "cancelled") return "This booking has been cancelled.";
    return booking.roomMessage || "The meeting room is not available yet.";
}

function formatDateTime(date: Date): string {
    return date.toLocaleString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}
