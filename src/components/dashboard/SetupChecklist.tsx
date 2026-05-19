"use client";

import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";

import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";

export interface SetupState {
    profile: boolean;
    availability: boolean;
    eventType: boolean;
}

interface Props {
    state: SetupState;
}

// One-glance checklist of what's still needed for the host's first booking
// flow to work end-to-end. Each row points at the panel that fixes the gap so
// the user never has to read the docs to know "what's next?"
export function SetupChecklist({ state }: Props) {
    const items: Array<{ key: keyof SetupState; title: string; body: string; href: string }> = [
        {
            key: "profile",
            title: "Claim your booking URL",
            body: "Pick a slug guests will see and use.",
            href: "/onboarding",
        },
        {
            key: "availability",
            title: "Set weekly availability",
            body: "Recurring hours decide which slots guests can pick.",
            href: "/dashboard?panel=availability",
        },
        {
            key: "eventType",
            title: "Publish an event type",
            body: "An event type is the link guests actually book.",
            href: "/dashboard?panel=booking-types",
        },
    ];

    const remaining = items.filter((i) => !state[i.key]);
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
                const done = state[it.key];
                return (
                    <div
                        key={it.key}
                        className={cn(
                            "flex items-center justify-between gap-3 rounded-xl border px-4 py-3",
                            done
                                ? "border-[hsl(var(--border))]/60 bg-[hsl(var(--surface-2))]"
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
