"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarSync, Check, ExternalLink, Unplug } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { BufferingButtonLabel } from "@/src/components/ui/BufferingButtonLabel";
import { ConfirmDialog } from "@/src/components/ui/ConfirmDialog";
import { InlineNotice } from "@/src/components/ui/InlineNotice";
import {
    disconnectCalendar,
    getCalendarStatus,
    startCalendarConnect,
    type CalendarStatus,
} from "@/src/services/api/calendar";

interface Props {
    /** Bumped by the parent after an OAuth return so the card refetches. */
    refreshKey?: number;
    onChange?: () => void;
}

function formatSyncedAt(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Google Calendar connection state and controls.
 *
 * Lives in the Availability panel because that is where a host reasons about
 * their time: the only thing this connection does is remove busy hours from
 * the slots guests can pick.
 */
export function CalendarSyncCard({ refreshKey = 0, onChange }: Props) {
    const [status, setStatus] = useState<CalendarStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmDisconnect, setConfirmDisconnect] = useState(false);

    const load = useCallback(async () => {
        try {
            setStatus(await getCalendarStatus());
            setError(null);
        } catch {
            // A failed status read is not worth an error banner on a panel the
            // host opened to edit their hours. Hide the card and let the next
            // load try again.
            setStatus(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load, refreshKey]);

    const connect = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            // Full navigation, not a popup: popups get blocked, and the OAuth
            // callback returns to the dashboard anyway.
            window.location.href = await startCalendarConnect();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not start the connection.");
            setBusy(false);
        }
    }, []);

    const disconnect = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            await disconnectCalendar();
            await load();
            onChange?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not disconnect.");
        } finally {
            setBusy(false);
            setConfirmDisconnect(false);
        }
    }, [load, onChange]);

    // Nothing to show while loading, and nothing to offer when the server has
    // no Google credentials — an unusable button is worse than no button.
    if (loading || !status || !status.available) return null;

    const connected = status.connected;

    return (
        <div className="rounded-xl border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface-2))]/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary))]/10">
                        <CalendarSync className="size-4 text-[hsl(var(--primary))]" />
                    </span>
                    <div className="min-w-0">
                        <p className="font-semibold text-[hsl(var(--foreground))]">Google Calendar</p>
                        <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
                            {connected
                                ? "Busy times are hidden from your booking page, and confirmed sessions are added to your calendar."
                                : "Connect your calendar so guests can't book over meetings you already have."}
                        </p>
                        {connected && status.accountEmail && (
                            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                                <Check className="size-3 text-[hsl(var(--primary))]" />
                                {status.accountEmail}
                                {status.lastSyncedAt && (
                                    <span className="opacity-70">· last synced {formatSyncedAt(status.lastSyncedAt)}</span>
                                )}
                            </p>
                        )}
                    </div>
                </div>

                <div className="shrink-0">
                    {connected ? (
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => setConfirmDisconnect(true)}
                        >
                            <Unplug className="mr-1.5 size-3.5" />
                            Disconnect
                        </Button>
                    ) : (
                        <Button size="sm" disabled={busy} onClick={() => void connect()}>
                            {busy ? (
                                <BufferingButtonLabel label="Opening Google..." />
                            ) : (
                                <>
                                    <ExternalLink className="mr-1.5 size-3.5" />
                                    {status.needsReconnect ? "Reconnect" : "Connect"}
                                </>
                            )}
                        </Button>
                    )}
                </div>
            </div>

            {/* A revoked grant is the failure a host would otherwise never
                notice: bookings keep arriving, they just stop being checked
                against the real calendar. Say so explicitly. */}
            {status.needsReconnect && (
                <InlineNotice tone="warning" title="Calendar sync has stopped" className="mt-3">
                    Google revoked access, so your booking page is no longer checking this calendar.
                    Guests can book over meetings you already have until you reconnect.
                </InlineNotice>
            )}

            {!status.needsReconnect && status.lastError && (
                <InlineNotice tone="warning" title="Last sync failed" className="mt-3">
                    {status.lastError}
                </InlineNotice>
            )}

            {error && (
                <InlineNotice tone="danger" className="mt-3">
                    {error}
                </InlineNotice>
            )}

            <ConfirmDialog
                open={confirmDisconnect}
                title="Disconnect Google Calendar?"
                description="Your booking page will stop checking this calendar, so guests will be able to book over meetings you already have. Sessions already added to your calendar stay there."
                confirmLabel="Disconnect"
                loadingLabel="Disconnecting..."
                destructive
                pending={busy}
                onConfirm={() => void disconnect()}
                onOpenChange={(open) => setConfirmDisconnect(open)}
            />
        </div>
    );
}
