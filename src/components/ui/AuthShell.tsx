import type { ReactNode } from "react";
import { CalendarDays, Video, ArrowRight } from "lucide-react";
import { StandaloneHeader } from "@/src/components/ui/StandaloneHeader";

export function AuthShell({
    title,
    description,
    children,
}: {
    title: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <main className="mx-auto min-h-dvh max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
            <StandaloneHeader className="max-w-none" />
            <div className="grid items-center gap-12 pb-12 pt-4 lg:grid-cols-2 lg:gap-24 lg:pt-10">
                <aside className="hidden lg:block">
                    <p className="label-caps">Your sessions, in one place</p>
                    <h2 className="font-display mt-6 text-5xl leading-tight">
                        A time to meet.
                        <br />
                        <span className="text-[hsl(var(--primary))]">A place to connect.</span>
                    </h2>
                    <p className="mt-6 max-w-sm text-base leading-7 text-[hsl(var(--muted-foreground))]">
                        A personal booking page and a video room for every session. Spend less time arranging, and more
                        time with your clients.
                    </p>
                    <div className="mt-8 inline-flex items-center gap-4 rounded-2xl bg-[hsl(var(--success-soft))] p-5 text-sm text-[hsl(var(--success-soft-foreground))]">
                        <CalendarDays className="size-5" /> Book a time <ArrowRight className="size-4" />
                        <Video className="size-5" /> Meet here
                    </div>
                </aside>
                <div className="experience-card page-enter mx-auto w-full max-w-md p-6 sm:p-8">
                    <h1 className="font-display text-3xl sm:text-4xl">{title}</h1>
                    <p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{description}</p>
                    {children}
                </div>
            </div>
        </main>
    );
}
