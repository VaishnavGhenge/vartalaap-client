"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/ConfirmDialog";
import { cancelBookingByMeetCode } from "@/src/services/api/public";

interface Props {
    meetCode: string;
    // Magic-link credential from the confirmation email's `?t=` param.
    // The server rejects DELETE without a matching token, so the button is
    // only rendered when the page was opened via the tokened link.
    cancelToken: string;
}

// Small client island slotted into the otherwise server-rendered /m/[code]
// page. The cancel call is one round-trip; on success we router.refresh()
// so the page re-fetches the booking and re-renders the "Cancelled" state
// without needing client state for the booking itself.
export function CancelBookingButton({ meetCode, cancelToken }: Props) {
    const router = useRouter();
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [reason, setReason] = useState("");

    async function handleCancel() {
        setSubmitting(true);
        setError(null);
        try {
            await cancelBookingByMeetCode(meetCode, cancelToken, reason);
            setConfirming(false);
            router.refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not cancel");
            setSubmitting(false);
        }
    }

    return (
        <>
            <Button
                variant="ghost"
                size="sm"
                className="w-full text-[hsl(var(--muted-foreground))]"
                onClick={() => {
                    setError(null);
                    setReason("");
                    setConfirming(true);
                }}
            >
                Cancel booking
            </Button>
            <ConfirmDialog
                open={confirming}
                title="Cancel booking?"
                description="Both you and the host will be notified."
                reasonLabel="Reason"
                reasonPlaceholder="Share why this booking needs to be cancelled."
                reasonValue={reason}
                reasonRequired
                onReasonChange={setReason}
                confirmLabel="Cancel booking"
                cancelLabel="Keep booking"
                loadingLabel="Cancelling..."
                destructive
                pending={submitting}
                error={error}
                onConfirm={handleCancel}
                onOpenChange={(open) => {
                    if (submitting) return;
                    setConfirming(open);
                    if (!open) {
                        setError(null);
                        setReason("");
                    }
                }}
            />
        </>
    );
}
