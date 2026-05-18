"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Lock } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { FieldError, FormError } from "@/src/components/ui/FormError";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { useAuth } from "@/src/hooks/use-auth";
import { ApiError } from "@/src/services/api/fetch";
import { updateProfile } from "@/src/services/api/auth";
import { getAvailability, putAvailability, type AvailabilityRule } from "@/src/services/api/availability";
import { createEventType, listEventTypes } from "@/src/services/api/event-types";
import { useAuthStore } from "@/src/stores/auth";

const TOTAL_STEPS = 5;

const TIMEZONES = [
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Toronto",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Asia/Kolkata",
    "Asia/Tokyo",
    "Asia/Singapore",
    "Australia/Sydney",
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Index in DAYS → day_of_week the server uses (JS Date.getDay() — 0=Sun..6=Sat).
// Sunday lives at position 6 in the UI but is day_of_week 0 on the wire.
const DAY_TO_DOW = [1, 2, 3, 4, 5, 6, 0];

// "08:00", "08:30", ... "21:30" — half-hour slots from 7am to 10pm cover
// almost every coaching practice. The picker stays compact (32 options each)
// vs. exposing arbitrary times, which the dashboard will offer later.
const TIME_OPTIONS: string[] = (() => {
    const out: string[] = [];
    for (let h = 7; h <= 22; h++) {
        for (const m of [0, 30]) {
            if (h === 22 && m === 30) continue;
            out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
        }
    }
    return out;
})();

// "09:00" → "9:00 AM". Display only — the wire format stays 24h.
function formatTime12h(hhmm: string): string {
    const [hStr, mStr] = hhmm.split(":");
    const h = Number(hStr);
    const m = Number(mStr);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

const DEFAULT_START = "09:00";
const DEFAULT_END = "17:00";

const slugPattern = /^[a-z0-9-]{3,30}$/;

function slugify(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// ─── Progress dots ────────────────────────────────────────────────────────────

function StepDots({ current }: { current: number }) {
    return (
        <div className="flex items-center justify-center gap-2 mb-10">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <div
                    key={i}
                    className={`rounded-full transition-all duration-300 ${
                        i + 1 === current
                            ? "w-6 h-2 bg-[hsl(var(--primary))]"
                            : i + 1 < current
                            ? "w-2 h-2 bg-[hsl(var(--primary))]/40"
                            : "w-2 h-2 bg-[hsl(var(--border))]"
                    }`}
                />
            ))}
        </div>
    );
}

// ─── Step wrapper ─────────────────────────────────────────────────────────────

function StepShell({
    step,
    heading,
    sub,
    children,
    onBack,
    onContinue,
    continueLabel = "Continue",
    continueDisabled = false,
    loading = false,
    hideBack = false,
}: {
    step: number;
    heading: string;
    sub: string;
    children: React.ReactNode;
    onBack?: () => void;
    onContinue: () => void;
    continueLabel?: string;
    continueDisabled?: boolean;
    loading?: boolean;
    hideBack?: boolean;
}) {
    return (
        <div className="w-full max-w-md">
            <StepDots current={step} />
            <div className="mb-7">
                <h1 className="text-2xl font-bold text-[hsl(var(--foreground))] tracking-tight">{heading}</h1>
                <p className="mt-1.5 text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">{sub}</p>
            </div>
            <div className="app-panel rounded-2xl p-5 sm:p-6">
                {children}
            </div>
            <div className="mt-4 flex gap-3">
                {!hideBack && (
                    <Button variant="ghost" onClick={onBack} className="flex-1">
                        Back
                    </Button>
                )}
                <Button
                    onClick={onContinue}
                    disabled={continueDisabled || loading}
                    className={hideBack ? "w-full" : "flex-1"}
                >
                    {loading ? "Saving…" : continueLabel}
                </Button>
            </div>
        </div>
    );
}

// ─── Step 1: Profile ──────────────────────────────────────────────────────────

function Step1({
    user,
    onNext,
}: {
    user: { name: string; slug: string; timezone: string };
    onNext: (data: { name: string; slug: string; timezone: string }) => void;
}) {
    const [name, setName] = useState(user.name || "");
    const [slug, setSlug] = useState(user.slug || slugify(user.name || ""));
    const [tz, setTz] = useState(user.timezone || "America/New_York");
    const [slugTouched, setSlugTouched] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState("");
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    const { login: storeLogin } = useAuthStore();

    const slugValid = slugPattern.test(slug);
    const slugError = fieldErrors.slug || (slug && !slugValid ? "Use 3-30 lowercase letters, numbers, or hyphens." : "");

    const handleNameChange = (v: string) => {
        setName(v);
        setFieldErrors((prev) => ({ ...prev, name: "" }));
        if (!slugTouched) setSlug(slugify(v));
    };

    const handleSlugChange = (v: string) => {
        setSlugTouched(true);
        setFieldErrors((prev) => ({ ...prev, slug: "" }));
        setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, ""));
    };

    const handleContinue = async () => {
        if (!name.trim() || !slugValid) return;
        setSaving(true);
        setFormError("");
        setFieldErrors({});
        try {
            const updated = await updateProfile({ name: name.trim(), slug, timezone: tz, onboardingStep: 1 });
            storeLogin(updated);
            onNext({ name: updated.name, slug: updated.slug, timezone: updated.timezone });
        } catch (e: unknown) {
            if (e instanceof ApiError && e.field) {
                setFieldErrors({ [e.field]: e.message });
            } else {
                setFormError(e instanceof Error ? e.message : "Something went wrong");
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <StepShell
            step={1}
            heading="Set up your profile"
            sub="This is what your clients will see when they visit your booking page."
            onContinue={handleContinue}
            continueDisabled={!name.trim() || !slugValid}
            loading={saving}
            hideBack
        >
            <div className="flex flex-col gap-4">
                <div>
                    <label htmlFor="onboarding-name" className="label-caps block mb-1.5">Your name</label>
                    <Input
                        id="onboarding-name"
                        value={name}
                        onChange={e => handleNameChange(e.target.value)}
                        placeholder="Jane Smith"
                        autoComplete="name"
                        aria-invalid={!!fieldErrors.name}
                        aria-describedby={fieldErrors.name ? "onboarding-name-error" : undefined}
                        className={fieldErrors.name ? "border-[hsl(var(--destructive))] focus-visible:border-[hsl(var(--destructive))] focus-visible:ring-[hsl(var(--destructive))]/15" : undefined}
                    />
                    <FieldError id="onboarding-name-error">{fieldErrors.name}</FieldError>
                </div>
                <div>
                    <label htmlFor="onboarding-slug" className="label-caps block mb-1.5">Your booking URL</label>
                    <div className={`flex items-center rounded-lg border bg-[hsl(var(--background))] overflow-hidden focus-within:ring-2 ${
                        slugError
                            ? "border-[hsl(var(--destructive))] focus-within:ring-[hsl(var(--destructive))]/15"
                            : "border-[hsl(var(--border))] focus-within:ring-[hsl(var(--primary))]/30"
                    }`}>
                        <span className="pl-3 pr-1 text-sm text-[hsl(var(--muted-foreground))] whitespace-nowrap select-none">
                            getsessionly.com/u/
                        </span>
                        <input
                            id="onboarding-slug"
                            value={slug}
                            onChange={e => handleSlugChange(e.target.value)}
                            className="flex-1 py-2 pr-3 text-sm bg-transparent outline-none text-[hsl(var(--foreground))]"
                            placeholder="jane-smith"
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                            aria-invalid={!!slugError}
                            aria-describedby={slugError ? "onboarding-slug-error" : undefined}
                        />
                    </div>
                    <FieldError id="onboarding-slug-error">{slugError}</FieldError>
                    {slug && slugValid && !slugError && (
                        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                            getsessionly.com/u/{slug}
                        </p>
                    )}
                </div>
                <div>
                    <label htmlFor="onboarding-timezone" className="label-caps block mb-1.5">Your timezone</label>
                    <Select
                        id="onboarding-timezone"
                        value={tz}
                        onChange={e => setTz(e.target.value)}
                    >
                        {TIMEZONES.map(t => (
                            <option key={t} value={t}>{t.replace("_", " ")}</option>
                        ))}
                    </Select>
                </div>
                <FormError>{formError}</FormError>
            </div>
        </StepShell>
    );
}

// ─── Step 2: Set your hours ───────────────────────────────────────────────────

// One UI-side row per (enabled) weekday. The server stores availability as
// rules keyed by day; we collapse to one rule per day in onboarding to keep
// the form scannable. Power users can add split shifts from the dashboard
// later (Phase 2 follow-up).
interface DaySlot {
    enabled: boolean;
    start: string; // "HH:MM"
    end: string;   // "HH:MM"
}

type SlotsByDay = Record<string, DaySlot>;

const defaultSlots: SlotsByDay = {
    Mon: { enabled: true,  start: DEFAULT_START, end: DEFAULT_END },
    Tue: { enabled: true,  start: DEFAULT_START, end: DEFAULT_END },
    Wed: { enabled: true,  start: DEFAULT_START, end: DEFAULT_END },
    Thu: { enabled: true,  start: DEFAULT_START, end: DEFAULT_END },
    Fri: { enabled: true,  start: DEFAULT_START, end: DEFAULT_END },
    Sat: { enabled: false, start: DEFAULT_START, end: DEFAULT_END },
    Sun: { enabled: false, start: DEFAULT_START, end: DEFAULT_END },
};

// Build the slots shape from server rules so the form reflects whatever the
// user saved on a prior visit. If multiple rules cover the same day we take
// the earliest start + latest end so the user still sees their full range;
// split shifts will be revealed by the dashboard editor, not silently dropped.
function slotsFromRules(rules: AvailabilityRule[]): SlotsByDay {
    const next: SlotsByDay = { ...defaultSlots };
    // Mark every day disabled before applying rules; otherwise saved Mon/Tue
    // would coexist with defaults' Wed/Thu/Fri.
    for (const k of DAYS) next[k] = { ...next[k], enabled: false };
    for (const rule of rules) {
        // Server day_of_week 0..6 (Sun..Sat) — find the UI label.
        const idx = DAY_TO_DOW.indexOf(rule.dayOfWeek);
        if (idx < 0) continue;
        const label = DAYS[idx];
        const existing = next[label];
        if (!existing.enabled) {
            next[label] = { enabled: true, start: rule.startTime, end: rule.endTime };
        } else {
            next[label] = {
                enabled: true,
                start: rule.startTime < existing.start ? rule.startTime : existing.start,
                end:   rule.endTime   > existing.end   ? rule.endTime   : existing.end,
            };
        }
    }
    return next;
}

// Inverse of slotsFromRules: only enabled days produce rules. Times are
// already in HH:MM, so this is a straight projection.
function rulesFromSlots(slots: SlotsByDay, timezone: string): AvailabilityRule[] {
    const out: AvailabilityRule[] = [];
    DAYS.forEach((label, idx) => {
        const slot = slots[label];
        if (!slot?.enabled) return;
        out.push({
            dayOfWeek: DAY_TO_DOW[idx],
            startTime: slot.start,
            endTime: slot.end,
            timezone,
        });
    });
    return out;
}

function Step2({
    timezone,
    onBack,
    onNext,
}: {
    timezone: string;
    onBack: () => void;
    onNext: () => void;
}) {
    const [slots, setSlots] = useState<SlotsByDay>(defaultSlots);
    // Distinguish "still fetching" from "fetched, but empty" so we don't flash
    // the default Mon-Fri set over a user who deliberately cleared it.
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const rules = await getAvailability();
                if (cancelled) return;
                if (rules.length > 0) setSlots(slotsFromRules(rules));
            } catch (e) {
                // Non-fatal: the user can still enter availability for the first
                // time. Surface the message so they know the load failed but
                // don't block them from continuing.
                if (!cancelled) setError(e instanceof Error ? e.message : "Could not load saved hours");
            } finally {
                if (!cancelled) setLoaded(true);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Disable Continue when no day is enabled — saving zero rules is valid on
    // the server but defeats the whole point of the step. The dashboard can
    // clear later.
    const hasEnabledDay = useMemo(
        () => DAYS.some(d => slots[d]?.enabled),
        [slots],
    );

    // Pre-check that every enabled day has end > start so we don't burn a
    // round-trip on something the user can fix in-place.
    const localValidationError = useMemo<string | null>(() => {
        for (const d of DAYS) {
            const s = slots[d];
            if (!s?.enabled) continue;
            if (s.end <= s.start) return `${d}: end time must be after start time`;
        }
        return null;
    }, [slots]);

    const update = (day: string, patch: Partial<DaySlot>) => {
        setSlots(prev => ({ ...prev, [day]: { ...prev[day], ...patch } }));
        if (error) setError("");
    };

    const handleContinue = async () => {
        if (localValidationError) { setError(localValidationError); return; }
        setSaving(true);
        setError("");
        try {
            await putAvailability(rulesFromSlots(slots, timezone));
            onNext();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save your hours");
        } finally {
            setSaving(false);
        }
    };

    return (
        <StepShell
            step={2}
            heading="When are you available?"
            sub="Choose the days and hours clients can book with you."
            onBack={onBack}
            onContinue={handleContinue}
            continueDisabled={!hasEnabledDay || !!localValidationError || !loaded}
            loading={saving}
        >
            <div className="flex flex-col gap-2">
                {DAYS.map(day => {
                    const slot = slots[day];
                    return (
                    <div key={day} className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => update(day, { enabled: !slot.enabled })}
                            aria-label={`${slot.enabled ? "Disable" : "Enable"} ${day} availability`}
                            aria-pressed={slot.enabled}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent
                                       transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/50
                                       ${slot.enabled ? "bg-[hsl(var(--primary))]" : "bg-[hsl(var(--border))]"}`}
                        >
                            <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow
                                            transform transition-transform
                                            ${slot.enabled ? "translate-x-4" : "translate-x-0"}`} />
                        </button>
                        <span className={`w-8 text-sm font-medium ${slot.enabled ? "text-[hsl(var(--foreground))]" : "text-[hsl(var(--muted-foreground))]"}`}>
                            {day}
                        </span>
                        {slot.enabled && (
                            <div className="flex items-center gap-1.5 ml-auto">
                                <Select
                                    aria-label={`${day} start time`}
                                    value={slot.start}
                                    onChange={e => update(day, { start: e.target.value })}
                                    selectSize="sm"
                                    wrapperClassName="w-[6.75rem]">
                                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{formatTime12h(t)}</option>)}
                                </Select>
                                <span className="text-xs text-[hsl(var(--muted-foreground))]">to</span>
                                <Select
                                    aria-label={`${day} end time`}
                                    value={slot.end}
                                    onChange={e => update(day, { end: e.target.value })}
                                    selectSize="sm"
                                    wrapperClassName="w-[6.75rem]">
                                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{formatTime12h(t)}</option>)}
                                </Select>
                            </div>
                        )}
                    </div>
                    );
                })}
            </div>
            {error && (
                <p className="mt-3 text-xs text-red-500">{error}</p>
            )}
            <p className="mt-4 text-xs text-[hsl(var(--muted-foreground))]">
                You can fine-tune this anytime from your dashboard. Times are in {timezone.replace("_", " ")}.
            </p>
        </StepShell>
    );
}

// ─── Step 3: First event type ─────────────────────────────────────────────────

// Slugify the title for the public booking URL. Server enforces the same
// pattern; rolling our own here lets the UI preview the URL before submitting.
function slugifyTitle(s: string): string {
    return s
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-{2,}/g, "-")
        .slice(0, 40);
}

function Step3({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
    const [duration, setDuration] = useState(30);
    const [title, setTitle] = useState("30-minute call");
    // Whether the user is auto-naming the event (title tracks duration) or
    // has explicitly typed a custom title (don't clobber it).
    const [titleTouched, setTitleTouched] = useState(false);
    const [saving, setSaving] = useState(false);
    const [skipCreate, setSkipCreate] = useState(false);
    const [error, setError] = useState("");

    const durations = [15, 30, 45, 60];

    // Skip create on re-onboarding: if the user already has at least one
    // active event type, don't try to create a duplicate. The free-plan cap
    // would 403 us anyway, but checking upfront avoids the user thinking the
    // step failed.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const events = await listEventTypes();
                if (cancelled) return;
                if (events.some(e => e.isActive)) setSkipCreate(true);
            } catch {
                // Non-fatal — proceed as if no events exist; the POST will
                // surface a 403 if one does.
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const handleDuration = (d: number) => {
        setDuration(d);
        if (!titleTouched) setTitle(`${d}-minute call`);
    };

    const handleTitleChange = (v: string) => {
        setTitle(v);
        setTitleTouched(true);
    };

    const handleContinue = async () => {
        const trimmed = title.trim();
        if (!trimmed) { setError("Give your event a name."); return; }
        if (skipCreate) { onNext(); return; }
        setSaving(true);
        setError("");
        try {
            const slug = slugifyTitle(trimmed) || `call-${duration}`;
            await createEventType({
                slug,
                title: trimmed,
                durationMin: duration,
                bufferMin: 0,
                bufferBeforeMin: 0,
                minNoticeHours: 0,
                maxDaysAhead: 0,
                isPaid: false,
                isActive: true,
            });
            onNext();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save your event type");
        } finally {
            setSaving(false);
        }
    };

    return (
        <StepShell
            step={3}
            heading="Create your first booking type"
            sub="Clients will use this to schedule time with you."
            onBack={onBack}
            onContinue={handleContinue}
            continueDisabled={!title.trim()}
            loading={saving}
        >
            <div className="flex flex-col gap-5">
                {skipCreate && (
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        You already have a booking type set up. Continue to the next step.
                    </p>
                )}
                <div>
                    <label className="label-caps block mb-2">Session length</label>
                    <div className="grid grid-cols-4 gap-2" role="group" aria-label="Session length">
                        {durations.map(d => (
                            <button
                                key={d}
                                type="button"
                                onClick={() => handleDuration(d)}
                                aria-pressed={duration === d}
                                disabled={skipCreate}
                                className={`cursor-pointer rounded-lg border py-2 text-sm font-medium transition-colors
                                           ${duration === d
                                    ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"
                                    : "border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary))]/50"
                                } ${skipCreate ? "opacity-60 cursor-not-allowed" : ""}`}
                            >
                                {d}m
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label htmlFor="event-title" className="label-caps block mb-1.5">Title</label>
                    <Input
                        id="event-title"
                        value={title}
                        onChange={e => handleTitleChange(e.target.value)}
                        placeholder="e.g. Discovery call"
                        disabled={skipCreate}
                    />
                    {title.trim() && !skipCreate && (
                        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                            Public URL: /u/{"{your-slug}"}/{slugifyTitle(title) || `call-${duration}`}
                        </p>
                    )}
                </div>
                <div>
                    <label className="label-caps block mb-2">Pricing</label>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            aria-pressed={true}
                            className="flex-1 cursor-pointer rounded-lg border border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10
                                       py-2 text-sm font-medium text-[hsl(var(--primary))]"
                        >
                            Free
                        </button>
                        <button
                            type="button"
                            disabled
                            aria-label="Paid sessions are available on the Solo plan"
                            className="flex-1 rounded-lg border border-[hsl(var(--border))] py-2 text-sm font-medium
                                       text-[hsl(var(--muted-foreground))] flex items-center justify-center gap-1.5 cursor-not-allowed"
                        >
                            <Lock className="size-3" /> Paid
                            <span className="rounded-full bg-[hsl(var(--primary))]/10 px-1.5 py-0.5 text-[9px]
                                           font-bold uppercase tracking-wider text-[hsl(var(--primary))]">Solo</span>
                        </button>
                    </div>
                    <p className="mt-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                        Paid sessions are available on the Solo plan.
                    </p>
                </div>
                {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
        </StepShell>
    );
}

// ─── Step 4: Calendar ─────────────────────────────────────────────────────────

function Step4({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
    return (
        <StepShell
            step={4}
            heading="Connect your calendar"
            sub="We'll check your real availability so clients can only book open slots."
            onBack={onBack}
            onContinue={onNext}
            continueLabel="Skip for now"
        >
            <div className="flex flex-col gap-3">
                <button
                    type="button"
                    disabled
                    aria-label="Google Calendar sync is coming soon"
                    className="flex items-center gap-3 rounded-xl border border-[hsl(var(--border))] p-4
                               text-left opacity-60 cursor-not-allowed"
                >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white border border-[hsl(var(--border))]">
                        <svg viewBox="0 0 24 24" className="h-5 w-5">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-medium text-[hsl(var(--foreground))]">Google Calendar</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">Sync availability automatically</p>
                    </div>
                    <span className="rounded-full bg-[hsl(var(--border))] px-2.5 py-0.5 text-[10px] font-semibold
                                   uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                        Coming soon
                    </span>
                </button>
                <p className="text-xs text-center text-[hsl(var(--muted-foreground))]">
                    Calendar sync is launching soon. You can connect it from your settings later.
                </p>
            </div>
        </StepShell>
    );
}

// ─── Step 5: All set ──────────────────────────────────────────────────────────

function Step5({ slug, onFinish }: { slug: string; onFinish: () => void }) {
    const [copied, setCopied] = useState(false);
    const bookingUrl = `getsessionly.com/u/${slug}`;

    const handleCopy = () => {
        navigator.clipboard.writeText(`https://${bookingUrl}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="w-full max-w-md text-center">
            <StepDots current={5} />
            <div className="mb-6">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full
                               bg-[hsl(var(--primary))]/10">
                    <Check className="size-7 text-[hsl(var(--primary))]" />
                </div>
                <h1 className="text-2xl font-bold text-[hsl(var(--foreground))] tracking-tight">Your profile is ready</h1>
                <p className="mt-1.5 text-sm text-[hsl(var(--muted-foreground))]">
                    Your Sessionly URL is reserved. Finish the scheduling setup next so clients can book real slots.
                </p>
            </div>
            <div className="app-panel rounded-2xl p-5 mb-4">
                <p className="label-caps mb-3 text-[hsl(var(--muted-foreground))]">Reserved URL</p>
                <div className="flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3">
                    <span className="flex-1 text-sm font-medium text-[hsl(var(--foreground))] text-left truncate">
                        {bookingUrl}
                    </span>
                    <button
                        type="button"
                        onClick={handleCopy}
                        aria-label="Copy reserved Sessionly URL"
                        className="shrink-0 cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium
                                   bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/20 transition-colors
                                   flex items-center gap-1.5"
                    >
                        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                        {copied ? "Copied" : "Copy"}
                    </button>
                </div>
                <a
                    href={`https://${bookingUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex items-center justify-center gap-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                >
                    Preview later <ExternalLink className="size-3" />
                </a>
            </div>
            <Button size="lg" className="w-full" onClick={onFinish}>
                Go to dashboard
            </Button>
        </div>
    );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function OnboardingPage() {
    const { user, isAuthenticated, isLoading } = useAuth();
    const router = useRouter();
    const { login: storeLogin } = useAuthStore();
    const [step, setStep] = useState(1);
    const [profileData, setProfileData] = useState<{ name: string; slug: string; timezone: string } | null>(null);

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.replace("/login");
        }
    }, [isAuthenticated, isLoading, router]);

    if (isLoading || !isAuthenticated || !user) return null;

    const slug = profileData?.slug ?? user.slug;

    const handleFinish = async () => {
        try {
            const updated = await updateProfile({
                name: profileData?.name ?? user.name,
                slug,
                timezone: profileData?.timezone ?? user.timezone,
                onboardingStep: 5,
            });
            storeLogin(updated);
        } catch { /* non-critical */ }
        router.push("/dashboard");
    };

    return (
        <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-16">
            <div className="w-full max-w-md">
                {step === 1 && (
                    <Step1
                        user={{ name: user.name, slug: user.slug, timezone: user.timezone }}
                        onNext={data => { setProfileData(data); setStep(2); }}
                    />
                )}
                {step === 2 && (
                    <Step2
                        timezone={profileData?.timezone ?? user.timezone}
                        onBack={() => setStep(1)}
                        onNext={() => setStep(3)}
                    />
                )}
                {step === 3 && (
                    <Step3 onBack={() => setStep(2)} onNext={() => setStep(4)} />
                )}
                {step === 4 && (
                    <Step4 onBack={() => setStep(3)} onNext={() => setStep(5)} />
                )}
                {step === 5 && (
                    <Step5 slug={slug} onFinish={handleFinish} />
                )}
            </div>
        </div>
    );
}
