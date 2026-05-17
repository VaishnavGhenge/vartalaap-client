"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/src/components/ui/button";
import { BufferingButtonLabel } from "@/src/components/ui/BufferingButtonLabel";
import { cn } from "@/src/lib/utils";
import {
    DAYS,
    type DayLabel,
    type DayMap,
    daysToRules,
    defaultDays,
    rulesToDays,
    validateDays,
} from "@/src/lib/availability";
import { getAvailability, putAvailability } from "@/src/services/api/availability";

interface Props {
    timezone: string;
    onSaved?: () => void;
}

// Grid covers 7:00 AM → 10:00 PM in 30-minute slots, matching the legacy
// dropdown range so existing data round-trips cleanly. 15 hrs × 2 = 30 slots.
const START_HOUR = 7;
const END_HOUR = 22;
const SLOTS_PER_DAY = (END_HOUR - START_HOUR) * 2;
const AXIS_LABELS = ["7a", "10a", "1p", "4p", "7p", "10p"];

type Drag = {
    dayIdx: number;
    startSlot: number;
    endSlot: number;
    mode: "paint" | "erase";
} | null;

export function AvailabilityEditor({ timezone, onSaved }: Props) {
    const [days, setDays] = useState<DayMap>(defaultDays);
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedHint, setSavedHint] = useState(false);
    const [drag, setDrag] = useState<Drag>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const rules = await getAvailability();
                if (cancelled) return;
                setDays(rules.length > 0 ? rulesToDays(rules) : defaultDays());
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "Could not load saved hours");
            } finally {
                if (!cancelled) setLoaded(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const grid = useMemo(() => daysToGrid(days), [days]);
    const displayGrid = useMemo(() => withDrag(grid, drag), [grid, drag]);

    const localError = useMemo(() => validateDays(days), [days]);
    const weeklyMins = useMemo(() => weeklyMinutes(days), [days]);
    const enabledCount = useMemo(
        () => DAYS.reduce((n, d) => (days[d].enabled ? n + 1 : n), 0),
        [days],
    );

    function markDirty() {
        if (error) setError(null);
        if (savedHint) setSavedHint(false);
    }

    const commitDrag = useCallback(() => {
        setDrag((current) => {
            if (!current) return null;
            const next = withDrag(daysToGrid(days), current);
            setDays(gridToDays(next, days));
            return null;
        });
        markDirty();
        // markDirty depends on error/savedHint, but we want a stable callback;
        // re-running on those flag flips is fine because the listener resets.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [days]);

    // A drag can end anywhere — outside the grid, outside the window. Listen
    // globally so we never leave the editor stuck in mid-drag state.
    useEffect(() => {
        if (!drag) return;
        const onUp = () => commitDrag();
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
        return () => {
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
        };
    }, [drag, commitDrag]);

    function handleCellDown(dayIdx: number, slotIdx: number) {
        const painted = grid[dayIdx][slotIdx];
        setDrag({
            dayIdx,
            startSlot: slotIdx,
            endSlot: slotIdx,
            mode: painted ? "erase" : "paint",
        });
    }
    function handleCellEnter(dayIdx: number, slotIdx: number) {
        setDrag((d) => {
            if (!d || d.dayIdx !== dayIdx) return d;
            return { ...d, endSlot: slotIdx };
        });
    }

    function copyMondayToWeekdays() {
        const mon = days.Mon;
        if (!mon.enabled) return;
        setDays((prev) => {
            const next = { ...prev };
            for (const d of ["Tue", "Wed", "Thu", "Fri"] as DayLabel[]) {
                next[d] = { enabled: true, shifts: mon.shifts.map((s) => ({ ...s })) };
            }
            return next;
        });
        markDirty();
    }
    function clearWeek() {
        setDays((prev) => {
            const next = {} as DayMap;
            for (const d of DAYS) next[d] = { enabled: false, shifts: [] };
            return next;
        });
        markDirty();
    }

    async function handleSave() {
        if (localError) {
            setError(localError);
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await putAvailability(daysToRules(days, timezone));
            setSavedHint(true);
            onSaved?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save your hours");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
                All times in {timezone.replace(/_/g, " ")}. Click and drag to paint bookable hours;
                drag over painted hours to remove.
            </p>

            <div className="mt-5">
                {/* Time axis */}
                <div className="flex pl-10 pr-1">
                    <div className="flex flex-1 justify-between text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                        {AXIS_LABELS.map((label) => (
                            <span key={label}>{label}</span>
                        ))}
                    </div>
                </div>

                {/* Day rows */}
                <div className="mt-2 flex select-none flex-col gap-1.5 touch-none">
                    {DAYS.map((day, dayIdx) => {
                        const row = displayGrid[dayIdx];
                        const active = row.some(Boolean);
                        return (
                            <div key={day} className="flex items-center gap-3">
                                <span
                                    className={cn(
                                        "w-7 text-sm font-semibold tracking-wide",
                                        active
                                            ? "text-[hsl(var(--foreground))]"
                                            : "text-[hsl(var(--muted-foreground))]/60",
                                    )}
                                >
                                    {day}
                                </span>
                                <div
                                    role="grid"
                                    aria-label={`${day} availability`}
                                    className="grid h-8 flex-1 grid-cols-[repeat(30,minmax(0,1fr))] overflow-hidden rounded-lg bg-[hsl(var(--surface-3))]/50 ring-1 ring-[hsl(var(--border))]/40"
                                >
                                    {row.map((on, slotIdx) => (
                                        <button
                                            key={slotIdx}
                                            type="button"
                                            role="gridcell"
                                            aria-pressed={on}
                                            aria-label={`${day} ${slotLabel(slotIdx)}`}
                                            tabIndex={-1}
                                            onPointerDown={(e) => {
                                                e.preventDefault();
                                                handleCellDown(dayIdx, slotIdx);
                                            }}
                                            onPointerEnter={() => handleCellEnter(dayIdx, slotIdx)}
                                            className={cn(
                                                "h-full cursor-pointer transition-colors duration-75",
                                                slotIdx > 0 &&
                                                    slotIdx % 6 === 0 &&
                                                    "border-l border-[hsl(var(--background))]/50",
                                                on
                                                    ? "bg-[hsl(var(--primary))]"
                                                    : "hover:bg-[hsl(var(--primary))]/15",
                                            )}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Stats + bulk actions */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    <span className="font-medium text-[hsl(var(--foreground))]">
                        {formatHours(weeklyMins)} hrs
                    </span>{" "}
                    · {enabledCount} of 7 days bookable
                </p>
                <div className="flex gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={enabledCount === 0 || saving}
                        onClick={clearWeek}
                    >
                        Clear week
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        disabled={!days.Mon.enabled || saving}
                        onClick={copyMondayToWeekdays}
                    >
                        Copy Mon → weekdays
                    </Button>
                </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-[hsl(var(--border))]/40 pt-4">
                <div className="min-w-0 text-xs">
                    {error ? (
                        <span className="text-[hsl(var(--destructive))]">{error}</span>
                    ) : savedHint ? (
                        <span className="text-[hsl(var(--primary))]">Saved.</span>
                    ) : (
                        <span className="text-[hsl(var(--muted-foreground))]">
                            Changes apply to new bookings only.
                        </span>
                    )}
                </div>
                <Button onClick={handleSave} disabled={saving || !loaded || !!localError}>
                    {saving ? <BufferingButtonLabel label="Saving…" /> : "Save"}
                </Button>
            </div>
        </div>
    );
}

// ─── Grid ↔ DayMap conversion ────────────────────────────────────────────────

function daysToGrid(days: DayMap): boolean[][] {
    return DAYS.map((d) => {
        const row = Array<boolean>(SLOTS_PER_DAY).fill(false);
        const cfg = days[d];
        if (!cfg.enabled) return row;
        for (const s of cfg.shifts) {
            const a = clampSlot(timeToSlot(s.start));
            const b = clampSlot(timeToSlot(s.end));
            for (let i = a; i < b; i++) row[i] = true;
        }
        return row;
    });
}

function gridToDays(grid: boolean[][], previous: DayMap): DayMap {
    const next = {} as DayMap;
    DAYS.forEach((day, idx) => {
        const row = grid[idx];
        const shifts: { start: string; end: string }[] = [];
        let runStart: number | null = null;
        for (let i = 0; i < SLOTS_PER_DAY; i++) {
            if (row[i] && runStart === null) runStart = i;
            else if (!row[i] && runStart !== null) {
                shifts.push({ start: slotStartTime(runStart), end: slotStartTime(i) });
                runStart = null;
            }
        }
        if (runStart !== null) {
            shifts.push({
                start: slotStartTime(runStart),
                end: slotStartTime(SLOTS_PER_DAY),
            });
        }
        next[day] = {
            enabled: shifts.length > 0,
            // Preserving the prior shifts when the row goes empty lets the
            // user toggle a day back on (via Copy Mon → weekdays) without
            // losing their old hours; the API only writes enabled days.
            shifts: shifts.length > 0 ? shifts : previous[day].shifts,
        };
    });
    return next;
}

function withDrag(grid: boolean[][], drag: Drag): boolean[][] {
    if (!drag) return grid;
    const next = grid.map((r) => r.slice());
    const lo = Math.min(drag.startSlot, drag.endSlot);
    const hi = Math.max(drag.startSlot, drag.endSlot);
    const value = drag.mode === "paint";
    for (let s = lo; s <= hi; s++) next[drag.dayIdx][s] = value;
    return next;
}

// ─── Time helpers ────────────────────────────────────────────────────────────

function timeToSlot(time: string): number {
    const [h, m] = time.split(":").map(Number);
    return Math.round((h * 60 + m - START_HOUR * 60) / 30);
}

function slotStartTime(slot: number): string {
    const total = START_HOUR * 60 + slot * 30;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function slotLabel(slot: number): string {
    const hhmm = slotStartTime(slot);
    const [h, m] = hhmm.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function clampSlot(s: number): number {
    return Math.max(0, Math.min(SLOTS_PER_DAY, s));
}

function toMinutes(t: string): number {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
}

function weeklyMinutes(days: DayMap): number {
    let total = 0;
    for (const d of DAYS) {
        const cfg = days[d];
        if (!cfg.enabled) continue;
        for (const s of cfg.shifts) {
            total += Math.max(0, toMinutes(s.end) - toMinutes(s.start));
        }
    }
    return total;
}

function formatHours(minutes: number): string {
    if (minutes === 0) return "0";
    const h = minutes / 60;
    const rounded = Math.round(h * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
