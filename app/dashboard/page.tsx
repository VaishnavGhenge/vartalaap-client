"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
    AlertTriangle,
    CalendarCheck,
    CalendarDays,
    Check,
    CheckCircle2,
    Copy,
    CreditCard,
    Link2,
    LogOut,
    LaptopMinimal,
    Mic,
    MoonStar,
    Settings,
    SunMedium,
    Pencil,
    Video,
} from "lucide-react";

import { AvailabilityEditor } from "@/src/components/dashboard/AvailabilityEditor";
import { BookingsPanel } from "@/src/components/dashboard/BookingsPanel";
import { EventTypesPanel } from "@/src/components/dashboard/EventTypesPanel";
import { SetupChecklist, type SetupState } from "@/src/components/dashboard/SetupChecklist";
import { UpcomingBookings } from "@/src/components/dashboard/UpcomingBookings";
import { BufferingButtonLabel } from "@/src/components/ui/BufferingButtonLabel";
import { Button } from "@/src/components/ui/button";
import { InlineNotice } from "@/src/components/ui/InlineNotice";
import { Input } from "@/src/components/ui/input";
import { NewMeetingButton } from "@/src/components/ui/NewMeetButton";
import { SessionlyBrand } from "@/src/components/ui/SessionlyBrand";
import { Switch } from "@/src/components/ui/Switch";
import { ThemeMode, useTheme } from "@/src/components/theme-provider";
import { callDefaults } from "@/src/lib/call-defaults";
import { useAuth } from "@/src/hooks/use-auth";
import { roomPath } from "@/src/lib/room-routes";
import { initialsOf } from "@/src/lib/avatar";
import { cn } from "@/src/lib/utils";
import { getAvailability } from "@/src/services/api/availability";
import { listEventTypes } from "@/src/services/api/event-types";
import { listMyBookings, type HostBooking } from "@/src/services/api/bookings";
import { updateProfile } from "@/src/services/api/auth";
import { SearchableSelect } from "@/src/components/ui/SearchableSelect";
import { TIMEZONES } from "@/src/lib/timezones";

type PanelKey = "overview" | "profile" | "availability" | "booking-types" | "bookings" | "payments" | "settings";
type SidebarPanelKey = Exclude<PanelKey, "profile">;

const SIDEBAR_ITEMS: ReadonlyArray<{
    key: SidebarPanelKey;
    icon: typeof CheckCircle2;
    label: string;
    // shortLabel is shown only on the mobile bottom-bar where each cell is
    // ~64px wide; the desktop sidebar always uses `label`. Multi-word labels
    // would ellipsize at the mobile size — shorter is clearer than truncated.
    shortLabel?: string;
}> = [
    { key: "overview", icon: CheckCircle2, label: "Overview", shortLabel: "Home" },
    { key: "bookings", icon: CalendarDays, label: "Bookings", shortLabel: "Bookings" },
    { key: "availability", icon: CalendarCheck, label: "Availability", shortLabel: "Hours" },
    { key: "booking-types", icon: Link2, label: "Event types", shortLabel: "Events" },
    { key: "payments", icon: CreditCard, label: "Payments", shortLabel: "Pay" },
    { key: "settings", icon: Settings, label: "Settings" },
];

const PANEL_COPY: Record<PanelKey, { eyebrow: string; title: string; body: string }> = {
    overview: {
        eyebrow: "Overview",
        title: "Your scheduling hub",
        body: "Share your booking link, watch upcoming sessions, and pick up where you left off in setup.",
    },
    bookings: {
        eyebrow: "Bookings",
        title: "All bookings",
        body: "Browse upcoming, active, past, and cancelled bookings in one place.",
    },
    profile: {
        eyebrow: "Profile",
        title: "Your public profile",
        body: "Control the name, booking link, timezone, and photo guests see before they meet you.",
    },
    availability: {
        eyebrow: "Availability",
        title: "Weekly availability",
        body: "Set the recurring weekly windows guests can book. Existing bookings are shown under Bookings.",
    },
    "booking-types": {
        eyebrow: "Event types",
        title: "Manage what guests can book",
        body: "Each event type is its own bookable link with a duration, optional description, and buffer.",
    },
    payments: {
        eyebrow: "Payments",
        title: "Paid sessions are coming",
        body: "Stripe Connect arrives in the next phase. Until then, everything stays free.",
    },
    settings: {
        eyebrow: "Settings",
        title: "Workspace settings",
        body: "Theme and workspace preferences live here, separate from your public profile.",
    },
};

const THEME_OPTIONS: ReadonlyArray<{
    label: string;
    value: ThemeMode;
    icon: typeof SunMedium;
    body: string;
}> = [
    { label: "Light", value: "light", icon: SunMedium, body: "Bright interface for daytime work." },
    { label: "Dark", value: "dark", icon: MoonStar, body: "Lower brightness for long sessions." },
    { label: "System", value: "system", icon: LaptopMinimal, body: "Follow this device automatically." },
];

const VALID_PANELS = new Set<PanelKey>([
    "overview", "profile", "availability", "booking-types", "bookings", "payments", "settings",
]);

export default function DashboardPage() {
    // useSearchParams needs a Suspense ancestor in Next 15+; the body of the
    // dashboard is fine inside Suspense because its first render is interactive
    // anyway.
    return (
        <Suspense fallback={<div className="min-h-dvh" />}>
            <DashboardInner />
        </Suspense>
    );
}

function DashboardInner() {
    const router = useRouter();
    const params = useSearchParams();
    const { user, isAuthenticated, isLoading, logout } = useAuth();

    const initialPanel = (params.get("panel") as PanelKey | null);
    const [activePanel, setActivePanel] = useState<PanelKey>(
        initialPanel && VALID_PANELS.has(initialPanel) ? initialPanel : "overview",
    );
    // Setup state derived from the actual server data. Mirrors the
    // SetupChecklist contract: profile is "complete" once the user has a slug
    // (always true post-onboarding step 1); availability is complete with at
    // least one rule; eventType is complete with at least one active type.
    const [setup, setSetup] = useState<SetupState>({
        profile: false, availability: false, eventType: false,
    });
    const [setupLoaded, setSetupLoaded] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    const refreshSetup = useCallback(async () => {
        try {
            const [rules, events] = await Promise.all([
                getAvailability().catch(() => []),
                listEventTypes().catch(() => []),
            ]);
            setSetup({
                profile: !!(user?.slug && user.slug.length > 0),
                availability: rules.length > 0,
                eventType: events.some((e) => e.isActive),
            });
        } finally {
            setSetupLoaded(true);
        }
    }, [user?.slug]);

    useEffect(() => {
        if (!isAuthenticated) return;
        void refreshSetup();
    }, [isAuthenticated, refreshSetup, refreshKey]);

    useEffect(() => {
        if (!isLoading && !isAuthenticated) router.replace("/login");
    }, [isAuthenticated, isLoading, router]);

    if (isLoading) return <div className="min-h-dvh" />;
    if (!isAuthenticated || !user) return null;

    const bookingHost = process.env.NEXT_PUBLIC_BOOKING_HOST ?? "getsessionly.com";
    const bookingPath = user.slug ? `${bookingHost}/u/${user.slug}` : `${bookingHost}/u/your-slug`;
    const publicHref = user.slug ? `/u/${user.slug}` : null;
    const panelCopy = PANEL_COPY[activePanel];

    const handleSelectPanel = (key: PanelKey) => {
        setActivePanel(key);
        // Reflect the panel in the URL so reload + share work.
        router.replace(`/dashboard?panel=${key}`, { scroll: false });
    };

    return (
        <div className="min-h-dvh bg-[hsl(var(--background))] lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
            {/*
              Mobile and desktop run completely different nav patterns. On lg+
              the left sidebar lives in the grid column. Below lg the sidebar
              is hidden; nav moves to a fixed bottom tab bar (the native-app
              pattern) and a slim top bar carries brand + account actions. The
              two surfaces don't share markup because the active-state, layout,
              and tap-target sizes diverge enough that one shared component
              would have to fork on every prop.
            */}
            <aside className="hidden border-[hsl(var(--border))]/60 bg-[hsl(var(--background))] lg:sticky lg:top-0 lg:block lg:h-dvh lg:border-r">
                <div className="flex h-full flex-col px-3 py-4">
                    <Link href="/dashboard" className="mb-1 flex items-center rounded-xl px-3 py-2 hover:bg-[hsl(var(--surface-2))]">
                        <span className="min-w-0">
                            <SessionlyBrand size="sm" />
                            <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">Workspace</span>
                        </span>
                    </Link>

                    <div className="mb-3 mt-2 border-t border-[hsl(var(--border))]/50 pt-3">
                        <button
                            type="button"
                            onClick={() => handleSelectPanel("profile")}
                            aria-current={activePanel === "profile" ? "page" : undefined}
                            className={cn(
                                "group flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/50",
                                activePanel === "profile"
                                    ? "bg-[hsl(var(--primary))]/10"
                                    : "hover:bg-[hsl(var(--surface-2))]",
                            )}
                        >
                            {user.avatarUrl ? (
                                <img
                                    src={user.avatarUrl}
                                    alt={user.name || user.email}
                                    className={cn(
                                        "size-9 shrink-0 rounded-full object-cover ring-2 ring-offset-1",
                                        activePanel === "profile"
                                            ? "ring-[hsl(var(--primary))]"
                                            : "ring-transparent group-hover:ring-[hsl(var(--border))]",
                                    )}
                                />
                            ) : (
                                <div className={cn(
                                    "flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(var(--primary))] to-violet-500 text-[11px] font-semibold text-white ring-2 ring-offset-1",
                                    activePanel === "profile"
                                        ? "ring-[hsl(var(--primary))]"
                                        : "ring-transparent group-hover:ring-[hsl(var(--border))]",
                                )}>
                                    {initialsOf(user.name || user.email)}
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <p className={cn(
                                    "truncate text-sm font-semibold",
                                    activePanel === "profile"
                                        ? "text-[hsl(var(--primary))]"
                                        : "text-[hsl(var(--foreground))]",
                                )}>
                                    {user.name || user.email}
                                </p>
                                <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">
                                    {user.slug ? `@${user.slug}` : "Set your link"}
                                </p>
                            </div>
                            <Pencil className={cn(
                                "size-3.5 shrink-0 text-[hsl(var(--muted-foreground))] transition-opacity",
                                activePanel === "profile"
                                    ? "opacity-50"
                                    : "opacity-0 group-hover:opacity-40",
                            )} />
                        </button>
                    </div>

                    <nav className="flex flex-col gap-0.5" aria-label="Dashboard sections">
                        {SIDEBAR_ITEMS.map(({ key, icon: Icon, label }) => {
                            const active = activePanel === key;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => handleSelectPanel(key)}
                                    aria-current={active ? "page" : undefined}
                                    className={cn(
                                        "flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/50",
                                        active
                                            ? "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"
                                            : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]",
                                    )}
                                >
                                    <Icon className="size-4 shrink-0" />
                                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
                                </button>
                            );
                        })}
                    </nav>

                    <div className="mt-auto border-t border-[hsl(var(--border))]/50 px-1 pt-3">
                        <Button variant="outline" size="sm" className="w-full" asChild>
                            <Link href="/pricing">View plans</Link>
                        </Button>
                        <button
                            type="button"
                            onClick={logout}
                            className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/50"
                        >
                            <LogOut className="size-3.5" />
                            Sign out
                        </button>
                    </div>
                </div>
            </aside>

            {/* Mobile top bar — minimal, just brand + account actions. */}
            <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[hsl(var(--border))]/60 bg-[hsl(var(--background))]/95 px-4 py-3 backdrop-blur lg:hidden">
                <Link href="/dashboard" className="flex min-w-0 items-center">
                    <SessionlyBrand size="sm" />
                </Link>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => handleSelectPanel("profile")}
                        aria-label="View profile"
                        aria-current={activePanel === "profile" ? "page" : undefined}
                        className={cn(
                            "press flex shrink-0 cursor-pointer items-center justify-center rounded-lg p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/50",
                            activePanel === "profile" && "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]",
                        )}
                    >
                        {user.avatarUrl ? (
                            <img
                                src={user.avatarUrl}
                                alt={user.name || user.email}
                                className="size-7 rounded-full object-cover"
                            />
                        ) : (
                            <span className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(var(--primary))] to-violet-500 text-[11px] font-semibold text-white">
                                {initialsOf(user.name || user.email)}
                            </span>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={logout}
                        aria-label="Sign out"
                        className="press flex shrink-0 cursor-pointer items-center justify-center rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/50"
                    >
                        <LogOut className="size-4" />
                    </button>
                </div>
            </header>

            <main className="px-4 py-5 pb-24 sm:px-6 sm:py-6 sm:pb-24 lg:px-8 lg:py-7 lg:pb-7">
                <section className="flex min-w-0 flex-col gap-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <p className="label-caps mb-2 text-[hsl(var(--primary))] lg:mb-3">{panelCopy.eyebrow}</p>
                            <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))] sm:text-3xl">
                                {panelCopy.title}
                            </h1>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                                {panelCopy.body}
                            </p>
                        </div>
                        {publicHref && (
                            <ShareLinkBlock url={bookingPath} href={publicHref} />
                        )}
                    </div>

                    {activePanel === "overview" && (
                        <OverviewPanel
                            setup={setup}
                            setupLoaded={setupLoaded}
                            refreshKey={refreshKey}
                        />
                    )}

                    {activePanel === "profile" && (
                        <ProfilePanel
                            bookingPath={bookingPath}
                            publicHref={publicHref}
                            onReviewAvailability={() => handleSelectPanel("availability")}
                        />
                    )}

                    {activePanel === "availability" && (
                        <PanelShell>
                            <AvailabilityEditor
                                timezone={user.timezone}
                                onSaved={() => setRefreshKey((k) => k + 1)}
                            />
                        </PanelShell>
                    )}

                    {activePanel === "booking-types" && (
                        <PanelShell>
                            <EventTypesPanel
                                hostSlug={user.slug || null}
                                onChange={() => setRefreshKey((k) => k + 1)}
                            />
                        </PanelShell>
                    )}

                    {activePanel === "bookings" && <BookingsPanel />}

                    {activePanel === "payments" && (
                        <PanelShell>
                            <p className="text-sm text-[hsl(var(--muted-foreground))]">
                                Paid event types are disabled until Stripe Connect ships. Solo plan
                                activation will live here.
                            </p>
                        </PanelShell>
                    )}

                    {activePanel === "settings" && <SettingsPanel />}
                </section>
            </main>

            {/*
              Mobile bottom tab bar. Fixed to the viewport so it's always
              thumb-reachable. `env(safe-area-inset-bottom)` keeps the labels
              above the iOS home indicator.
            */}
            <nav
                aria-label="Dashboard sections"
                className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-[hsl(var(--border))]/60 bg-[hsl(var(--background))]/95 backdrop-blur lg:hidden"
                style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
                {SIDEBAR_ITEMS.map(({ key, icon: Icon, label, shortLabel }) => {
                    const active = activePanel === key;
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => handleSelectPanel(key)}
                            aria-current={active ? "page" : undefined}
                            aria-label={label}
                            className={cn(
                                "relative flex cursor-pointer flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]/50",
                                active
                                    ? "text-[hsl(var(--primary))]"
                                    : "text-[hsl(var(--muted-foreground))]",
                            )}
                        >
                            {active && (
                                <span className="absolute inset-x-3 top-0 h-[2px] rounded-b-full bg-[hsl(var(--primary))]" />
                            )}
                            <Icon className="size-5" />
                            <span className="truncate">{shortLabel ?? label}</span>
                        </button>
                    );
                })}
            </nav>
        </div>
    );
}

// ─── Overview ────────────────────────────────────────────────────────────────

function OverviewPanel({ setup, setupLoaded, refreshKey }: {
    setup: SetupState;
    setupLoaded: boolean;
    refreshKey: number;
}) {
    const allDone = setup.profile && setup.availability && setup.eventType;
    const prevAllDone = useRef<boolean | null>(null);
    const [justCompleted, setJustCompleted] = useState(false);

    useEffect(() => {
        if (!setupLoaded) return;
        if (prevAllDone.current === false && allDone) {
            setJustCompleted(true);
        }
        prevAllDone.current = allDone;
    }, [setupLoaded, allDone]);

    const showSetup = !setupLoaded || !allDone || justCompleted;

    return (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex flex-col gap-6">
                {showSetup && (
                    <PanelShell title="Get bookable">
                        {setupLoaded ? (
                            <SetupChecklist state={setup} />
                        ) : (
                            <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading status…</p>
                        )}
                    </PanelShell>
                )}
                <PanelShell title="Upcoming bookings">
                    <UpcomingBookings refreshKey={refreshKey} />
                </PanelShell>
            </div>
            <PanelShell title="Active sessions">
                <ActiveSessionsPanel refreshKey={refreshKey} />
            </PanelShell>
        </div>
    );
}

function ActiveSessionsPanel({ refreshKey }: { refreshKey: number }) {
    const [bookings, setBookings] = useState<HostBooking[]>([]);
    const [loading, setLoading] = useState(true);
    const [nowMs, setNowMs] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        listMyBookings()
            .then((list) => {
                if (cancelled) return;
                const now = Date.now();
                setNowMs(now);
                setBookings(
                    list.filter((b) => {
                        const start = new Date(b.startsAt).getTime();
                        const end = new Date(b.endsAt).getTime();
                        // Active now or starting within 30 minutes
                        return start <= now + 30 * 60 * 1000 && end > now;
                    }),
                );
            })
            .catch(() => { /* silently degrade — upcoming panel already shows errors */ })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [refreshKey]);

    if (loading || nowMs === null) {
        return (
            <div className="flex flex-col gap-3">
                <NewMeetingButton className="w-full" />
                <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading…</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            <NewMeetingButton className="w-full" />
            {bookings.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    No active or upcoming sessions right now.
                </p>
            ) : (
                <div className="flex flex-col gap-2">
                    {bookings.map((b) => {
                        const start = new Date(b.startsAt).getTime();
                        const isLive = start <= nowMs;
                        const minsUntil = Math.ceil((start - nowMs) / 60_000);
                        return (
                            <div key={b.id} className="relative overflow-hidden rounded-xl border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface-2))] px-3 py-2.5">
                                <span className={cn(
                                    "absolute inset-y-0 left-0 w-[3px]",
                                    isLive ? "bg-emerald-500" : "bg-[hsl(var(--primary))]/50",
                                )} />
                                <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-[hsl(var(--foreground))]">
                                            {b.eventTitle ?? "Session"}
                                        </p>
                                        <p className="mt-0.5 truncate text-xs text-[hsl(var(--muted-foreground))]">
                                            {isLive ? (
                                                <span className="font-medium text-emerald-500">Live now</span>
                                            ) : (
                                                `In ${minsUntil} min`
                                            )}
                                            {" · "}{b.guestName}
                                        </p>
                                    </div>
                                    <Button asChild size="sm" variant={isLive ? "primary" : "secondary"} className="shrink-0">
                                        <Link href={roomPath(b.meetCode)}>
                                            <Video className="size-3.5" />
                                            {isLive ? "Join" : "Open"}
                                        </Link>
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── Shared pieces ───────────────────────────────────────────────────────────

function PanelShell({ title, children }: { title?: string; children: React.ReactNode }) {
    return (
        <section className="app-panel no-lift rounded-2xl p-5 sm:p-6">
            {title && (
                <p className="mb-4 text-sm font-semibold text-[hsl(var(--foreground))]">{title}</p>
            )}
            {children}
        </section>
    );
}

function ShareLinkBlock({ url, href }: { url: string; href: string }) {
    const [copied, setCopied] = useState(false);

    async function copy() {
        try {
            await navigator.clipboard.writeText(`https://${url}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard denied — fall back to nothing. The link below is the
            // visible affordance.
        }
    }

    return (
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <p className="label-caps text-[hsl(var(--muted-foreground))]">Your booking link</p>
            <div className="flex items-center gap-2 rounded-xl border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface-2))] px-3 py-2">
                <Link href={href} target="_blank" rel="noopener noreferrer" className="link truncate text-sm">{url}</Link>
                <button
                    type="button"
                    onClick={copy}
                    aria-label={copied ? "Booking link copied" : "Copy booking link"}
                    className="press cursor-pointer rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-3))] hover:text-[hsl(var(--foreground))]"
                >
                    {copied
                        ? <Check className="size-3.5 text-[hsl(var(--primary))]" />
                        : <Copy className="size-3.5" />}
                </button>
            </div>
        </div>
    );
}

function slugifyProfileSlug(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 30);
}

function ProfilePanel({
    bookingPath,
    publicHref,
    onReviewAvailability,
}: {
    bookingPath: string;
    publicHref: string | null;
    onReviewAvailability: () => void;
}) {
    const { user, refreshUser } = useAuth();
    const [name, setName] = useState(user?.name ?? "");
    const [slug, setSlug] = useState(user?.slug ?? "");
    const [timezone, setTimezone] = useState(user?.timezone ?? "America/New_York");
    const [avatarInput, setAvatarInput] = useState(user?.avatarUrl ?? "");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [timezoneReviewPending, setTimezoneReviewPending] = useState(false);
    const savedTimezone = user?.timezone ?? "America/New_York";
    const timezoneChanged = timezone !== savedTimezone;

    useEffect(() => {
        setName(user?.name ?? "");
        setSlug(user?.slug ?? "");
        setTimezone(user?.timezone ?? "America/New_York");
        setAvatarInput(user?.avatarUrl ?? "");
    }, [user]);

    async function saveProfile(e: React.FormEvent) {
        e.preventDefault();
        if (!user) return;
        const nextName = name.trim();
        const nextSlug = slugifyProfileSlug(slug);
        if (!nextName) {
            setError("Name is required.");
            return;
        }
        if (nextSlug.length < 3) {
            setError("Booking link must be at least 3 characters.");
            return;
        }
        const changedTimezone = timezone !== user.timezone;
        setSaving(true);
        setError(null);
        try {
            await updateProfile({
                name: nextName,
                slug: nextSlug,
                timezone,
                onboardingStep: user.onboardingStep,
                avatarUrl: avatarInput.trim() || null,
            });
            await refreshUser?.();
            setTimezoneReviewPending(changedTimezone);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save profile");
        } finally {
            setSaving(false);
        }
    }

    return (
        <PanelShell>
            <form onSubmit={saveProfile} className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">
                <div className="flex flex-col items-center justify-center gap-3">
                    {avatarInput ? (
                        <img
                            src={avatarInput}
                            alt="Profile preview"
                            className="size-24 rounded-full object-cover ring-2 ring-[hsl(var(--border))]"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                    ) : (
                        <div className="flex size-24 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(var(--primary))] to-violet-500 text-2xl font-semibold text-white ring-2 ring-[hsl(var(--border))]">
                            {initialsOf(name || user?.email || "")}
                        </div>
                    )}
                    {publicHref && (
                        <Button asChild variant="outline" size="sm">
                            <Link href={publicHref} target="_blank" rel="noopener noreferrer">
                                View public page
                            </Link>
                        </Button>
                    )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="profile-name" className="label-caps">Display name</label>
                        <Input
                            id="profile-name"
                            value={name}
                            onChange={(e) => { setName(e.target.value); setSaved(false); }}
                            autoComplete="name"
                            maxLength={80}
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="profile-timezone" className="label-caps">Timezone</label>
                        <SearchableSelect
                            id="profile-timezone"
                            value={timezone}
                            onValueChange={(v) => {
                                setTimezone(v);
                                setSaved(false);
                                setTimezoneReviewPending(false);
                            }}
                            options={TIMEZONES.map((tz) => ({ value: tz, label: tz.replace(/_/g, " ") }))}
                        />
                    </div>

                    {(timezoneChanged || timezoneReviewPending) && (
                        <InlineNotice
                            tone="warning"
                            icon={AlertTriangle}
                            title="Timezone changes do not move existing bookings."
                            className="sm:col-span-2"
                        >
                            <p>
                                Meetings already booked keep their scheduled time. Future slots use this timezone only after you save and review your availability.
                            </p>
                            {timezoneReviewPending && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={onReviewAvailability}
                                    className="mt-3"
                                >
                                    <CalendarCheck className="size-3.5" />
                                    Review availability
                                </Button>
                            )}
                        </InlineNotice>
                    )}

                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <label htmlFor="profile-slug" className="label-caps">Booking link</label>
                        <div className="flex rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--surface-2))] shadow-sm focus-within:border-[hsl(var(--primary))] focus-within:ring-4 focus-within:ring-[hsl(var(--primary))]/15">
                            <span className="flex items-center border-r border-[hsl(var(--border))]/70 px-3 text-sm text-[hsl(var(--muted-foreground))]">
                                getsessionly.com/u/
                            </span>
                            <input
                                id="profile-slug"
                                value={slug}
                                onChange={(e) => { setSlug(slugifyProfileSlug(e.target.value)); setSaved(false); }}
                                className="min-w-0 flex-1 rounded-r-xl bg-transparent px-3 py-2.5 text-sm text-[hsl(var(--foreground))] outline-none"
                                maxLength={30}
                            />
                        </div>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">{bookingPath}</p>
                    </div>

                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <label htmlFor="profile-avatar" className="label-caps">Photo URL</label>
                        <Input
                            id="profile-avatar"
                            type="url"
                            value={avatarInput}
                            onChange={(e) => { setAvatarInput(e.target.value); setSaved(false); }}
                            placeholder="https://example.com/your-photo.jpg"
                        />
                    </div>

                    <div className="flex items-center gap-3 sm:col-span-2">
                        <Button type="submit" disabled={saving}>
                            {saving ? <BufferingButtonLabel label="Saving…" /> : saved ? <><Check className="size-3.5" />Saved</> : "Save profile"}
                        </Button>
                        {error && <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>}
                    </div>
                </div>
            </form>
        </PanelShell>
    );
}

function SettingsPanel() {
    const { theme, setTheme } = useTheme();
    const [micOn, setMicOn] = useState(() => callDefaults.getMicOn());
    const [cameraOn, setCameraOn] = useState(() => callDefaults.getCameraOn());

    const handleMicToggle = (v: boolean) => { setMicOn(v); callDefaults.setMicOn(v); };
    const handleCameraToggle = (v: boolean) => { setCameraOn(v); callDefaults.setCameraOn(v); };

    return (
        <div className="flex flex-col gap-5">
            {/* Appearance */}
            <section className="app-panel no-lift rounded-2xl p-5 sm:p-6">
                <p className="mb-1 text-sm font-semibold text-[hsl(var(--foreground))]">Appearance</p>
                <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
                    Choose how Sessionly looks on this device.
                </p>
                <div
                    role="radiogroup"
                    aria-label="Theme"
                    className="inline-flex rounded-xl border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface-2))] p-1 gap-1"
                >
                    {THEME_OPTIONS.map(({ label, value, icon: Icon }) => {
                        const active = theme === value;
                        return (
                            <button
                                key={value}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                onClick={() => setTheme(value)}
                                className={cn(
                                    "press flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/50",
                                    active
                                        ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-medium shadow-sm"
                                        : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-3))]",
                                )}
                            >
                                <Icon className="size-3.5 shrink-0" />
                                {label}
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* Call defaults */}
            <section className="app-panel no-lift rounded-2xl p-5 sm:p-6">
                <p className="mb-1 text-sm font-semibold text-[hsl(var(--foreground))]">Call defaults</p>
                <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
                    Choose what&apos;s on when you first join a call. You can always change this in the prejoin screen.
                </p>
                <div className="flex flex-col divide-y divide-[hsl(var(--border))]/50">
                    <div className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-2.5">
                            <Mic className="size-4 text-[hsl(var(--muted-foreground))]" />
                            <span className="text-sm text-[hsl(var(--foreground))]">Microphone on by default</span>
                        </div>
                        <Switch checked={micOn} onChange={handleMicToggle} size="sm" />
                    </div>
                    <div className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-2.5">
                            <Video className="size-4 text-[hsl(var(--muted-foreground))]" />
                            <span className="text-sm text-[hsl(var(--foreground))]">Camera on by default</span>
                        </div>
                        <Switch checked={cameraOn} onChange={handleCameraToggle} size="sm" />
                    </div>
                </div>
            </section>
        </div>
    );
}
