"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Globe2, LayoutGrid, List, MousePointerClick } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/ConfirmDialog";
import { EditActionBar, EditTrigger } from "@/src/components/ui/EditActionBar";
import { InlineNotice } from "@/src/components/ui/InlineNotice";
import { DailyHours } from "@/src/components/dashboard/DailyHours";
import { FormError } from "@/src/components/ui/FormError";
import { Switch } from "@/src/components/ui/Switch";
import { cn } from "@/src/lib/utils";
import {
    DAYS,
    DEFAULT_END,
    DEFAULT_START,
    type DayLabel,
    type DayMap,
    daysToRules,
    defaultDays,
    formatTime12h,
    rulesToDays,
    TIME_OPTIONS,
    validateDays,
} from "@/src/lib/availability";
import { getAvailability, putAvailability } from "@/src/services/api/availability";

interface Props {
    timezone: string;
    onSaved?: () => void;
}

type EditorMode = "chart" | "manual";
type Drag = { dayIdx: number; startSlot: number; endSlot: number; mode: "paint" | "erase" } | null;
type Run = { start: number; end: number; length: number };

const START_HOUR = 7;
const END_HOUR = 22;
const SLOTS_PER_DAY = (END_HOUR - START_HOUR) * 2; // 30-min slots

const AXIS: { label: string; slot: number }[] = [
    { label: "7 AM", slot: 0 },
    { label: "10 AM", slot: 6 },
    { label: "1 PM", slot: 12 },
    { label: "4 PM", slot: 18 },
    { label: "7 PM", slot: 24 },
    { label: "10 PM", slot: 30 },
];

export function AvailabilityEditor({ timezone, onSaved }: Props) {
    const [days, setDays] = useState<DayMap>(defaultDays);
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedHint, setSavedHint] = useState(false);
    const [editing, setEditing] = useState(false);
    const [snapshot, setSnapshot] = useState<DayMap | null>(null);
    const [mode, setMode] = useState<EditorMode>("manual");
    const [clearWeekOpen, setClearWeekOpen] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [retry, setRetry] = useState(0);

    // Chart-mode state
    const [drag, setDrag] = useState<Drag>(null);
    const [hoveredSlot, setHoveredSlot] = useState<{ dayIdx: number; slotIdx: number } | null>(null);

    // Copy-to-day state (shared between both modes)
    const [copyOpen, setCopyOpen] = useState<DayLabel | null>(null);
    const [copyTargets, setCopyTargets] = useState<Set<DayLabel>>(new Set());

    useEffect(() => {
        let cancelled = false;
        setLoaded(false);
        setLoadError(null);
        (async () => {
            try {
                const rules = await getAvailability();
                if (cancelled) return;
                setDays(rulesToDays(rules));
            } catch (e) {
                if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load saved hours");
            } finally {
                if (!cancelled) setLoaded(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [retry]);

    const grid = useMemo(() => daysToGrid(days), [days]);
    const displayGrid = useMemo(() => withDrag(grid, drag), [grid, drag]);
    const localError = useMemo(() => validateDays(days), [days]);
    const enabledCount = useMemo(() => DAYS.reduce((n, d) => (days[d].enabled ? n + 1 : n), 0), [days]);

    function markDirty() {
        if (error) setError(null);
        if (savedHint) setSavedHint(false);
    }

    function enterEdit() {
        setSnapshot(days);
        setEditing(true);
        setSavedHint(false);
        setError(null);
    }

    function cancelEdit() {
        if (snapshot) setDays(snapshot);
        setEditing(false);
        setDrag(null);
        setCopyOpen(null);
        setError(null);
        setSavedHint(false);
    }

    // ── Chart drag ──────────────────────────────────────────────────────────────

    const commitDrag = useCallback(() => {
        setDrag((current) => {
            if (!current) return null;
            const next = withDrag(daysToGrid(days), current);
            setDays(gridToDays(next, days));
            return null;
        });
        markDirty();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [days]);

    useEffect(() => {
        if (!drag) return;
        const up = () => commitDrag();
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
        return () => {
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", up);
        };
    }, [drag, commitDrag]);

    // ── Day / shift handlers ────────────────────────────────────────────────────

    function toggleDay(day: DayLabel, on: boolean) {
        setDays((prev) => {
            const cfg = prev[day];
            if (on) {
                const shifts = cfg.shifts.length > 0 ? cfg.shifts : [{ start: DEFAULT_START, end: DEFAULT_END }];
                return { ...prev, [day]: { enabled: true, shifts } };
            }
            return { ...prev, [day]: { ...cfg, enabled: false } };
        });
        markDirty();
    }

    function updateShift(day: DayLabel, idx: number, field: "start" | "end", value: string) {
        setDays((prev) => {
            const shifts = prev[day].shifts.map((s, i) => (i === idx ? { ...s, [field]: value } : s));
            return { ...prev, [day]: { ...prev[day], shifts } };
        });
        markDirty();
    }

    function addShift(day: DayLabel) {
        setDays((prev) => {
            const existing = prev[day].shifts;
            const last = existing[existing.length - 1];
            const startIdx = last ? TIME_OPTIONS.indexOf(last.end) : TIME_OPTIONS.indexOf(DEFAULT_START);
            const newStart = TIME_OPTIONS[Math.max(0, startIdx)] ?? DEFAULT_START;
            const newEnd = TIME_OPTIONS[Math.min(startIdx + 4, TIME_OPTIONS.length - 1)] ?? DEFAULT_END;
            return { ...prev, [day]: { ...prev[day], shifts: [...existing, { start: newStart, end: newEnd }] } };
        });
        markDirty();
    }

    function removeShift(day: DayLabel, idx: number) {
        setDays((prev) => {
            const shifts = prev[day].shifts.filter((_, i) => i !== idx);
            return { ...prev, [day]: { ...prev[day], shifts, enabled: shifts.length > 0 } };
        });
        markDirty();
    }

    // ── Copy handlers ───────────────────────────────────────────────────────────

    function openCopy(day: DayLabel) {
        setCopyTargets(new Set(DAYS.filter((d) => d !== day && d !== "Sat" && d !== "Sun")));
        setCopyOpen(day);
    }

    function applyCopy(sourceDay: DayLabel) {
        const src = days[sourceDay].shifts.map((s) => ({ ...s }));
        setDays((prev) => {
            const next = { ...prev };
            for (const t of copyTargets) next[t] = { enabled: true, shifts: src.map((s) => ({ ...s })) };
            return next;
        });
        setCopyOpen(null);
        markDirty();
    }

    function clearWeek() {
        setDays((prev) => {
            const next = {} as DayMap;
            for (const d of DAYS) next[d] = { enabled: false, shifts: prev[d].shifts };
            return next;
        });
        setClearWeekOpen(false);
        markDirty();
    }

    async function handleSave() {
        if (saving) return;
        if (localError) {
            setError(localError);
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await putAvailability(daysToRules(days, timezone));
            setSavedHint(true);
            setEditing(false);
            onSaved?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save your hours");
        } finally {
            setSaving(false);
        }
    }

    if (!loaded)
        return (
            <div role="status" aria-busy="true">
                <span className="sr-only">Loading your working hours…</span>
                <div aria-hidden="true">
                    <div className="skeleton mb-5 h-9 w-52" />
                    {DAYS.map((day) => (
                        <div key={day} className="flex h-20 items-center gap-8 border-b border-[hsl(var(--border))]">
                            <div className="skeleton h-4 w-24" />
                            <div className="skeleton h-9 w-56 max-w-[55%]" />
                        </div>
                    ))}
                </div>
            </div>
        );
    if (loadError)
        return (
            <div>
                <FormError>{loadError}</FormError>
                <Button variant="outline" className="mt-4" onClick={() => setRetry((value) => value + 1)}>
                    Retry loading hours
                </Button>
            </div>
        );

    return (
        <div>
            {/* Header row: timezone note + mode toggle */}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <p className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                    <Globe2 className="size-4" />
                    {timezone.replace(/_/g, " ")}
                </p>
                <div className="flex items-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-0.5">
                    {(["manual", "chart"] as EditorMode[]).map((m) => (
                        <button
                            key={m}
                            type="button"
                            onClick={() => {
                                setMode(m);
                                setCopyOpen(null);
                            }}
                            aria-pressed={mode === m}
                            disabled={saving}
                            className={cn(
                                "flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                                mode === m
                                    ? "bg-[hsl(var(--surface))] text-[hsl(var(--foreground))] shadow-sm"
                                    : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
                            )}
                        >
                            {m === "chart" ? <LayoutGrid className="size-3" /> : <List className="size-3" />}
                            {m === "chart" ? "Week overview" : "Daily hours"}
                        </button>
                    ))}
                </div>
            </div>
            {editing && enabledCount === 0 && (
                <Button
                    variant="outline"
                    size="sm"
                    className="mb-4"
                    onClick={() => {
                        setDays(defaultDays());
                        markDirty();
                    }}
                    disabled={saving}
                >
                    Use Mon–Fri, 9 AM–5 PM
                </Button>
            )}

            {editing && mode === "chart" && (
                <InlineNotice icon={MousePointerClick} className="mb-5 text-xs">
                    Click a slot to toggle available/unavailable. Drag across slots to paint the same change.
                </InlineNotice>
            )}

            {/* ── Chart mode ── */}
            {mode === "chart" && (
                <div className="overflow-x-auto pb-2">
                    <div className={cn("min-w-[600px] select-none", editing && "touch-none")}>
                        {/* Time axis */}
                        <div className="mb-1.5 flex">
                            <div className="w-28 shrink-0" />
                            <div className="relative flex-1">
                                {AXIS.map(({ label, slot }) => (
                                    <span
                                        key={label}
                                        className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]"
                                        style={{ left: `${(slot / SLOTS_PER_DAY) * 100}%` }}
                                    >
                                        {label}
                                    </span>
                                ))}
                            </div>
                            <div className="w-8 shrink-0" />
                        </div>

                        <div className="mt-4 flex flex-col gap-1.5">
                            {DAYS.map((day, dayIdx) => {
                                const enabled = days[day].enabled;
                                const row = displayGrid[dayIdx];
                                const runs = computeRuns(row);

                                return (
                                    <div key={day} className="group flex items-center gap-3">
                                        <div className="flex w-28 shrink-0 items-center gap-2.5">
                                            <Switch
                                                size="sm"
                                                checked={enabled}
                                                disabled={!editing || saving}
                                                aria-label={`${day} available`}
                                                onChange={(on) => toggleDay(day, on)}
                                            />
                                            <span
                                                className={cn(
                                                    "w-8 text-sm font-semibold",
                                                    enabled
                                                        ? "text-[hsl(var(--foreground))]"
                                                        : "text-[hsl(var(--muted-foreground))]/50",
                                                )}
                                            >
                                                {day}
                                            </span>
                                        </div>

                                        {/* Grid wrapper — relative so tooltip can float above overflow-hidden */}
                                        <div className="relative flex-1">
                                            {hoveredSlot?.dayIdx === dayIdx && (
                                                <div
                                                    className="pointer-events-none absolute -top-7 z-20 -translate-x-1/2 whitespace-nowrap rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--foreground))] shadow-sm"
                                                    style={{
                                                        left: `${((hoveredSlot.slotIdx + 0.5) / SLOTS_PER_DAY) * 100}%`,
                                                    }}
                                                >
                                                    {slotLabel(hoveredSlot.slotIdx)}–
                                                    {slotLabel(hoveredSlot.slotIdx + 1)}
                                                </div>
                                            )}
                                            <div
                                                role="grid"
                                                aria-label={`${day} availability`}
                                                className={cn(
                                                    "relative overflow-hidden rounded-xl ring-1 transition-colors",
                                                    enabled
                                                        ? "bg-[hsl(var(--surface-2))] ring-[hsl(var(--border))]"
                                                        : "bg-[hsl(var(--surface-2))]/40 ring-[hsl(var(--border))]",
                                                )}
                                                style={{ height: 32 }}
                                            >
                                                {runs.map((run) => (
                                                    <div
                                                        key={run.start}
                                                        className="pointer-events-none absolute inset-y-[3px] flex items-center justify-center rounded-md border border-[hsl(var(--primary))]/20 bg-[hsl(var(--secondary))]"
                                                        style={{
                                                            left: `calc(${(run.start / SLOTS_PER_DAY) * 100}% + 2px)`,
                                                            right: `calc(${((SLOTS_PER_DAY - run.end - 1) / SLOTS_PER_DAY) * 100}% + 2px)`,
                                                        }}
                                                    >
                                                        {run.length >= 4 && (
                                                            <span className="truncate px-2 text-[11px] font-medium text-[hsl(var(--secondary-foreground))]">
                                                                {slotShortTime(run.start)}–{slotShortTime(run.end + 1)}
                                                            </span>
                                                        )}
                                                    </div>
                                                ))}
                                                <div className="absolute inset-0 grid grid-cols-[repeat(30,minmax(0,1fr))]">
                                                    {row.map((on, slotIdx) => (
                                                        <button
                                                            key={slotIdx}
                                                            type="button"
                                                            role="gridcell"
                                                            aria-selected={on}
                                                            aria-label={`${day} ${slotLabel(slotIdx)}`}
                                                            tabIndex={-1}
                                                            onPointerDown={(e) => {
                                                                if (!enabled || !editing || saving) return;
                                                                e.preventDefault();
                                                                setDrag({
                                                                    dayIdx,
                                                                    startSlot: slotIdx,
                                                                    endSlot: slotIdx,
                                                                    mode: on ? "erase" : "paint",
                                                                });
                                                            }}
                                                            onPointerEnter={() => {
                                                                if (enabled && editing && !saving)
                                                                    setDrag((d) =>
                                                                        d && d.dayIdx === dayIdx
                                                                            ? { ...d, endSlot: slotIdx }
                                                                            : d,
                                                                    );
                                                            }}
                                                            onMouseEnter={() => setHoveredSlot({ dayIdx, slotIdx })}
                                                            onMouseLeave={() => setHoveredSlot(null)}
                                                            className={cn(
                                                                "h-full transition-colors duration-75",
                                                                hoveredSlot?.dayIdx === dayIdx &&
                                                                    hoveredSlot.slotIdx === slotIdx
                                                                    ? on
                                                                        ? "bg-white/20"
                                                                        : "bg-[hsl(var(--primary))]/20"
                                                                    : "",
                                                                editing && enabled
                                                                    ? "cursor-pointer"
                                                                    : enabled
                                                                      ? "cursor-default"
                                                                      : "cursor-not-allowed",
                                                            )}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Per-row copy */}
                                        <div className="relative w-8 shrink-0">
                                            {enabled && editing && (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            copyOpen === day ? setCopyOpen(null) : openCopy(day)
                                                        }
                                                        aria-label={`Copy ${day}`}
                                                        className={cn(
                                                            "press flex size-7 items-center justify-center rounded-md transition-all",
                                                            "opacity-0 group-hover:opacity-100",
                                                            copyOpen === day
                                                                ? "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] opacity-100"
                                                                : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-3))] hover:text-[hsl(var(--foreground))]",
                                                        )}
                                                    >
                                                        <Copy className="size-3.5" />
                                                    </button>
                                                    {copyOpen === day && (
                                                        <CopyPopover
                                                            sourceDay={day}
                                                            targets={copyTargets}
                                                            onToggle={(d) =>
                                                                setCopyTargets((prev) => {
                                                                    const next = new Set(prev);
                                                                    next.has(d) ? next.delete(d) : next.add(d);
                                                                    return next;
                                                                })
                                                            }
                                                            onSelectAll={() =>
                                                                setCopyTargets(
                                                                    new Set(
                                                                        DAYS.filter((d) => d !== day) as DayLabel[],
                                                                    ),
                                                                )
                                                            }
                                                            onApply={() => applyCopy(day)}
                                                            onClose={() => setCopyOpen(null)}
                                                        />
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {mode === "manual" && (
                <DailyHours
                    days={days}
                    editing={editing}
                    saving={saving}
                    onToggle={toggleDay}
                    onUpdate={updateShift}
                    onAdd={addShift}
                    onRemove={removeShift}
                    renderCopy={(day) => (
                        <>
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={saving}
                                onClick={() => (copyOpen === day ? setCopyOpen(null) : openCopy(day))}
                                aria-label={`Copy ${day} hours`}
                            >
                                <Copy className="size-3.5" /> Copy
                            </Button>
                            {copyOpen === day && (
                                <CopyPopover
                                    sourceDay={day}
                                    targets={copyTargets}
                                    onToggle={(d) =>
                                        setCopyTargets((prev) => {
                                            const next = new Set(prev);
                                            next.has(d) ? next.delete(d) : next.add(d);
                                            return next;
                                        })
                                    }
                                    onSelectAll={() => setCopyTargets(new Set(DAYS.filter((d) => d !== day)))}
                                    onApply={() => applyCopy(day)}
                                    onClose={() => setCopyOpen(null)}
                                />
                            )}
                        </>
                    )}
                />
            )}

            {/* ── Footer ── */}
            <div
                className={cn(
                    "mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[hsl(var(--border))] bg-[hsl(var(--surface))] py-4",
                    editing && "sticky bottom-20 z-10 lg:bottom-0",
                )}
            >
                <div className="min-w-0 text-xs">
                    {error || (editing && localError) ? (
                        <span role="alert" className="text-[hsl(var(--destructive))]">
                            {error || localError}
                        </span>
                    ) : savedHint ? (
                        <span role="status" className="text-[hsl(var(--success))]">
                            Working hours saved.
                        </span>
                    ) : editing ? (
                        <span className="text-[hsl(var(--muted-foreground))]">Changes apply to new bookings only.</span>
                    ) : (
                        <span className="text-[hsl(var(--muted-foreground))]">{enabledCount} of 7 days bookable</span>
                    )}
                </div>

                {editing ? (
                    <EditActionBar
                        onClear={() => setClearWeekOpen(true)}
                        clearLabel="Clear week"
                        clearDisabled={enabledCount === 0}
                        onCancel={cancelEdit}
                        onSave={handleSave}
                        saving={saving}
                        saveDisabled={!loaded || !!localError}
                        saveLabel="Save hours"
                    />
                ) : (
                    <EditTrigger disabled={!loaded} onClick={enterEdit} label="Edit hours" />
                )}
            </div>
            <ConfirmDialog
                open={clearWeekOpen}
                title="Clear weekly availability?"
                description="All days will be marked unavailable. This affects new bookings after you save."
                confirmLabel="Clear week"
                destructive
                onConfirm={clearWeek}
                onOpenChange={setClearWeekOpen}
            />
        </div>
    );
}

// ─── Copy popover ─────────────────────────────────────────────────────────────

function CopyPopover({
    sourceDay,
    targets,
    onToggle,
    onSelectAll,
    onApply,
    onClose,
}: {
    sourceDay: DayLabel;
    targets: Set<DayLabel>;
    onToggle: (d: DayLabel) => void;
    onSelectAll: () => void;
    onApply: () => void;
    onClose: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const others = DAYS.filter((d) => d !== sourceDay) as DayLabel[];
    const allSelected = others.every((d) => targets.has(d));

    useEffect(() => {
        function down(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        }
        function key(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        document.addEventListener("mousedown", down);
        document.addEventListener("keydown", key);
        return () => {
            document.removeEventListener("mousedown", down);
            document.removeEventListener("keydown", key);
        };
    }, [onClose]);

    return (
        <div
            ref={ref}
            className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-3 shadow-lg"
        >
            <p className="mb-2 text-xs font-semibold text-[hsl(var(--foreground))]">Copy {sourceDay} hours to</p>
            <button
                type="button"
                onClick={onSelectAll}
                aria-pressed={allSelected}
                className="press mb-1.5 flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-[hsl(var(--surface-2))]"
            >
                <Checkbox checked={allSelected} />
                <span className="text-[hsl(var(--muted-foreground))]">Select all</span>
            </button>
            <div className="flex flex-col gap-0.5">
                {others.map((d) => (
                    <button
                        key={d}
                        type="button"
                        onClick={() => onToggle(d)}
                        aria-pressed={targets.has(d)}
                        className="press flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-[hsl(var(--surface-2))]"
                    >
                        <Checkbox checked={targets.has(d)} />
                        <span
                            className={
                                targets.has(d) ? "text-[hsl(var(--foreground))]" : "text-[hsl(var(--muted-foreground))]"
                            }
                        >
                            {d}
                        </span>
                    </button>
                ))}
            </div>
            <div className="mt-3 flex gap-2">
                <Button size="sm" className="flex-1 text-xs" onClick={onApply} disabled={targets.size === 0}>
                    Apply
                </Button>
                <Button size="sm" variant="ghost" className="text-xs" onClick={onClose}>
                    Cancel
                </Button>
            </div>
        </div>
    );
}

function Checkbox({ checked }: { checked: boolean }) {
    return (
        <span
            className={cn(
                "flex size-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors",
                checked ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]" : "border-[hsl(var(--border))]",
            )}
        >
            {checked && <Check className="size-2.5 text-white" />}
        </span>
    );
}

// ─── Grid helpers ─────────────────────────────────────────────────────────────

function daysToGrid(days: DayMap): boolean[][] {
    return DAYS.map((d) => {
        const row = Array<boolean>(SLOTS_PER_DAY).fill(false);
        const cfg = days[d];
        if (!cfg.enabled) return row;
        for (const s of cfg.shifts) {
            const a = clamp(timeToSlot(s.start));
            const b = clamp(timeToSlot(s.end));
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
                shifts.push({ start: slotTime(runStart), end: slotTime(i) });
                runStart = null;
            }
        }
        if (runStart !== null) shifts.push({ start: slotTime(runStart), end: slotTime(SLOTS_PER_DAY) });
        next[day] = {
            enabled: shifts.length > 0,
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
    for (let s = lo; s <= hi; s++) next[drag.dayIdx][s] = drag.mode === "paint";
    return next;
}

function computeRuns(row: boolean[]): Run[] {
    const runs: Run[] = [];
    let i = 0;
    while (i < row.length) {
        if (row[i]) {
            let j = i;
            while (j < row.length && row[j]) j++;
            runs.push({ start: i, end: j - 1, length: j - i });
            i = j;
        } else {
            i++;
        }
    }
    return runs;
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

function timeToSlot(t: string): number {
    const [h, m] = t.split(":").map(Number);
    return Math.round((h * 60 + m - START_HOUR * 60) / 30);
}

function slotTime(slot: number): string {
    const total = START_HOUR * 60 + slot * 30;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function slotShortTime(slot: number): string {
    const [h, m] = slotTime(Math.min(slot, SLOTS_PER_DAY)).split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function slotLabel(slot: number): string {
    const [h, m] = slotTime(slot).split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function clamp(s: number): number {
    return Math.max(0, Math.min(SLOTS_PER_DAY, s));
}
