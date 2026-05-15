"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
    ArrowRight,
    CalendarCheck,
    CheckCircle2,
    CreditCard,
    Link2,
    LogOut,
    LaptopMinimal,
    MoonStar,
    Settings,
    SunMedium,
    Video,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { JoinMeetButton } from "@/src/components/ui/JoinMeetButton";
import { NewMeetingButton } from "@/src/components/ui/NewMeetButton";
import { SessionlyWordmark } from "@/src/components/ui/SessionlyWordmark";
import { ThemeMode, useTheme } from "@/src/components/theme-provider";
import { useAuth } from "@/src/hooks/use-auth";
import { cn } from "@/src/lib/utils";

const meetCodePattern = /^[a-z2-9]{3}-[a-z2-9]{4}-[a-z2-9]{3}$/;

function normalizeMeetCode(raw: string): string {
    const trimmed = raw.trim();
    try {
        const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
        const path = url.pathname.replace(/^\/+|\/+$/g, "");
        if (path) return path.toLowerCase();
    } catch {
        // The value is a plain room code.
    }
    return trimmed.replace(/^\/+|\/+$/g, "").toLowerCase();
}

type PanelKey = "overview" | "availability" | "booking-types" | "payments" | "rooms" | "settings";

const SIDEBAR_ITEMS: Array<{
    key: PanelKey;
    icon: typeof CheckCircle2;
    label: string;
    status: string;
}> = [
    {
        key: "overview",
        icon: CheckCircle2,
        label: "Overview",
        status: "Ready",
    },
    {
        key: "availability",
        icon: CalendarCheck,
        label: "Availability",
        status: "Next",
    },
    {
        key: "booking-types",
        icon: Link2,
        label: "Booking types",
        status: "Next",
    },
    {
        key: "payments",
        icon: CreditCard,
        label: "Payments",
        status: "Later",
    },
    {
        key: "rooms",
        icon: Video,
        label: "Vartalaap rooms",
        status: "Live",
    },
    {
        key: "settings",
        icon: Settings,
        label: "Settings",
        status: "Ready",
    },
];

const SETUP_ITEMS = [
    {
        title: "Profile",
        status: "Complete",
        body: "Name, URL, and timezone are saved.",
    },
    {
        title: "Availability",
        status: "Next",
        body: "Persist weekly hours so clients only see real openings.",
    },
    {
        title: "Booking type",
        status: "Next",
        body: "Create a free 30-minute session type tied to the reserved URL.",
    },
    {
        title: "Payments",
        status: "Later",
        body: "Add Stripe after free booking creation works end to end.",
    },
];

const PANEL_COPY: Record<PanelKey, { eyebrow: string; title: string; body: string }> = {
    overview: {
        eyebrow: "Overview",
        title: "Finish the booking workspace",
        body: "Sessionly is the scheduling product. Vartalaap stays as the video room module, available from the sidebar while booking pages are still being wired up.",
    },
    availability: {
        eyebrow: "Availability",
        title: "Set bookable hours",
        body: "Availability should be the next functional slice so clients only see real openings instead of a static onboarding preview.",
    },
    "booking-types": {
        eyebrow: "Booking types",
        title: "Publish your first session",
        body: "Booking types should turn your reserved URL into a usable public page with duration, description, and pricing.",
    },
    payments: {
        eyebrow: "Payments",
        title: "Prepare paid sessions",
        body: "Payments should come after free booking works end to end, then connect Stripe for Solo users without platform fees.",
    },
    rooms: {
        eyebrow: "Vartalaap",
        title: "Video rooms",
        body: "Vartalaap is the video room product inside Sessionly. Keep instant rooms accessible here without making them the whole app.",
    },
    settings: {
        eyebrow: "Settings",
        title: "Configure your workspace",
        body: "Personal and workspace preferences belong here, away from the primary product navigation.",
    },
};

const THEME_OPTIONS: Array<{
    label: string;
    value: ThemeMode;
    icon: typeof SunMedium;
    body: string;
}> = [
    { label: "Light", value: "light", icon: SunMedium, body: "Bright interface for daytime work." },
    { label: "Dark", value: "dark", icon: MoonStar, body: "Lower brightness for long sessions." },
    { label: "System", value: "system", icon: LaptopMinimal, body: "Follow this device automatically." },
];

function SettingsPanel() {
    const { theme, resolvedTheme, setTheme } = useTheme();

    return (
        <section className="app-panel rounded-2xl p-5 sm:p-6">
            <div className="mb-6">
                <p className="label-caps mb-2">Settings</p>
                <h2 className="text-xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
                    Appearance
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                    Theme selection lives here instead of the dashboard chrome. Current resolved theme: {resolvedTheme}.
                </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                {THEME_OPTIONS.map(({ label, value, icon: Icon, body }) => {
                    const active = theme === value;
                    return (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setTheme(value)}
                            aria-label={`Use ${label.toLowerCase()} theme`}
                            aria-pressed={active}
                            className={cn(
                                "cursor-pointer rounded-xl border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/50",
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
                            <span className="mt-1 block text-sm leading-5 text-[hsl(var(--muted-foreground))]">
                                {body}
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}

function RoadmapPanel({ activePanel }: { activePanel: PanelKey }) {
    const activeTitle = PANEL_COPY[activePanel].title;

    return (
        <section className="app-panel rounded-2xl p-5 sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                    <p className="label-caps mb-2">Setup path</p>
                    <h2 className="text-xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
                        {activePanel === "overview" ? "What Sessionly should improve next" : activeTitle}
                    </h2>
                </div>
                <span className="rounded-full border border-[hsl(var(--border))] px-3 py-1 text-xs font-medium text-[hsl(var(--muted-foreground))]">
                    1 of 4
                </span>
            </div>

            <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))]/80">
                {SETUP_ITEMS.map(({ title, status, body }, index) => {
                    const highlighted =
                        (activePanel === "availability" && title === "Availability") ||
                        (activePanel === "booking-types" && title === "Booking type") ||
                        (activePanel === "payments" && title === "Payments");

                    return (
                        <div
                            key={title}
                            className={cn(
                                "grid gap-3 bg-[hsl(var(--surface-2))] p-4 sm:grid-cols-[140px_minmax(0,1fr)_90px] sm:items-center",
                                index > 0 && "border-t border-[hsl(var(--border))]/80",
                                highlighted && "bg-[hsl(var(--primary))]/10",
                            )}
                        >
                            <p className="font-medium text-[hsl(var(--foreground))]">{title}</p>
                            <p className="text-sm leading-5 text-[hsl(var(--muted-foreground))]">{body}</p>
                            <span
                                className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                    status === "Complete"
                                        ? "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"
                                        : "bg-[hsl(var(--border))]/70 text-[hsl(var(--muted-foreground))]"
                                }`}
                            >
                                {status}
                            </span>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

function RoomsPanel({
    meetingCode,
    setMeetingCode,
    isJoining,
    canJoin,
    onJoin,
}: {
    meetingCode: string;
    setMeetingCode: (value: string) => void;
    isJoining: boolean;
    canJoin: boolean;
    onJoin: () => void;
}) {
    return (
        <section className="app-panel rounded-2xl p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
                    <Video className="size-5" />
                </span>
                <div>
                    <p className="label-caps mb-1">Vartalaap</p>
                    <h2 className="text-xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
                        Video rooms
                    </h2>
                </div>
            </div>
            <p className="mb-5 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                Start or join an instant room from here. This is a Sessionly product area, not the primary app home.
            </p>

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
        </section>
    );
}

export default function DashboardPage() {
    const router = useRouter();
    const { user, isAuthenticated, isLoading, logout } = useAuth();
    const [meetingCode, setMeetingCode] = useState("");
    const [activePanel, setActivePanel] = useState<PanelKey>("overview");
    const [isJoining, startJoinTransition] = useTransition();

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.replace("/login");
        }
    }, [isAuthenticated, isLoading, router]);

    if (isLoading) {
        return <div className="min-h-dvh" />;
    }

    if (!isAuthenticated || !user) {
        return null;
    }

    const bookingPath = user.slug ? `getsessionly.com/${user.slug}` : "getsessionly.com/your-name";
    const code = normalizeMeetCode(meetingCode);
    const canJoin = meetCodePattern.test(code);
    const panelCopy = PANEL_COPY[activePanel];

    const handleJoin = () => {
        if (!canJoin || isJoining) return;
        startJoinTransition(() => {
            router.push(`/${code}`);
        });
    };

    return (
        <div className="min-h-dvh bg-[hsl(var(--background))]">
            <main className="py-3 pl-2 pr-3 sm:py-4 sm:pl-2 sm:pr-5 lg:py-4 lg:pl-3 lg:pr-6">
                <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
                    <aside className="lg:sticky lg:top-6 lg:self-start">
                        <div className="flex min-h-[calc(100dvh-2rem)] flex-col rounded-2xl border border-[hsl(var(--border))]/80 bg-[hsl(var(--surface))] p-3 shadow-sm">
                            <Link href="/dashboard" className="mb-3 flex items-center rounded-xl px-3 py-2.5 hover:bg-[hsl(var(--surface-2))]">
                                <span className="min-w-0">
                                    <SessionlyWordmark className="block text-sm text-[hsl(var(--foreground))]" />
                                    <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">
                                        Workspace
                                    </span>
                                </span>
                            </Link>

                            <div className="border-t border-[hsl(var(--border))]/70 px-3 py-4">
                                <p className="truncate text-sm font-medium text-[hsl(var(--foreground))]">
                                    {user.name || user.email}
                                </p>
                                <p className="mt-1 truncate text-xs text-[hsl(var(--muted-foreground))]">
                                    {bookingPath}
                                </p>
                            </div>

                            <nav className="flex flex-col gap-1" aria-label="Dashboard sections">
                                {SIDEBAR_ITEMS.map(({ key, icon: Icon, label, status }) => {
                                    const active = activePanel === key;
                                    return (
                                    <button
                                        key={label}
                                        type="button"
                                        onClick={() => setActivePanel(key)}
                                        aria-current={active ? "page" : undefined}
                                        className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/50 ${
                                            active
                                                ? "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"
                                                : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]"
                                        }`}
                                    >
                                        <Icon className="size-4 shrink-0" />
                                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
                                        <span
                                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                                active
                                                    ? "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"
                                                    : "bg-[hsl(var(--border))]/60 text-[hsl(var(--muted-foreground))]"
                                            }`}
                                        >
                                            {status}
                                        </span>
                                    </button>
                                    );
                                })}
                            </nav>

                            <div className="mt-auto border-t border-[hsl(var(--border))]/70 p-3">
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

                    <section className="flex min-w-0 flex-col gap-6">
                        <div className="rounded-2xl border border-[hsl(var(--border))]/80 bg-[hsl(var(--surface))] p-5 shadow-sm sm:p-6">
                            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                                <div>
                                    <p className="label-caps mb-3 text-[hsl(var(--primary))]">
                                        {panelCopy.eyebrow}
                                    </p>
                                    <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))] sm:text-3xl">
                                        {panelCopy.title}
                                    </h1>
                                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                                        {panelCopy.body}
                                    </p>
                                </div>
                                {activePanel !== "settings" && activePanel !== "rooms" && (
                                    <Button asChild>
                                        <Link href="/onboarding">
                                            Edit setup <ArrowRight className="size-4" />
                                        </Link>
                                    </Button>
                                )}
                            </div>
                        </div>

                        {activePanel === "settings" ? (
                            <SettingsPanel />
                        ) : activePanel === "rooms" ? (
                            <RoomsPanel
                                meetingCode={meetingCode}
                                setMeetingCode={setMeetingCode}
                                isJoining={isJoining}
                                canJoin={canJoin}
                                onJoin={handleJoin}
                            />
                        ) : (
                        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                            <RoadmapPanel activePanel={activePanel} />
                            <RoomsPanel
                                meetingCode={meetingCode}
                                setMeetingCode={setMeetingCode}
                                isJoining={isJoining}
                                canJoin={canJoin}
                                onJoin={handleJoin}
                            />
                        </div>
                        )}
                    </section>
                </div>
            </main>
        </div>
    );
}
