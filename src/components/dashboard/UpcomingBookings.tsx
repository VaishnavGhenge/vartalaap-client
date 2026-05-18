"use client";

import { Calendar, Video, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/src/components/ui/button";
import { cancelBooking, listMyBookings, type HostBooking } from "@/src/services/api/bookings";
import { cn } from "@/src/lib/utils";

interface Props {
    refreshKey?: number;
}

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
                <p className="text-sm text-[hsl(var(--muted-foreground))]">No upcoming bookings yet.</p>
            </div>
        );
    }

    const visible = bookings.slice(0, MAX_VISIBLE);

    async function handleCancel(id: string) {
        if (!confirm("Cancel this booking? The guest will be emailed.")) return;
        try {
            await cancelBooking(id);
            setBookings((prev) => prev.filter((b) => b.id !== id));
        } catch (e) {
            alert(e instanceof Error ? e.message : "Could not cancel");
        }
    }

    return (
        <div className="flex flex-col gap-2">
            {visible.map((b) => {
                const start = new Date(b.startsAt);
                const end = new Date(b.endsAt);
                const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
                const dayLabel = relativeDayLabel(start);
                const imminent = isImminent(start);

                return (
                    <div
                        key={b.id}
                        className="relative flex items-center gap-4 overflow-hidden rounded-xl border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface-2))] px-4 py-3"
                    >
                        <span className="absolute inset-y-0 left-0 w-[3px] bg-[hsl(var(--primary))]/50" />

                        {/* When */}
                        <div className="w-14 shrink-0 text-center">
                            <p className={cn(
                                "text-[10px] font-semibold uppercase tracking-wider",
                                imminent ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]",
                            )}>
                                {dayLabel}
                            </p>
                            <p className="mt-0.5 text-sm font-semibold tabular-nums text-[hsl(var(--foreground))]">
                                {start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                            </p>
                        </div>

                        {/* Divider */}
                        <div className="h-8 w-px shrink-0 bg-[hsl(var(--border))]/60" />

                        {/* What + who */}
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-[hsl(var(--foreground))]">
                                {b.eventTitle ?? "Session"}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-[hsl(var(--muted-foreground))]">
                                {b.guestName}
                                {durationMin > 0 && <span> · {durationMin} min</span>}
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="flex shrink-0 items-center gap-1">
                            <Button
                                asChild
                                variant={imminent ? "primary" : "secondary"}
                                size="sm"
                            >
                                <Link href={`/room/${b.meetCode}`} prefetch>
                                    <Video className="size-3.5" />
                                    Join
                                </Link>
                            </Button>
                            <Button
                                variant="ghost" size="sm"
                                aria-label="Cancel booking"
                                onClick={() => handleCancel(b.id)}
                            >
                                <X className="size-3.5" />
                            </Button>
                        </div>
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

function relativeDayLabel(date: Date): string {
    const today = startOfDay(new Date());
    const d = startOfDay(date);
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff < 7) return date.toLocaleDateString([], { weekday: "short" });
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function isImminent(start: Date): boolean {
    const now = Date.now();
    const ms = start.getTime() - now;
    // Highlight if starting within 30 min or started within the last 60 min
    return ms <= 30 * 60 * 1000 && ms >= -60 * 60 * 1000;
}

function startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
