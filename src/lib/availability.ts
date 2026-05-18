// Shared primitives for availability editing UIs. The onboarding step shows a
// single window per day for low cognitive load; the dashboard editor lifts
// that constraint and supports split shifts. Both reuse what's here so the
// wire format and time picker stay in sync.

import type { AvailabilityRule } from '@/src/services/api/availability'

// UI order vs wire order. The picker reads Mon→Sun, but `dayOfWeek` on the
// wire is 0=Sun..6=Sat (matches JS Date.getDay()).
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const
export type DayLabel = typeof DAYS[number]

// Index in DAYS → day_of_week the server uses.
export const DAY_TO_DOW: readonly number[] = [1, 2, 3, 4, 5, 6, 0]

// Half-hour slots from 7am to 10pm. Wide enough for almost every coaching
// practice; the dashboard editor still defaults to these to keep the dropdown
// scannable. If a host needs 6am or 11pm we'll add a "custom time" affordance
// rather than make every dropdown 48 items long.
export const TIME_OPTIONS: readonly string[] = (() => {
    const out: string[] = []
    for (let h = 7; h <= 22; h++) {
        for (const m of [0, 30]) {
            if (h === 22 && m === 30) continue
            out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`)
        }
    }
    return out
})()

export const DEFAULT_START = "09:00"
export const DEFAULT_END = "17:00"

// "09:00" → "9:00 AM". Display only — the wire stays 24h.
export function formatTime12h(hhmm: string): string {
    const [hStr, mStr] = hhmm.split(":")
    const h = Number(hStr)
    const m = Number(mStr)
    const period = h >= 12 ? "PM" : "AM"
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${h12}:${String(m).padStart(2, "0")} ${period}`
}

// One shift = one (start, end) window in a single day.
export interface Shift {
    start: string  // HH:MM
    end: string    // HH:MM
}

// What an availability editor sees per day. `enabled=false` means the day has
// no shifts; `shifts` is non-empty only when enabled.
export interface DayConfig {
    enabled: boolean
    shifts: Shift[]
}

export type DayMap = Record<DayLabel, DayConfig>

export const EMPTY_DAYS: DayMap = {
    Mon: { enabled: false, shifts: [] },
    Tue: { enabled: false, shifts: [] },
    Wed: { enabled: false, shifts: [] },
    Thu: { enabled: false, shifts: [] },
    Fri: { enabled: false, shifts: [] },
    Sat: { enabled: false, shifts: [] },
    Sun: { enabled: false, shifts: [] },
}

// Default weekly schedule for a brand-new editor: Mon-Fri 9am-5pm, weekends
// off. Same as onboarding Step 2 so the dashboard never feels like a step
// backwards.
export function defaultDays(): DayMap {
    const out = structuredClone(EMPTY_DAYS)
    for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri"] as DayLabel[]) {
        out[d] = { enabled: true, shifts: [{ start: DEFAULT_START, end: DEFAULT_END }] }
    }
    return out
}

// Convert server rules → editor state. Multiple rules on the same day become
// separate shifts, in start-time order so the picker is stable.
export function rulesToDays(rules: AvailabilityRule[]): DayMap {
    const out = structuredClone(EMPTY_DAYS)
    for (const rule of rules) {
        const idx = DAY_TO_DOW.indexOf(rule.dayOfWeek)
        if (idx < 0) continue
        const label = DAYS[idx]
        out[label].enabled = true
        out[label].shifts.push({ start: rule.startTime, end: rule.endTime })
    }
    for (const day of DAYS) {
        out[day].shifts.sort((a, b) => (a.start < b.start ? -1 : 1))
    }
    return out
}

// Editor state → server rules. Disabled days produce no rules; each shift on
// an enabled day produces one rule.
export function daysToRules(days: DayMap, timezone: string): AvailabilityRule[] {
    const out: AvailabilityRule[] = []
    DAYS.forEach((label, idx) => {
        const cfg = days[label]
        if (!cfg.enabled) return
        for (const shift of cfg.shifts) {
            out.push({
                dayOfWeek: DAY_TO_DOW[idx],
                startTime: shift.start,
                endTime: shift.end,
                timezone,
            })
        }
    })
    return out
}

// Pre-check shape so the editor can show "Mon: shift 2 end must be after
// start" without burning a round trip. The server also enforces this; we just
// catch the obvious mistake locally first.
export function validateDays(days: DayMap): string | null {
    for (const day of DAYS) {
        const cfg = days[day]
        if (!cfg.enabled) continue
        if (cfg.shifts.length === 0) {
            return `${day}: enable a window or turn the day off`
        }
        // Sort copy to detect overlap regardless of input order.
        const sorted = [...cfg.shifts].sort((a, b) => (a.start < b.start ? -1 : 1))
        for (let i = 0; i < sorted.length; i++) {
            const s = sorted[i]
            if (s.end <= s.start) {
                return `${day}: end time must be after start time`
            }
            if (i > 0 && sorted[i - 1].end > s.start) {
                return `${day}: shifts must not overlap`
            }
        }
    }
    return null
}
