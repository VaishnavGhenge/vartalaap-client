"use client";

import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";

import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";

export interface SetupState {
    profile: boolean;
    availability: boolean;
    eventType: boolean;
    // Tri-state on purpose. `undefined` means the step does not apply to this
    // deployment (the server has no Google credentials, or we could not ask),
    // and the row is omitted entirely rather than shown as a task the host has
    // no way to complete. `false` means connectable but not connected.
    calendar?: boolean;
}

interface Props {
    state: SetupState;
}

// One-glance checklist of what's still needed for the host's first booking
// flow to work end-to-end. Each row points at the panel that fixes the gap so
// the user never has to read the docs to know "what's next?"
export function SetupChecklist({ state }: Props) {
    const items: Array<{ key: string; title: string; body: string; href: string; done: boolean }> = [
        {
            key: "profile",
            title: "Claim your booking URL",
            body: "Pick a slug guests will see and use.",
            href: "/onboarding",
            done: state.profile,
        },
        {
            key: "availability",
            title: "Set weekly availability",
            body: "Recurring hours decide which slots guests can pick.",
            href: "/dashboard?panel=availability",
            done: state.availability,
        },
        {
            key: "eventType",
            title: "Publish an event type",
            body: "An event type is the link guests actually book.",
            href: "/dashboard?panel=booking-types",
            done: state.eventType,
        },
    ];

    // Last, and only when it applies. The three above are each required before
    // a guest can book at all; connecting a calendar is not, it prevents a
    // specific bad outcome once bookings start arriving.
    if (state.calendar !== undefined) {
        items.push({
            key: "calendar",
            title: "Connect your calendar",
            body: "Guests can't book over meetings you already have.",
            href: "/dashboard?panel=availability",
            done: state.calendar,
        });
    }

    const remaining = items.filter((i) => !i.done);
    if (remaining.length === 0) {
        return (
            <div className="flex items-center gap-3 rounded-xl border border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/5 px-4 py-3">
                <span className="flex size-7 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
                    <Check className="size-3.5" />
                </span>
                <p className="text-sm text-[hsl(var(--foreground))]">
                    Setup complete. Share your link to take bookings.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            {items.map((it) => {
                const done = it.done;
                return (
                    <div
                        key={it.key}
                        className={cn(
                            "flex items-center justify-between gap-3 rounded-xl border px-4 py-3",
                            done
                                ? "border-[hsl(var(--border))] bg-[hsl(var(--surface-2))]"
                                : "border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/5",
                        )}
                    >
                        <div className="flex min-w-0 items-center gap-3">
                            <span
                                className={cn(
                                    "flex size-7 shrink-0 items-center justify-center rounded-full",
                                    done
                                        ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                                        : "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]",
                                )}
                            >
                                {done ? <Check className="size-3.5" /> : <span className="text-[10px] font-bold">{items.indexOf(it) + 1}</span>}
                            </span>
                            <div className="min-w-0">
                                <p className={cn(
                                    "truncate text-sm font-medium",
                                    done ? "text-[hsl(var(--muted-foreground))] line-through" : "text-[hsl(var(--foreground))]",
                                )}>
                                    {it.title}
                                </p>
                                <p className="mt-0.5 truncate text-xs text-[hsl(var(--muted-foreground))]">
                                    {it.body}
                                </p>
                            </div>
                        </div>
                        {!done && (
                            <Button asChild variant="secondary" size="sm">
                                <Link href={it.href}>
                                    Open <ArrowRight className="size-3.5" />
                                </Link>
                            </Button>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
