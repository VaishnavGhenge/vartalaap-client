"use client";

import * as Sentry from "@sentry/nextjs";
import { PhoneOff, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MeetError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const router = useRouter();

    useEffect(() => {
        Sentry.captureException(error);
    }, [error]);

    return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
            <p className="text-sm font-medium">Something went wrong in the call</p>
            {error.digest && (
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Reference: {error.digest}
                </p>
            )}
            <div className="flex gap-3">
                <button
                    type="button"
                    onClick={reset}
                    className="ctrl-btn ctrl-btn-on flex items-center gap-2 px-4 py-2 text-sm"
                >
                    <RefreshCw className="h-4 w-4" />
                    Try again
                </button>
                <button
                    type="button"
                    onClick={() => router.push("/")}
                    className="ctrl-btn ctrl-btn-off flex items-center gap-2 px-4 py-2 text-sm"
                >
                    <PhoneOff className="h-4 w-4" />
                    Leave call
                </button>
            </div>
        </div>
    );
}
