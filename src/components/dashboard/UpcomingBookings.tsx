"use client";

import { Calendar, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/src/components/ui/button";
import { listMyBookings, type HostBooking } from "@/src/services/api/bookings";

interface Props {
    refreshKey?: number;
}

// Top-N upcoming bookings for the host's dashboard hub. Renders a compact
// row per booking with a one-click "Open room" link. The full list (history,
// cancellations) belongs on a dedicated page later.
const MAX_VISIBLE = 5;

export function UpcomingBookings({ refreshKey }: Props) {
    const [bookings, setBookings] = useState<HostBooking[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        listMyBookings()
            .then((list) => { if (!cancelled) setBookings(list); })
            .catch((e: unknown) => {
                if (cancelled) return;
                setError(e instanceof Error ? e.message : "Could not load bookings");
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [refreshKey]);

    if (loading) {
        return <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading bookings…</p>;
    }
    if (error) {
        return <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>;
    }
    if (bookings.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-[hsl(var(--border))]/70 bg-[hsl(var(--surface-2))] px-4 py-6 text-center">
                <Calendar className="mx-auto mb-2 size-5 text-[hsl(var(--muted-foreground))]" />
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    No upcoming bookings yet.
                </p>
            </div>
        );
    }

    const visible = bookings.slice(0, MAX_VISIBLE);

    return (
        <div className="flex flex-col gap-2">
            {visible.map((b) => {
                const start = new Date(b.startsAt);
                return (
                    <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface-2))] px-4 py-3">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[hsl(var(--foreground))]">
                                {b.eventTitle ?? "Booking"}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-[hsl(var(--muted-foreground))]">
                                {start.toLocaleString([], {
                                    weekday: "short", month: "short", day: "numeric",
                                    hour: "numeric", minute: "2-digit",
                                })}
                                {" · "}{b.guestName}
                            </p>
                        </div>
                        <Button asChild variant="secondary" size="sm">
                            <Link href={`/room/${b.meetCode}`} prefetch>
                                <Video className="size-3.5" /> Open
                            </Link>
                        </Button>
                    </div>
                );
            })}
            {bookings.length > MAX_VISIBLE && (
                <p className="px-1 pt-1 text-xs text-[hsl(var(--muted-foreground))]">
                    + {bookings.length - MAX_VISIBLE} more upcoming
                </p>
            )}
        </div>
    );
}
