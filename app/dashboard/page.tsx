"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, useTransition } from "react";
import {
    ArrowRight,
    CalendarCheck,
    CheckCircle2,
    Copy,
    CreditCard,
    Link2,
    LogOut,
    LaptopMinimal,
    MoonStar,
    Settings,
    SunMedium,
    Video,
} from "lucide-react";

import { AvailabilityEditor } from "@/src/components/dashboard/AvailabilityEditor";
import { EventTypesPanel } from "@/src/components/dashboard/EventTypesPanel";
import { SetupChecklist, type SetupState } from "@/src/components/dashboard/SetupChecklist";
import { UpcomingBookings } from "@/src/components/dashboard/UpcomingBookings";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { JoinMeetButton } from "@/src/components/ui/JoinMeetButton";
import { NewMeetingButton } from "@/src/components/ui/NewMeetButton";
import { SessionlyBrand } from "@/src/components/ui/SessionlyBrand";
import { ThemeMode, useTheme } from "@/src/components/theme-provider";
import { useAuth } from "@/src/hooks/use-auth";
import { normalizeMeetCodeInput, roomPath } from "@/src/lib/room-routes";
import { cn } from "@/src/lib/utils";
import { getAvailability } from "@/src/services/api/availability";
import { listEventTypes } from "@/src/services/api/event-types";

const meetCodePattern = /^[a-z2-9]{3}-[a-z2-9]{4}-[a-z2-9]{3}$/;

type PanelKey = "overview" | "availability" | "booking-types" | "rooms" | "payments" | "settings";

const SIDEBAR_ITEMS: ReadonlyArray<{
    key: PanelKey;
    icon: typeof CheckCircle2;
    label: string;
}> = [
    { key: "overview", icon: CheckCircle2, label: "Overview" },
    { key: "availability", icon: CalendarCheck, label: "Availability" },
    { key: "booking-types", icon: Link2, label: "Event types" },
    { key: "rooms", icon: Video, label: "Instant rooms" },
    { key: "payments", icon: CreditCard, label: "Payments" },
    { key: "settings", icon: Settings, label: "Settings" },
];

const PANEL_COPY: Record<PanelKey, { eyebrow: string; title: string; body: string }> = {
    overview: {
        eyebrow: "Overview",
        title: "Your scheduling hub",
        body: "Share your booking link, watch upcoming sessions, and pick up where you left off in setup.",
    },
    availability: {
        eyebrow: "Availability",
        title: "Set bookable hours",
        body: "Guests only see times inside these windows. Add split shifts when a day has a break.",
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
    rooms: {
        eyebrow: "Vartalaap",
        title: "Instant video rooms",
        body: "Spin up a room without a booking — useful for ad-hoc calls and testing the SFU.",
    },
    settings: {
        eyebrow: "Settings",
        title: "Appearance and account",
        body: "Theme and workspace preferences live here, separate from the product surface.",
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
    "overview", "availability", "booking-types", "rooms", "payments", "settings",
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
    const [meetingCode, setMeetingCode] = useState("");
    const [isJoining, startJoinTransition] = useTransition();

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
    const code = normalizeMeetCodeInput(meetingCode);
    const canJoin = meetCodePattern.test(code);
    const panelCopy = PANEL_COPY[activePanel];

    const handleJoin = () => {
        if (!canJoin || isJoining) return;
        startJoinTransition(() => router.push(roomPath(code)));
    };

    const handleSelectPanel = (key: PanelKey) => {
        setActivePanel(key);
        // Reflect the panel in the URL so reload + share work.
        router.replace(`/dashboard?panel=${key}`, { scroll: false });
    };

    return (
        <div className="min-h-dvh bg-[hsl(var(--background))] lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="border-b border-[hsl(var(--border))]/60 lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r">
                <div className="flex h-full flex-col px-3 py-4">
                    <Link href="/dashboard" className="mb-1 flex items-center rounded-xl px-3 py-2 hover:bg-[hsl(var(--surface-2))]">
                        <span className="min-w-0">
                            <SessionlyBrand size="sm" />
                            <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">Workspace</span>
                        </span>
                    </Link>

                    <div className="mb-3 mt-2 border-t border-[hsl(var(--border))]/50 px-3 pt-4">
                        <p className="truncate text-sm font-medium text-[hsl(var(--foreground))]">
                            {user.name || user.email}
                        </p>
                        <p className="mt-1 truncate text-xs text-[hsl(var(--muted-foreground))]">
                            {bookingPath}
                        </p>
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

            <main className="px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
                <section className="flex min-w-0 flex-col gap-5">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <p className="label-caps mb-3 text-[hsl(var(--primary))]">{panelCopy.eyebrow}</p>
                            <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))] sm:text-3xl">
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
                            meetingCode={meetingCode}
                            setMeetingCode={setMeetingCode}
                            canJoin={canJoin}
                            isJoining={isJoining}
                            onJoin={handleJoin}
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

                    {activePanel === "rooms" && (
                        <PanelShell>
                            <RoomsBody
                                meetingCode={meetingCode}
                                setMeetingCode={setMeetingCode}
                                canJoin={canJoin}
                                isJoining={isJoining}
                                onJoin={handleJoin}
                            />
                        </PanelShell>
                    )}

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
        </div>
    );
}

// ─── Overview ────────────────────────────────────────────────────────────────

function OverviewPanel({
    setup, setupLoaded, refreshKey,
    meetingCode, setMeetingCode, canJoin, isJoining, onJoin,
}: {
    setup: SetupState;
    setupLoaded: boolean;
    refreshKey: number;
    meetingCode: string;
    setMeetingCode: (v: string) => void;
    canJoin: boolean;
    isJoining: boolean;
    onJoin: () => void;
}) {
    return (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex flex-col gap-6">
                <PanelShell title="Get bookable">
                    {setupLoaded ? (
                        <SetupChecklist state={setup} />
                    ) : (
                        <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading status…</p>
                    )}
                </PanelShell>
                <PanelShell title="Upcoming bookings">
                    <UpcomingBookings refreshKey={refreshKey} />
                </PanelShell>
            </div>
            <PanelShell title="Instant room">
                <RoomsBody
                    meetingCode={meetingCode}
                    setMeetingCode={setMeetingCode}
                    canJoin={canJoin}
                    isJoining={isJoining}
                    onJoin={onJoin}
                />
            </PanelShell>
        </div>
    );
}

// ─── Shared pieces ───────────────────────────────────────────────────────────

function PanelShell({ title, children }: { title?: string; children: React.ReactNode }) {
    return (
        <section className="app-panel rounded-2xl p-5 sm:p-6">
            {title && (
                <p className="label-caps mb-4">{title}</p>
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
                <Link href={href} target="_blank" className="link truncate text-sm">{url}</Link>
                <button
                    type="button"
                    onClick={copy}
                    aria-label="Copy booking link"
                    className="press cursor-pointer rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-3))] hover:text-[hsl(var(--foreground))]"
                >
                    <Copy className="size-3.5" />
                </button>
            </div>
            {copied && (
                <p className="text-right text-[10px] text-[hsl(var(--primary))]">Copied</p>
            )}
        </div>
    );
}

function RoomsBody({
    meetingCode, setMeetingCode, canJoin, isJoining, onJoin,
}: {
    meetingCode: string;
    setMeetingCode: (v: string) => void;
    canJoin: boolean;
    isJoining: boolean;
    onJoin: () => void;
}) {
    return (
        <div className="flex max-w-md flex-col gap-3">
            <NewMeetingButton className="w-full" />
            <div className="relative flex items-center gap-2">
                <div className="h-px flex-1 bg-[hsl(var(--border))]" />
                <span className="label-caps">or join</span>
                <div className="h-px flex-1 bg-[hsl(var(--border))]" />
            </div>
            <div className="flex gap-2">
                <Input
                    type="text"
                    name="meet-code"
                    value={meetingCode}
                    onChange={(e) => setMeetingCode(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && onJoin()}
                    placeholder="Code or link"
                    className="meet-code flex-1"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={isJoining}
                />
                <JoinMeetButton
                    disabled={!canJoin || isJoining}
                    loading={isJoining}
                    onJoin={onJoin}
                    className="shrink-0"
                />
            </div>
        </div>
    );
}

function SettingsPanel() {
    const { theme, resolvedTheme, setTheme } = useTheme();
    return (
        <section className="app-panel rounded-2xl p-5 sm:p-6">
            <p className="label-caps mb-2">Appearance</p>
            <p className="mb-5 text-sm text-[hsl(var(--muted-foreground))]">
                Current theme: {resolvedTheme}.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
                {THEME_OPTIONS.map(({ label, value, icon: Icon, body }) => {
                    const active = theme === value;
                    return (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setTheme(value)}
                            aria-pressed={active}
                            className={cn(
                                "press cursor-pointer rounded-xl border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/50",
                                active
                                    ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10"
                                    : "border-[hsl(var(--border))]/80 bg-[hsl(var(--surface-2))] hover:border-[hsl(var(--primary))]/50",
                            )}
                        >
                            <span
                                className={cn(
                                    "mb-4 flex size-9 items-center justify-center rounded-lg",
                                    active
                                        ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                                        : "bg-[hsl(var(--surface-3))] text-[hsl(var(--muted-foreground))]",
                                )}
                            >
                                <Icon className="size-4" />
                            </span>
                            <span className="block font-medium text-[hsl(var(--foreground))]">{label}</span>
                            <span className="mt-1 block text-sm leading-5 text-[hsl(var(--muted-foreground))]">{body}</span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
