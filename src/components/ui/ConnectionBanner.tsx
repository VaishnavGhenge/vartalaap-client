"use client";

import { Loader2 } from "lucide-react";
import type { ConnState } from "@/src/services/signaling/client";
import { Button } from "@/src/components/ui/button";

interface ConnectionBannerProps {
    connState: ConnState;
    reconnectAttempt: number;
    onLeave: () => void;
}

export function ConnectionBanner({ connState, reconnectAttempt, onLeave }: ConnectionBannerProps) {
    const recovering = connState === "reconnecting" || connState === "failed";
    const connecting = connState === "connecting";
    return (
        <div className="flex min-h-11 shrink-0 items-center justify-center px-3">
            <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"
            >
                {(recovering || connecting) && <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />}
                <span>
                    {recovering
                        ? "Connection interrupted. Trying to reconnect…"
                        : connecting
                          ? "Connecting to your call…"
                          : ""}
                </span>
                {recovering && <span className="sr-only">Attempt {reconnectAttempt}</span>}
                {connState === "failed" && (
                    <Button variant="ghost" size="sm" onClick={onLeave}>
                        Leave call
                    </Button>
                )}
            </div>
        </div>
    );
}
