import { describe, it, expect } from 'vitest'

import {
    DAYS,
    DAY_TO_DOW,
    DEFAULT_START,
    DEFAULT_END,
    TIME_OPTIONS,
    EMPTY_DAYS,
    defaultDays,
    rulesToDays,
    daysToRules,
    validateDays,
    formatTime12h,
    type DayMap,
} from '../availability'
import type { AvailabilityRule } from '@/src/services/api/availability'

// The availability module is pure functions sitting under the host
// onboarding + dashboard editor. Bugs here translate directly to: the host
// saves rules that don't match what they see, or the dashboard shows shifts
// that won't match the host's intent. Each test pins one observable property
// that future changes would silently break.

// ─── formatTime12h ──────────────────────────────────────────────────────────
// Display-only conversion 24h → 12h. The edge cases are midnight (00 → 12 AM)
// and noon (12 → 12 PM); a naive `h % 12` fails both.
it.each([
    ['00:00', '12:00 AM', 'midnight'],
    ['00:30', '12:30 AM', 'just past midnight'],
    ['09:00', '9:00 AM', 'morning'],
    ['11:59', '11:59 AM', 'last minute before noon'],
    ['12:00', '12:00 PM', 'noon (h%12 boundary)'],
    ['12:30', '12:30 PM', 'past noon'],
    ['13:00', '1:00 PM', 'first afternoon hour'],
    ['23:30', '11:30 PM', 'late evening'],
])('formatTime12h(%s) = %s (%s)', (input, expected) => {
    expect(formatTime12h(input)).toBe(expected)
})

// ─── DAY_TO_DOW round-trip ───────────────────────────────────────────────────
// The picker reads Mon→Sun, the server stores 0=Sun..6=Sat. Any drift here
// means hosts save Tuesday and the server reads it as Wednesday — a silent,
// catastrophic regression. Pin the mapping explicitly.
it('DAY_TO_DOW maps each DAYS label to the correct server dayOfWeek', () => {
    // Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6, Sun=0 — matches JS Date.getDay()
    const expected: Record<string, number> = {
        Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0,
    }
    for (let i = 0; i < DAYS.length; i++) {
        expect(DAY_TO_DOW[i]).toBe(expected[DAYS[i]])
    }
})

// ─── TIME_OPTIONS coverage ───────────────────────────────────────────────────
// The dropdown spans 7am to 9:30pm (last slot before 10pm). If the bounds
// drift, hosts either lose useful slots ("can't pick 9:30pm anymore") or get
// nonsensical late-night options.
it('TIME_OPTIONS covers 07:00 through 22:00 in 30-minute steps, excluding 22:30', () => {
    expect(TIME_OPTIONS[0]).toBe('07:00')
    expect(TIME_OPTIONS[TIME_OPTIONS.length - 1]).toBe('22:00')
    expect(TIME_OPTIONS).not.toContain('22:30')
    expect(TIME_OPTIONS).not.toContain('06:30')
    // Half-hourly cadence: (22-7)*2 + 1 = 31 entries
    expect(TIME_OPTIONS).toHaveLength(31)
})

// ─── defaultDays ─────────────────────────────────────────────────────────────
// Onboarding new hosts and resetting the dashboard editor both call this.
// The default has to match what hosts actually do — Mon-Fri 9-5 — so the
// most common case requires zero clicks.
it('defaultDays enables Mon-Fri with 09:00-17:00 and weekends off', () => {
    const days = defaultDays()
    for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const) {
        expect(days[d].enabled).toBe(true)
        expect(days[d].shifts).toEqual([{ start: DEFAULT_START, end: DEFAULT_END }])
    }
    expect(days.Sat.enabled).toBe(false)
    expect(days.Sun.enabled).toBe(false)
    expect(days.Sat.shifts).toEqual([])
})

// defaultDays returns a fresh object — mutating its result must not leak into
// EMPTY_DAYS or the next call. (structuredClone is the mechanism; this test
// catches a regression to a shared reference.)
it('defaultDays returns an isolated object on each call', () => {
    const a = defaultDays()
    const b = defaultDays()
    a.Mon.shifts[0].start = '08:00'
    expect(b.Mon.shifts[0].start).toBe(DEFAULT_START)
    expect(EMPTY_DAYS.Mon.shifts).toEqual([])
})

// ─── rulesToDays + daysToRules round-trip ───────────────────────────────────
// The two functions are inverses: server rules → editor state → server rules
// must reproduce the input (up to per-day shift ordering). Without this,
// loading the editor and saving without changes mutates the host's data.
it('rulesToDays and daysToRules round-trip preserving content', () => {
    const tz = 'America/New_York'
    const rules: AvailabilityRule[] = [
        { dayOfWeek: 1, startTime: '09:00', endTime: '12:00', timezone: tz },
        { dayOfWeek: 1, startTime: '13:00', endTime: '17:00', timezone: tz },
        { dayOfWeek: 3, startTime: '10:00', endTime: '14:00', timezone: tz },
    ]
    const back = daysToRules(rulesToDays(rules), tz)
    expect(back).toHaveLength(rules.length)
    // Same set of (dow, start, end, tz) tuples — order is not guaranteed.
    const norm = (r: AvailabilityRule) => `${r.dayOfWeek}-${r.startTime}-${r.endTime}-${r.timezone}`
    expect(back.map(norm).sort()).toEqual(rules.map(norm).sort())
})

// rulesToDays must SORT shifts by start time per day, regardless of input
// order. Without this, the picker shows shifts in arbitrary order and the
// "shift 1 / shift 2" labels mean different things on every save.
it('rulesToDays sorts shifts by start time even when server returns them reversed', () => {
    const rules: AvailabilityRule[] = [
        // Reversed order — afternoon shift listed first.
        { dayOfWeek: 1, startTime: '13:00', endTime: '17:00', timezone: 'UTC' },
        { dayOfWeek: 1, startTime: '09:00', endTime: '12:00', timezone: 'UTC' },
    ]
    const days = rulesToDays(rules)
    expect(days.Mon.shifts.map((s) => s.start)).toEqual(['09:00', '13:00'])
})

// daysToRules must SKIP disabled days. A regression where it emits rules for
// `enabled: false, shifts: []` would result in PUT /me/availability deleting
// nothing (current behaviour) or — worse — producing malformed rules.
it('daysToRules emits no rules for disabled days', () => {
    const days: DayMap = {
        ...EMPTY_DAYS,
        Mon: { enabled: false, shifts: [{ start: '09:00', end: '17:00' }] }, // disabled despite leftover shifts
        Tue: { enabled: true, shifts: [{ start: '10:00', end: '14:00' }] },
    }
    const rules = daysToRules(days, 'UTC')
    expect(rules).toHaveLength(1)
    expect(rules[0].dayOfWeek).toBe(2) // Tue
})

// ─── validateDays ────────────────────────────────────────────────────────────
// Pre-flight validation that mirrors the server's checks. Each error case
// names the day to help the host fix it. We don't pin the exact wording (UI
// copy may change) but we DO pin: (1) every failure mode trips an error;
// (2) valid configurations produce null.

it('validateDays returns null for a sensible config', () => {
    expect(validateDays(defaultDays())).toBeNull()
})

it('validateDays catches enabled-but-empty days', () => {
    const days: DayMap = {
        ...EMPTY_DAYS,
        Mon: { enabled: true, shifts: [] },
    }
    expect(validateDays(days)).toMatch(/Mon/)
})

it('validateDays catches end <= start', () => {
    const days: DayMap = {
        ...EMPTY_DAYS,
        Wed: { enabled: true, shifts: [{ start: '14:00', end: '10:00' }] },
    }
    expect(validateDays(days)).toMatch(/Wed/)
})

it('validateDays catches end == start (zero-length window)', () => {
    const days: DayMap = {
        ...EMPTY_DAYS,
        Thu: { enabled: true, shifts: [{ start: '10:00', end: '10:00' }] },
    }
    // end <= start is the documented rule; equal counts as zero-length.
    expect(validateDays(days)).toMatch(/Thu/)
})

it('validateDays catches overlapping shifts regardless of input order', () => {
    // The function sorts internally — pass the shifts in REVERSE start order
    // to ensure overlap is detected post-sort, not just for already-sorted input.
    const days: DayMap = {
        ...EMPTY_DAYS,
        Fri: {
            enabled: true,
            shifts: [
                { start: '13:00', end: '17:00' },
                { start: '12:00', end: '14:00' }, // overlaps the first
            ],
        },
    }
    expect(validateDays(days)).toMatch(/Fri/)
})

it('validateDays allows back-to-back (non-overlapping) shifts', () => {
    // The split-shift pattern: morning + afternoon with no gap. Must NOT be
    // flagged as overlap — `prev.end > curr.start` (strict greater) is the
    // rule, not `>=`. Off-by-one here would block a common config.
    const days: DayMap = {
        ...EMPTY_DAYS,
        Mon: {
            enabled: true,
            shifts: [
                { start: '09:00', end: '12:00' },
                { start: '12:00', end: '17:00' },
            ],
        },
    }
    expect(validateDays(days)).toBeNull()
})
