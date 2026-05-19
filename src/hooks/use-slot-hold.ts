import { useCallback, useEffect, useRef, useState } from "react";

import {
    PublicApiError,
    createSlotHold,
    releaseSlotHold,
    releaseSlotHoldKeepalive,
} from "@/src/services/api/public";

interface Params {
    hostSlug: string;
    eventTypeSlug: string;
}

interface State {
    selectedSlot: string | null;
    holdToken: string | null;
    holdError: string | null;
}

// useSlotHold owns the lifecycle of a slot reservation as the guest picks,
// changes their mind, abandons, or submits. Responsibilities:
//
//   - on selectSlot: release previous hold (best-effort), create a new one
//   - on releaseSelection: explicit release + clear state
//   - on consumeHold: token is being claimed by a booking submission;
//     return it to the caller and drop local state (the server will delete
//     the row when the booking lands)
//   - on unmount or page-hide: keepalive DELETE so the slot frees up without
//     waiting for the 5-minute TTL
//
// Failures during create are surfaced as `holdError` so the picker can
// disable submit and show "this slot was just taken" — the most common
// failure mode is another guest beating this one to the hold.
export function useSlotHold({ hostSlug, eventTypeSlug }: Params) {
    const [state, setState] = useState<State>({
        selectedSlot: null,
        holdToken: null,
        holdError: null,
    });

    // Mirror of holdToken in a ref so the pagehide handler always sees the
    // latest value without re-binding listeners on every state change.
    const holdTokenRef = useRef<string | null>(null);
    const selectedSlotRef = useRef<string | null>(null);
    const pendingSlotRef = useRef<string | null>(null);
    useEffect(() => {
        holdTokenRef.current = state.holdToken;
        selectedSlotRef.current = state.selectedSlot;
    }, [state.holdToken, state.selectedSlot]);

    const selectSlot = useCallback(async (slotISO: string | null) => {
        if (
            slotISO !== null &&
            (pendingSlotRef.current === slotISO ||
                (selectedSlotRef.current === slotISO && holdTokenRef.current))
        ) {
            return;
        }

        // Release the old hold synchronously-from-the-user's-POV by firing
        // the DELETE before awaiting the new POST. The two requests run in
        // parallel; if release fails (network blip), the TTL is the backstop.
        const prev = holdTokenRef.current;
        if (prev) {
            holdTokenRef.current = null;
            releaseSlotHold(prev).catch(() => { /* TTL backstop */ });
        }
        if (slotISO === null) {
            selectedSlotRef.current = null;
            pendingSlotRef.current = null;
            holdTokenRef.current = null;
            setState({ selectedSlot: null, holdToken: null, holdError: null });
            return;
        }
        selectedSlotRef.current = slotISO;
        pendingSlotRef.current = slotISO;
        setState((s) => ({ ...s, selectedSlot: slotISO, holdError: null }));
        try {
            const hold = await createSlotHold({
                hostSlug,
                eventTypeSlug,
                startsAt: slotISO,
            });
            // If the user already picked a different slot while we were
            // awaiting this POST, release the just-created hold and keep
            // the latest selection's token.
            setState((s) => {
                if (s.selectedSlot !== slotISO) {
                    releaseSlotHold(hold.holdToken).catch(() => {});
                    return s;
                }
                holdTokenRef.current = hold.holdToken;
                return { ...s, holdToken: hold.holdToken, holdError: null };
            });
        } catch (err) {
            const msg = err instanceof PublicApiError && err.code === "SLOT_TAKEN"
                ? "That time is no longer available. Pick another."
                : err instanceof Error ? err.message : "Couldn't reserve this slot.";
            if (selectedSlotRef.current === slotISO) {
                holdTokenRef.current = null;
            }
            setState((s) => (
                s.selectedSlot === slotISO
                    ? { ...s, holdToken: null, holdError: msg }
                    : s
            ));
        } finally {
            if (pendingSlotRef.current === slotISO) {
                pendingSlotRef.current = null;
            }
        }
    }, [hostSlug, eventTypeSlug]);

    const consumeHold = useCallback((): string | null => {
        const token = holdTokenRef.current;
        // Clear local state but don't fire DELETE — the booking handler
        // consumes the hold server-side on success.
        holdTokenRef.current = null;
        selectedSlotRef.current = null;
        pendingSlotRef.current = null;
        setState({ selectedSlot: null, holdToken: null, holdError: null });
        return token;
    }, []);

    // Release on unmount + on pagehide (covers tab close, browser back,
    // SPA navigation away). pagehide is more reliable than beforeunload
    // on mobile Safari.
    useEffect(() => {
        const onHide = () => {
            const token = holdTokenRef.current;
            if (token) releaseSlotHoldKeepalive(token);
        };
        window.addEventListener("pagehide", onHide);
        return () => {
            window.removeEventListener("pagehide", onHide);
            const token = holdTokenRef.current;
            if (token) releaseSlotHoldKeepalive(token);
        };
    }, []);

    return {
        selectedSlot: state.selectedSlot,
        holdToken: state.holdToken,
        holdError: state.holdError,
        selectSlot,
        consumeHold,
    };
}
