"use client";

import { Clock } from "lucide-react";
import { Button } from "@/src/components/ui/button";

interface KnockingScreenProps {
    onCancel: () => void;
}

// Shown to guests after they click Join but before the host admits them.
// Rendered in place of MeetCall — the room grid (peers, names, controls)
// must not be visible while the guest is unauthorized.
export default function KnockingScreen({ onCancel }: KnockingScreenProps) {
    return (
        <div className="flex flex-1 items-center justify-center bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
            <div className="flex flex-col items-center gap-6 px-6 py-10 text-center max-w-sm w-full">
                <div className="relative flex size-16 items-center justify-center rounded-full border-2 border-[hsl(var(--border))] bg-[hsl(var(--surface-2))]">
                    <Clock className="w-7 h-7 text-[hsl(var(--primary))]" />
                    <span className="absolute inset-0 rounded-full border-2 border-[hsl(var(--primary))]/30 animate-ping" />
                </div>
                <div className="space-y-1.5">
                    <p className="text-base font-semibold">Waiting to be let in</p>
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">
                        The host has been notified and will admit you shortly.
                    </p>
                </div>
                <div className="flex items-center gap-1.5" aria-hidden="true">
                    {[0, 1, 2].map(i => (
                        <span
                            key={i}
                            className="size-1.5 rounded-full bg-[hsl(var(--muted-foreground))]/60"
                            style={{ animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite` }}
                        />
                    ))}
                </div>
                <Button variant="outline" onClick={onCancel} className="mt-2">
                    Cancel
                </Button>
            </div>
        </div>
    );
}
