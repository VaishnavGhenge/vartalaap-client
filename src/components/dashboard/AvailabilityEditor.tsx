"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/src/components/ui/button";
import { BufferingButtonLabel } from "@/src/components/ui/BufferingButtonLabel";
import { Select } from "@/src/components/ui/select";
import {
    DAYS,
    DEFAULT_END,
    DEFAULT_START,
    TIME_OPTIONS,
    type DayLabel,
    type DayMap,
    daysToRules,
    defaultDays,
    formatTime12h,
    rulesToDays,
    validateDays,
} from "@/src/lib/availability";
import { getAvailability, putAvailability } from "@/src/services/api/availability";

interface Props {
    timezone: string;
    onSaved?: () => void;
}

// Split-shift weekly availability editor. Unlike the onboarding Step 2 form,
// this one supports multiple windows per day (e.g. 9-12 + 2-5 with a lunch
// gap) — that's the only Cal.com-style power feature scheduling needs at
// launch. Everything else (overrides, custom dates) waits.
export function AvailabilityEditor({ timezone, onSaved }: Props) {
    const [days, setDays] = useState<DayMap>(defaultDays);
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedHint, setSavedHint] = useState(false);

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
        return () => { cancelled = true; };
    }, []);

    const localError = useMemo(() => validateDays(days), [days]);

    function setDay(day: DayLabel, patch: Partial<DayMap[DayLabel]>) {
        setDays((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
        if (error) setError(null);
        if (savedHint) setSavedHint(false);
    }
    function toggleDay(day: DayLabel) {
        const cfg = days[day];
        if (cfg.enabled) {
            setDay(day, { enabled: false });
        } else {
            // Re-enabling restores at least one shift so the user has something
            // to edit immediately.
            const shifts = cfg.shifts.length > 0
                ? cfg.shifts
                : [{ start: DEFAULT_START, end: DEFAULT_END }];
            setDay(day, { enabled: true, shifts });
        }
    }
    function setShift(day: DayLabel, idx: number, patch: { start?: string; end?: string }) {
        setDays((prev) => ({
            ...prev,
            [day]: {
                ...prev[day],
                shifts: prev[day].shifts.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
            },
        }));
        if (error) setError(null);
        if (savedHint) setSavedHint(false);
    }
    function addShift(day: DayLabel) {
        const cfg = days[day];
        // Default new shift to start where the previous one ends — common case
        // is "lunch break", so 09-12 + 13-17 type patterns.
        const last = cfg.shifts[cfg.shifts.length - 1];
        const next = last
            ? { start: last.end, end: nextDefault(last.end) }
            : { start: DEFAULT_START, end: DEFAULT_END };
        setDay(day, { enabled: true, shifts: [...cfg.shifts, next] });
    }
    function removeShift(day: DayLabel, idx: number) {
        const cfg = days[day];
        const remaining = cfg.shifts.filter((_, i) => i !== idx);
        if (remaining.length === 0) {
            setDay(day, { enabled: false, shifts: [] });
        } else {
            setDay(day, { shifts: remaining });
        }
    }

    async function handleSave() {
        if (localError) { setError(localError); return; }
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
            <div className="flex flex-col gap-3">
                {DAYS.map((day) => {
                    const cfg = days[day];
                    return (
                        <div key={day} className="flex flex-wrap items-start gap-3">
                            <button
                                type="button"
                                onClick={() => toggleDay(day)}
                                aria-label={`${cfg.enabled ? "Disable" : "Enable"} ${day}`}
                                aria-pressed={cfg.enabled}
                                className={
                                    "press relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors " +
                                    (cfg.enabled
                                        ? "bg-[hsl(var(--primary))]"
                                        : "bg-[hsl(var(--border))]")
                                }
                            >
                                <span
                                    className={
                                        "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform " +
                                        (cfg.enabled ? "translate-x-4" : "translate-x-0")
                                    }
                                />
                            </button>
                            <span className={
                                "w-8 pt-0.5 text-sm font-medium " +
                                (cfg.enabled ? "text-[hsl(var(--foreground))]" : "text-[hsl(var(--muted-foreground))]")
                            }>
                                {day}
                            </span>

                            <div className="ml-auto flex flex-1 flex-col items-end gap-2">
                                {cfg.enabled ? (
                                    <>
                                        {cfg.shifts.map((shift, idx) => (
                                            <div key={idx} className="flex items-center gap-1.5">
                                                <Select
                                                    aria-label={`${day} shift ${idx + 1} start`}
                                                    value={shift.start}
                                                    onChange={(e) => setShift(day, idx, { start: e.target.value })}
                                                    selectSize="sm"
                                                    wrapperClassName="w-[6.75rem]"
                                                >
                                                    {TIME_OPTIONS.map((t) => (
                                                        <option key={t} value={t}>{formatTime12h(t)}</option>
                                                    ))}
                                                </Select>
                                                <span className="text-xs text-[hsl(var(--muted-foreground))]">to</span>
                                                <Select
                                                    aria-label={`${day} shift ${idx + 1} end`}
                                                    value={shift.end}
                                                    onChange={(e) => setShift(day, idx, { end: e.target.value })}
                                                    selectSize="sm"
                                                    wrapperClassName="w-[6.75rem]"
                                                >
                                                    {TIME_OPTIONS.map((t) => (
                                                        <option key={t} value={t}>{formatTime12h(t)}</option>
                                                    ))}
                                                </Select>
                                                <button
                                                    type="button"
                                                    aria-label={`Remove ${day} shift ${idx + 1}`}
                                                    onClick={() => removeShift(day, idx)}
                                                    className="press cursor-pointer rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-3))] hover:text-[hsl(var(--foreground))]"
                                                >
                                                    <X className="size-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() => addShift(day)}
                                            className="press inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-[hsl(var(--primary))] hover:underline"
                                        >
                                            <Plus className="size-3.5" /> Add window
                                        </button>
                                    </>
                                ) : (
                                    <span className="pt-0.5 text-xs text-[hsl(var(--muted-foreground))]">Off</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
                <div className="min-w-0 text-xs">
                    {error ? (
                        <span className="text-[hsl(var(--destructive))]">{error}</span>
                    ) : savedHint ? (
                        <span className="text-[hsl(var(--primary))]">Saved.</span>
                    ) : (
                        <span className="text-[hsl(var(--muted-foreground))]">
                            Times are in {timezone.replace(/_/g, " ")}.
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

// Pick a sensible default end-time for a new shift seeded from an existing
// end-time. We bump by 1 hour but clamp inside the TIME_OPTIONS window so the
// dropdown always has the value.
function nextDefault(start: string): string {
    const idx = TIME_OPTIONS.indexOf(start);
    if (idx < 0) return DEFAULT_END;
    const nextIdx = Math.min(idx + 2, TIME_OPTIONS.length - 1); // 2 × 30min = 1h
    return TIME_OPTIONS[nextIdx];
}
