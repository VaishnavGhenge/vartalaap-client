"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, WifiOff } from "lucide-react";
import type { ConnState } from "@/src/services/signaling/client";

const MAX_ATTEMPTS = 5
const AUTO_LEAVE_S = 5

interface ConnectionBannerProps {
    connState: ConnState;
    reconnectAttempt: number;
    onLeave: () => void;
}

export function ConnectionBanner({ connState, reconnectAttempt, onLeave }: ConnectionBannerProps) {
    const [countdown, setCountdown] = useState(AUTO_LEAVE_S);
    const hasAutoLeftRef = useRef(false);
    const onLeaveRef = useRef(onLeave);

    useEffect(() => {
        onLeaveRef.current = onLeave;
    }, [onLeave]);

    // Countdown + auto-leave when failed
    useEffect(() => {
        hasAutoLeftRef.current = false;
        if (connState !== 'failed') {
            setCountdown(AUTO_LEAVE_S);
            return;
        }

        const interval = setInterval(() => {
            setCountdown((s) => Math.max(s - 1, 0))
        }, 1000)
        return () => clearInterval(interval)
    }, [connState])

    useEffect(() => {
        if (connState !== 'failed' || countdown !== 0 || hasAutoLeftRef.current) {
            return;
        }

        hasAutoLeftRef.current = true;
        onLeaveRef.current();
    }, [connState, countdown]);

    if (connState === 'reconnecting') {
        return (
            <div
                role="status"
                aria-live="polite"
                className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2
                            py-2 px-4 bg-amber-500/90 backdrop-blur-sm text-white text-sm font-medium"
            >
                <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
                <span>Reconnecting… ({reconnectAttempt} of {MAX_ATTEMPTS})</span>
            </div>
        )
    }

    if (connState === 'failed') {
        return (
            <div
                role="alertdialog"
                aria-modal="true"
                aria-label="Connection lost"
                className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5
                            bg-black/80 backdrop-blur-sm text-white"
            >
                <WifiOff className="w-14 h-14 text-red-400" aria-hidden="true" />
                <div className="text-center space-y-1">
                    <p className="text-xl font-semibold">Connection lost</p>
                    <p className="text-sm text-white/60" aria-live="polite" aria-atomic="true">
                        Leaving call in {countdown}s…
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onLeave}
                    className="cursor-pointer px-5 py-2 rounded-full bg-white/10 hover:bg-white/20
                               border border-white/20 text-sm font-medium transition-colors
                               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                    Leave now
                </button>
            </div>
        )
    }

    return null
}
