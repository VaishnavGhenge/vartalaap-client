import { Loader2 } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { StandaloneHeader } from "@/src/components/ui/StandaloneHeader";
import { AuthShell } from "@/src/components/ui/AuthShell";
import { ThemeToggleButton } from "@/src/components/ui/ThemeToggleButton";

function Skeleton({ className }: { className: string }) {
    return <div aria-hidden="true" className={cn("skeleton", className)} />;
}

export function LoadingContent({
    label = "Loading…",
    className,
    layout = "list",
}: {
    label?: string;
    className?: string;
    layout?: "list" | "calendar" | "events";
}) {
    return (
        <div role="status" aria-busy="true" className={cn("w-full", className)}>
            <span className="sr-only">{label}</span>
            {layout === "calendar" ? (
                <div className="experience-card flex min-h-36 items-center gap-4 p-5">
                    <Skeleton className="size-10" />
                    <div className="flex-1 space-y-3">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-3 w-3/4" />
                    </div>
                    <Skeleton className="h-9 w-24" />
                </div>
            ) : (
                <div className="space-y-3">
                    {Array.from({ length: 3 }, (_, i) => (
                        <div
                            key={i}
                            className="flex min-h-24 items-center gap-4 rounded-xl border border-[hsl(var(--border))] p-5"
                        >
                            <Skeleton className={layout === "events" ? "h-12 w-1" : "size-10"} />
                            <div className="min-w-0 flex-1 space-y-3">
                                <Skeleton className="h-4 w-1/2" />
                                <Skeleton className="h-3 w-3/4" />
                            </div>
                            <Skeleton className="h-8 w-16" />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function BookingLoadingContent() {
    return (
        <div
            role="status"
            aria-busy="true"
            className="experience-card w-full max-w-6xl lg:grid lg:grid-cols-[300px_minmax(0,1fr)]"
        >
            <span className="sr-only">Finding the details for your session…</span>
            <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-2))]/65 p-6 sm:p-8 lg:border-b-0 lg:border-r">
                <Skeleton className="mb-7 h-4 w-24" />
                <div className="flex gap-4 lg:flex-col lg:gap-5">
                    <Skeleton className="size-16 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-4">
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-9 w-48 max-w-full" />
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-4 w-40 max-w-full" />
                        <Skeleton className="h-4 w-44 max-w-full" />
                    </div>
                </div>
                <div className="mt-7 space-y-3 border-t border-[hsl(var(--border))] pt-5">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                </div>
            </div>
            <div className="min-w-0 p-5 sm:p-8">
                <Skeleton className="mb-7 h-6 w-72 max-w-full" />
                <Skeleton className="h-6 w-64 max-w-full" />
                <Skeleton className="mt-3 h-4 w-80 max-w-full" />
                <div className="mt-8 sm:grid sm:grid-cols-[minmax(240px,1.2fr)_minmax(140px,0.8fr)] sm:gap-6">
                    <div>
                        <Skeleton className="mb-4 h-8 w-36" />
                        <div className="mb-1 grid grid-cols-7 justify-items-center">
                            {Array.from({ length: 7 }, (_, i) => (
                                <Skeleton key={i} className="my-1 h-3 w-3" />
                            ))}
                        </div>
                        <div className="grid grid-cols-7 justify-items-center gap-y-1">
                            {Array.from({ length: 42 }, (_, i) => (
                                <div
                                    key={i}
                                    className="flex size-9 max-[360px]:size-8 sm:size-10 items-center justify-center"
                                >
                                    <Skeleton className="size-5" />
                                </div>
                            ))}
                        </div>
                        <Skeleton className="mx-auto mt-4 h-4 w-48" />
                    </div>
                    <div className="mt-5 h-96 space-y-3 border-t border-[hsl(var(--border))] pt-4 sm:mt-0 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                        <Skeleton className="mb-4 h-5 w-32" />
                        {Array.from({ length: 4 }, (_, i) => (
                            <Skeleton key={i} className="h-11 w-full" />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

type PageLayout = "page" | "login" | "register" | "dashboard" | "booking" | "confirmation" | "onboarding";

export function PageLoading({
    label = "Opening your page…",
    layout = "page",
}: {
    label?: string;
    layout?: PageLayout;
}) {
    if (layout === "login" || layout === "register") {
        return (
            <AuthShell
                title={layout === "login" ? "Welcome back." : "Make time for your clients."}
                description={
                    layout === "login"
                        ? "Sign in to manage your bookings and join your sessions."
                        : "Create your free account. Next, we’ll set up your booking page and availability."
                }
            >
                <div role="status" aria-busy="true" className="mt-6 space-y-4">
                    <span className="sr-only">{label}</span>
                    {Array.from({ length: layout === "login" ? 2 : 4 }, (_, i) => (
                        <div key={i} className={cn("grid gap-4", layout === "register" && i === 0 && "sm:grid-cols-2")}>
                            {Array.from({ length: layout === "register" && i === 0 ? 2 : 1 }, (_, field) => (
                                <div key={field} className="space-y-2">
                                    <Skeleton className="h-3 w-20" />
                                    <Skeleton className="h-11 w-full" />
                                </div>
                            ))}
                        </div>
                    ))}
                    <Skeleton className="h-11 w-full" />
                    <Skeleton className="mx-auto h-4 w-48" />
                </div>
            </AuthShell>
        );
    }
    if (layout === "onboarding") {
        return (
            <main className="flex min-h-dvh items-center justify-center px-4 py-16">
                <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
                    <ThemeToggleButton />
                </div>
                <div role="status" aria-busy="true" className="experience-card w-full max-w-lg p-6 sm:p-8">
                    <span className="sr-only">{label}</span>
                    <Skeleton className="mx-auto mb-3 h-3 w-40" />
                    <div className="mb-8 flex justify-center gap-2">
                        {Array.from({ length: 5 }, (_, i) => (
                            <Skeleton key={i} className="h-2 w-6 rounded-full" />
                        ))}
                    </div>
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="mb-7 mt-3 h-4 w-full" />
                    <div className="space-y-5 rounded-2xl border border-[hsl(var(--border))] p-5">
                        {Array.from({ length: 3 }, (_, i) => (
                            <div key={i} className="space-y-2">
                                <Skeleton className="h-3 w-24" />
                                <Skeleton className="h-11 w-full" />
                            </div>
                        ))}
                    </div>
                    <Skeleton className="mt-4 h-10 w-full" />
                </div>
            </main>
        );
    }
    if (layout === "dashboard") {
        return (
            <div role="status" aria-busy="true" className="min-h-dvh lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
                <span className="sr-only">{label}</span>
                <aside aria-hidden="true" className="hidden border-r border-[hsl(var(--border))] p-6 lg:block">
                    <Skeleton className="mb-8 h-6 w-28" />
                    <Skeleton className="mb-8 h-14 w-full" />
                    <div className="space-y-5">
                        {Array.from({ length: 6 }, (_, i) => (
                            <Skeleton key={i} className="h-8 w-full" />
                        ))}
                    </div>
                </aside>
                <main className="p-4 sm:p-6 lg:p-8">
                    <div className="mb-8 space-y-4">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-8 w-48" />
                        <Skeleton className="h-4 w-80 max-w-full" />
                    </div>
                    <LoadingContent label={label} />
                </main>
            </div>
        );
    }
    return (
        <main
            className={cn(
                "mx-auto flex min-h-dvh flex-col items-center px-4 py-6 sm:px-6 sm:py-12",
                layout === "booking" ? "max-w-[1200px]" : "max-w-3xl",
            )}
        >
            <StandaloneHeader className={layout === "booking" ? "max-w-6xl" : undefined} />
            {layout === "booking" ? (
                <BookingLoadingContent />
            ) : layout === "page" ? (
                <div
                    role="status"
                    className="flex items-center gap-3 py-16 text-sm text-[hsl(var(--muted-foreground))]"
                >
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    {label}
                </div>
            ) : (
                <div role="status" aria-busy="true" className="experience-card w-full max-w-md space-y-5 p-8">
                    <span className="sr-only">{label}</span>
                    <Skeleton className="size-14 rounded-2xl" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-8 w-3/4" />
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-11 w-full" />
                </div>
            )}
        </main>
    );
}
