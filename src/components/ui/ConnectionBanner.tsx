"use client";

import { Loader2, WifiOff } from "lucide-react";
import type { ConnState } from "@/src/services/signaling/client";

interface ConnectionBannerProps {
    connState: ConnState;
    reconnectAttempt: number;
    onLeave: () => void;
}

export function ConnectionBanner({ connState, reconnectAttempt, onLeave }: ConnectionBannerProps) {
    if (connState === 'reconnecting') {
        return (
            <div
                role="status"
                aria-live="polite"
                className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2
                            py-2 px-4 bg-amber-500/90 backdrop-blur-sm text-white text-sm font-medium"
            >
                <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
                <span>Reconnecting… (attempt {reconnectAttempt})</span>
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
                    <p className="text-sm text-white/60">
                        Still trying to reconnect. You can wait or leave the call.
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
