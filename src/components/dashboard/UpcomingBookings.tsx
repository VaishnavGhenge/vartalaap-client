"use client";

import { Calendar, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/ConfirmDialog";
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
    const [cancelTarget, setCancelTarget] = useState<HostBooking | null>(null);
    const [cancelPending, setCancelPending] = useState(false);
    const [cancelError, setCancelError] = useState<string | null>(null);
    const [cancelReason, setCancelReason] = useState("");
    const [, setTick] = useState(0);
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), 30_000);
        return () => clearInterval(id);
    }, []);

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

    const visible = showAll ? bookings : bookings.slice(0, MAX_VISIBLE);

    async function handleCancel() {
        if (!cancelTarget) return;
        setCancelPending(true);
        setCancelError(null);
        try {
            await cancelBooking(cancelTarget.id, cancelReason);
            setBookings((prev) => prev.map((b) => (
                b.id === cancelTarget.id
                    ? { ...b, status: "cancelled", cancellationReason: cancelReason, cancelledBy: "host" }
                    : b
            )));
            setCancelTarget(null);
            setCancelReason("");
        } catch (e) {
            setCancelError(e instanceof Error ? e.message : "Could not cancel");
        } finally {
            setCancelPending(false);
        }
    }

    return (
        <div className="flex flex-col gap-2">
            {visible.map((b) => {
                const start = new Date(b.startsAt);
                const end = new Date(b.endsAt);
                const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
                const isCancelled = b.status === "cancelled";
                const dayLabel = relativeDayLabel(start);
                const imminent = isImminent(start);
                const timeRemaining = isCancelled ? null : timeRemainingLabel(start);
                const cancelledByLabel = cancellationActorLabel(b.cancelledBy);
                const roomOpen = b.roomStatus === "open";

                return (
                    <div
                        key={b.id}
                        className={cn(
                            "relative flex items-center gap-4 overflow-hidden rounded-xl border px-4 py-3 transition-colors",
                            isCancelled
                                ? "border-[hsl(var(--border))]/60 bg-[hsl(var(--surface-2))]/60 opacity-80"
                                : imminent
                                ? "border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/5"
                                : "border-[hsl(var(--border))]/70 bg-[hsl(var(--surface-2))]",
                        )}
                    >
                        <span className={cn(
                            "absolute inset-y-0 left-0 w-[3px]",
                            isCancelled ? "bg-[hsl(var(--destructive))]/55" : imminent ? "bg-[hsl(var(--primary))]" : "bg-[hsl(var(--primary))]/40",
                        )} />

                        {/* When */}
                        <div className="w-16 shrink-0 text-center">
                            <span className={cn(
                                "inline-block rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider",
                                imminent
                                    ? "bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))]"
                                    : "text-[hsl(var(--muted-foreground))]",
                            )}>
                                {dayLabel}
                            </span>
                            <p className="mt-0.5 text-sm font-bold tabular-nums text-[hsl(var(--foreground))]">
                                {start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })}
                            </p>
                            {timeRemaining && (
                                <p className={cn(
                                    "mt-0.5 text-[10px] tabular-nums leading-none",
                                    imminent
                                        ? "font-semibold text-[hsl(var(--primary))]"
                                        : "text-[hsl(var(--muted-foreground))]",
                                )}>
                                    {timeRemaining}
                                </p>
                            )}
                        </div>

                        {/* Divider */}
                        <div className="h-8 w-px shrink-0 bg-[hsl(var(--border))]/60" />

                        {/* What + who */}
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">
                                {b.eventTitle ?? "Session"}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-[hsl(var(--muted-foreground))]">
                                {isCancelled ? `Cancelled${cancelledByLabel ? ` by ${cancelledByLabel}` : ""}` : b.guestName}
                                {durationMin > 0 && <span> · {durationMin} min</span>}
                            </p>
                            {isCancelled && b.cancellationReason && (
                                <p className="mt-1 line-clamp-2 text-xs text-[hsl(var(--destructive))]">
                                    {b.cancellationReason}
                                </p>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex shrink-0 items-center gap-1">
                            {!isCancelled && (
                                <>
                                    {roomOpen ? (
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
                                    ) : (
                                        <Button variant="secondary" size="sm" disabled title={b.roomMessage || "Room is not open yet"}>
                                            <Video className="size-3.5" />
                                            Locked
                                        </Button>
                                    )}
                                    <Button
                                        variant="ghost" size="sm"
                                        className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))]/10"
                                        onClick={() => {
                                            setCancelError(null);
                                            setCancelReason("");
                                            setCancelTarget(b);
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                );
            })}
            {bookings.length > MAX_VISIBLE && (
                <button
                    onClick={() => setShowAll((v) => !v)}
                    className="px-1 pt-1 text-xs text-[hsl(var(--primary))] hover:underline text-left"
                >
                    {showAll
                        ? "Show less"
                        : `+ ${bookings.length - MAX_VISIBLE} more — load more`}
                </button>
            )}
            <ConfirmDialog
                open={cancelTarget !== null}
                title="Cancel booking?"
                description={
                    cancelTarget
                        ? `${cancelTarget.guestName} will be emailed that this booking was cancelled.`
                        : undefined
                }
                reasonLabel="Reason"
                reasonPlaceholder="Share the reason shown to the guest."
                reasonValue={cancelReason}
                reasonRequired
                onReasonChange={setCancelReason}
                confirmLabel="Cancel booking"
                cancelLabel="Keep booking"
                loadingLabel="Cancelling..."
                destructive
                pending={cancelPending}
                error={cancelError}
                onConfirm={handleCancel}
                onOpenChange={(open) => {
                    if (cancelPending) return;
                    if (!open) {
                        setCancelTarget(null);
                        setCancelError(null);
                        setCancelReason("");
                    }
                }}
            />
        </div>
    );
}

function cancellationActorLabel(cancelledBy?: HostBooking["cancelledBy"]): string {
    if (cancelledBy === "host") return "you";
    if (cancelledBy === "guest") return "guest";
    return "";
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

function timeRemainingLabel(start: Date): string {
    const ms = start.getTime() - Date.now();
    if (ms < 0) {
        const elapsedMin = Math.floor(Math.abs(ms) / 60000);
        if (elapsedMin < 60) return `started ${elapsedMin}m ago`;
        return "in progress";
    }
    const totalMin = Math.floor(ms / 60000);
    if (totalMin < 1) return "starting now";
    if (totalMin < 60) return `in ${totalMin}m`;
    const hours = Math.floor(totalMin / 60);
    const remMin = totalMin % 60;
    if (hours < 24) return remMin > 0 ? `in ${hours}h ${remMin}m` : `in ${hours}h`;
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    if (days < 7) return remHours > 0 ? `in ${days}d ${remHours}h` : `in ${days}d`;
    return "";
}

function startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
