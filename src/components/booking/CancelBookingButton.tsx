"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BufferingButtonLabel } from "@/src/components/ui/BufferingButtonLabel";
import { Button } from "@/src/components/ui/button";
import { cancelBookingByMeetCode } from "@/src/services/api/public";

interface Props {
    meetCode: string;
}

// Small client island slotted into the otherwise server-rendered /m/[code]
// page. The cancel call is one round-trip; on success we router.refresh()
// so the page re-fetches the booking and re-renders the "Cancelled" state
// without needing client state for the booking itself.
export function CancelBookingButton({ meetCode }: Props) {
    const router = useRouter();
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);

    async function handleCancel() {
        setSubmitting(true);
        setError(null);
        try {
            await cancelBookingByMeetCode(meetCode);
            router.refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not cancel");
            setSubmitting(false);
        }
    }

    if (!confirming) {
        return (
            <Button
                variant="ghost"
                size="sm"
                className="w-full text-[hsl(var(--muted-foreground))]"
                onClick={() => setConfirming(true)}
            >
                Cancel booking
            </Button>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">
                Cancel this booking? Both you and the host will be notified.
            </p>
            <div className="flex gap-2">
                <Button
                    variant="ghost" size="sm" className="flex-1"
                    onClick={() => setConfirming(false)} disabled={submitting}
                >
                    Keep it
                </Button>
                <Button
                    variant="destructive" size="sm" className="flex-1"
                    onClick={handleCancel} disabled={submitting}
                >
                    {submitting ? <BufferingButtonLabel label="Cancelling…" /> : "Cancel booking"}
                </Button>
            </div>
            {error && <p className="text-center text-xs text-[hsl(var(--destructive))]">{error}</p>}
        </div>
    );
}
