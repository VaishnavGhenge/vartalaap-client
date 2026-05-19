"use client";

import { Calendar, Video, Clock, Ban, Info } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/ConfirmDialog";
import { InlineNotice } from "@/src/components/ui/InlineNotice";
import { cancelBooking, listMyBookings, type HostBooking } from "@/src/services/api/bookings";
import { roomPath } from "@/src/lib/room-routes";
import { cn } from "@/src/lib/utils";

type TabKey = "upcoming" | "active" | "past" | "cancelled";

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
    { key: "upcoming", label: "Upcoming" },
    { key: "active", label: "Active" },
    { key: "past", label: "Past" },
    { key: "cancelled", label: "Cancelled" },
];

export function BookingsPanel() {
    const [bookings, setBookings] = useState<HostBooking[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<TabKey>("upcoming");
    const [cancelTarget, setCancelTarget] = useState<HostBooking | null>(null);
    const [cancelPending, setCancelPending] = useState(false);
    const [cancelError, setCancelError] = useState<string | null>(null);
    const [cancelReason, setCancelReason] = useState("");
    const [nowMs, setNowMs] = useState(Date.now);

    useEffect(() => {
        const id = setInterval(() => setNowMs(Date.now()), 30_000);
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
    }, []);

    async function handleCancel() {
        if (!cancelTarget) return;
        setCancelPending(true);
        setCancelError(null);
        try {
            await cancelBooking(cancelTarget.id, cancelReason);
            setBookings((prev) => prev.map((b) =>
                b.id === cancelTarget.id
                    ? { ...b, status: "cancelled", cancellationReason: cancelReason, cancelledBy: "host" }
                    : b,
            ));
            setCancelTarget(null);
            setCancelReason("");
        } catch (e) {
            setCancelError(e instanceof Error ? e.message : "Could not cancel");
        } finally {
            setCancelPending(false);
        }
    }

    const activeWindow = 30 * 60 * 1000;

    const buckets: Record<TabKey, HostBooking[]> = {
        active: bookings.filter((b) => {
            if (b.status === "cancelled") return false;
            const start = new Date(b.startsAt).getTime();
            const end = new Date(b.endsAt).getTime();
            return start <= nowMs + activeWindow && end > nowMs;
        }),
        upcoming: bookings.filter((b) => {
            if (b.status === "cancelled") return false;
            const start = new Date(b.startsAt).getTime();
            return start > nowMs + activeWindow;
        }),
        past: bookings.filter((b) => {
            if (b.status === "cancelled") return false;
            const end = new Date(b.endsAt).getTime();
            const start = new Date(b.startsAt).getTime();
            return end <= nowMs && start <= nowMs - activeWindow;
        }),
        cancelled: bookings.filter((b) => b.status === "cancelled"),
    };

    const items = buckets[tab];

    return (
        <section className="app-panel no-lift rounded-2xl p-5 sm:p-6">
            {/* Tab bar */}
            <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-[hsl(var(--surface-2))] p-1 sm:overflow-visible">
                {TABS.map(({ key, label }) => {
                    const count = buckets[key].length;
                    const active = tab === key;
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setTab(key)}
                            className={cn(
                                "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/50",
                                active
                                    ? "bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-sm"
                                    : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
                            )}
                        >
                            {label}
                            {!loading && count > 0 && (
                                <span className={cn(
                                    "inline-flex h-4.5 min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums leading-none",
                                    active
                                        ? key === "cancelled"
                                            ? "bg-[hsl(var(--destructive))]/15 text-[hsl(var(--destructive))]"
                                            : key === "active"
                                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                            : "bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))]"
                                        : "bg-[hsl(var(--surface-3))] text-[hsl(var(--muted-foreground))]",
                                )}>
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            <InlineNotice icon={Info} className="mb-5 text-xs">
                Rooms open shortly before the scheduled time. Cancelling a booking emails the guest with your reason.
            </InlineNotice>

            {/* Content */}
            {loading ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading…</p>
            ) : error ? (
                <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>
            ) : items.length === 0 ? (
                <EmptyState tab={tab} />
            ) : tab === "past" || tab === "cancelled" ? (
                <ChronList
                    items={items}
                    nowMs={nowMs}
                    tab={tab}
                    onCancel={(b) => { setCancelError(null); setCancelReason(""); setCancelTarget(b); }}
                />
            ) : (
                <DayGroupedList
                    items={items}
                    nowMs={nowMs}
                    tab={tab}
                    onCancel={(b) => { setCancelError(null); setCancelReason(""); setCancelTarget(b); }}
                />
            )}

            <ConfirmDialog
                open={cancelTarget !== null}
                title="Cancel booking?"
                description={cancelTarget ? `${cancelTarget.guestName} will be emailed that this booking was cancelled.` : undefined}
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
                    if (!open) { setCancelTarget(null); setCancelError(null); setCancelReason(""); }
                }}
            />
        </section>
    );
}

// ─── Sub-views ────────────────────────────────────────────────────────────────

function DayGroupedList({ items, nowMs, tab, onCancel }: {
    items: HostBooking[];
    nowMs: number;
    tab: TabKey;
    onCancel: (b: HostBooking) => void;
}) {
    const groups = groupByDay(items);
    return (
        <div className="flex flex-col gap-5">
            {groups.map(({ label, items: dayItems }) => (
                <div key={label} className="flex flex-col gap-2">
                    <p className="label-caps text-[hsl(var(--muted-foreground))]">{label}</p>
                    {dayItems.map((b) => (
                        <BookingRow key={b.id} b={b} nowMs={nowMs} tab={tab} onCancel={onCancel} />
                    ))}
                </div>
            ))}
        </div>
    );
}

function ChronList({ items, nowMs, tab, onCancel }: {
    items: HostBooking[];
    nowMs: number;
    tab: TabKey;
    onCancel: (b: HostBooking) => void;
}) {
    // past and cancelled shown most-recent first
    const sorted = [...items].sort(
        (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
    );
    const groups = groupByMonthYear(sorted);
    return (
        <div className="flex flex-col gap-5">
            {groups.map(({ label, items: groupItems }) => (
                <div key={label} className="flex flex-col gap-2">
                    <p className="label-caps text-[hsl(var(--muted-foreground))]">{label}</p>
                    {groupItems.map((b) => (
                        <BookingRow key={b.id} b={b} nowMs={nowMs} tab={tab} onCancel={onCancel} />
                    ))}
                </div>
            ))}
        </div>
    );
}

function BookingRow({ b, nowMs, tab, onCancel }: {
    b: HostBooking;
    nowMs: number;
    tab: TabKey;
    onCancel: (b: HostBooking) => void;
}) {
    const start = new Date(b.startsAt);
    const end = new Date(b.endsAt);
    const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
    const isCancelled = b.status === "cancelled";
    const isLive = !isCancelled && start.getTime() <= nowMs && end.getTime() > nowMs;
    const isImminent = !isCancelled && !isLive && start.getTime() <= nowMs + 30 * 60 * 1000;
    const roomOpen = b.roomStatus === "open";
    const roomHint = roomAccessHint(b);

    return (
        <div className={cn(
            "relative flex items-center gap-4 overflow-hidden rounded-xl border px-4 py-3 transition-colors",
            isCancelled
                ? "border-[hsl(var(--border))]/60 bg-[hsl(var(--surface-2))]/60 opacity-70"
                : isLive
                ? "border-emerald-500/30 bg-emerald-500/5"
                : isImminent
                ? "border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/5"
                : "border-[hsl(var(--border))]/70 bg-[hsl(var(--surface-2))]",
        )}>
            <span className={cn(
                "absolute inset-y-0 left-0 w-[3px]",
                isCancelled ? "bg-[hsl(var(--destructive))]/40" :
                isLive ? "bg-emerald-500" :
                isImminent ? "bg-[hsl(var(--primary))]" :
                tab === "past" ? "bg-[hsl(var(--border))]" :
                "bg-[hsl(var(--primary))]/40",
            )} />

            {/* Date/time */}
            <div className="w-16 shrink-0 text-center">
                <p className="text-[11px] font-medium text-[hsl(var(--muted-foreground))]">
                    {start.toLocaleDateString([], { month: "short", day: "numeric" })}
                </p>
                <p className="text-sm font-bold tabular-nums text-[hsl(var(--foreground))]">
                    {start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })}
                </p>
                {isLive && (
                    <p className="mt-0.5 text-[10px] font-semibold leading-none text-emerald-500">Live</p>
                )}
                {isImminent && !isLive && (
                    <p className="mt-0.5 text-[10px] font-semibold leading-none text-[hsl(var(--primary))]">
                        {timeRemainingLabel(start)}
                    </p>
                )}
            </div>

            <div className="h-8 w-px shrink-0 bg-[hsl(var(--border))]/60" />

            {/* Info */}
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">
                    {b.eventTitle ?? "Session"}
                </p>
                <p className="mt-0.5 truncate text-xs text-[hsl(var(--muted-foreground))]">
                    {isCancelled
                        ? `Cancelled by ${b.cancelledBy === "host" ? "you" : b.cancelledBy === "guest" ? "guest" : "—"}`
                        : b.guestName}
                    {durationMin > 0 && <span> · {durationMin} min</span>}
                </p>
                {isCancelled && b.cancellationReason && (
                    <p className="mt-1 line-clamp-1 text-xs text-[hsl(var(--muted-foreground))]">
                        {b.cancellationReason}
                    </p>
                )}
                {!isCancelled && tab !== "past" && !roomOpen && roomHint && (
                    <p className="mt-1 line-clamp-1 text-xs text-[hsl(var(--muted-foreground))]">
                        {roomHint}
                    </p>
                )}
            </div>

            {/* Actions */}
            <div className="flex shrink-0 items-center gap-1">
                {!isCancelled && tab !== "past" && (
                    <>
                        {roomOpen ? (
                            <Button asChild variant={isLive || isImminent ? "primary" : "secondary"} size="sm">
                                <Link href={roomPath(b.meetCode)} prefetch>
                                    <Video className="size-3.5" />
                                    {isLive ? "Join" : "Open"}
                                </Link>
                            </Button>
                        ) : (
                            <Button variant="secondary" size="sm" disabled title={roomHint ?? "Room not open yet"}>
                                <Video className="size-3.5" />
                                Locked
                            </Button>
                        )}
                        <Button
                            variant="ghost" size="sm"
                            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))]/10"
                            onClick={() => onCancel(b)}
                        >
                            Cancel
                        </Button>
                    </>
                )}
                {tab === "past" && (
                    <span className="rounded-full bg-[hsl(var(--surface-3))] px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--muted-foreground))]">
                        Completed
                    </span>
                )}
            </div>
        </div>
    );
}

function EmptyState({ tab }: { tab: TabKey }) {
    const copy: Record<TabKey, { icon: typeof Calendar; message: string }> = {
        upcoming: { icon: Calendar, message: "No upcoming bookings." },
        active: { icon: Clock, message: "No active sessions right now." },
        past: { icon: Calendar, message: "No past bookings yet." },
        cancelled: { icon: Ban, message: "No cancelled bookings." },
    };
    const { icon: Icon, message } = copy[tab];
    return (
        <div className="rounded-xl border border-dashed border-[hsl(var(--border))]/70 bg-[hsl(var(--surface-2))] px-4 py-8 text-center">
            <Icon className="mx-auto mb-2 size-5 text-[hsl(var(--muted-foreground))]" />
            <p className="text-sm text-[hsl(var(--muted-foreground))]">{message}</p>
        </div>
    );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupByDay(bookings: HostBooking[]): Array<{ label: string; items: HostBooking[] }> {
    const map = new Map<string, HostBooking[]>();
    for (const b of bookings) {
        const label = relativeDayLabel(new Date(b.startsAt));
        if (!map.has(label)) map.set(label, []);
        map.get(label)!.push(b);
    }
    return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

function groupByMonthYear(bookings: HostBooking[]): Array<{ label: string; items: HostBooking[] }> {
    const map = new Map<string, HostBooking[]>();
    for (const b of bookings) {
        const d = new Date(b.startsAt);
        const label = d.toLocaleDateString([], { month: "long", year: "numeric" });
        if (!map.has(label)) map.set(label, []);
        map.get(label)!.push(b);
    }
    return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

function relativeDayLabel(date: Date): string {
    const today = startOfDay(new Date());
    const d = startOfDay(date);
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff < 7) return date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
    return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function timeRemainingLabel(start: Date): string {
    const ms = start.getTime() - Date.now();
    if (ms < 0) return "now";
    const totalMin = Math.floor(ms / 60000);
    if (totalMin < 1) return "now";
    if (totalMin < 60) return `in ${totalMin}m`;
    const hours = Math.floor(totalMin / 60);
    const remMin = totalMin % 60;
    return remMin > 0 ? `in ${hours}h ${remMin}m` : `in ${hours}h`;
}

function startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function roomAccessHint(b: HostBooking): string | null {
    if (b.roomStatus === "open") return "Room is open.";
    if (b.roomStatus === "too_early") {
        if (b.roomOpensAt) return `Room opens ${formatShortDateTime(new Date(b.roomOpensAt))}.`;
        return b.roomMessage ?? "Room opens shortly before the scheduled time.";
    }
    if (b.roomStatus === "ended") return "Room window has ended.";
    if (b.roomStatus === "cancelled") return "Booking was cancelled.";
    return b.roomMessage ?? null;
}

function formatShortDateTime(date: Date): string {
    return date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}
