import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// IMPORTANT: mock the API module BEFORE importing the hook so the hook
// captures our spies, not the real fetch wrappers.
vi.mock('@/src/services/api/public', () => {
    class PublicApiError extends Error {
        constructor(public status: number, public code: string, message: string) {
            super(message)
        }
    }
    return {
        PublicApiError,
        createSlotHold: vi.fn(),
        releaseSlotHold: vi.fn(),
        releaseSlotHoldKeepalive: vi.fn(),
    }
})

import {
    PublicApiError,
    createSlotHold,
    releaseSlotHold,
    releaseSlotHoldKeepalive,
} from '@/src/services/api/public'
import { useSlotHold } from '../use-slot-hold'

const mocked = {
    createSlotHold: vi.mocked(createSlotHold),
    releaseSlotHold: vi.mocked(releaseSlotHold),
    releaseSlotHoldKeepalive: vi.mocked(releaseSlotHoldKeepalive),
}

beforeEach(() => {
    mocked.createSlotHold.mockReset()
    mocked.releaseSlotHold.mockReset()
    mocked.releaseSlotHoldKeepalive.mockReset()
    // Default safe stub — releaseSlotHold is "best-effort" in the hook, but
    // an unhandled rejection from vi.mocked would still crash some specs.
    mocked.releaseSlotHold.mockResolvedValue()
})

afterEach(() => {
    vi.restoreAllMocks()
})

// useSlotHold owns a multi-step state machine that the booking page depends
// on: pick → hold → re-pick → release-old → hold-new → submit (consume) or
// abandon (keepalive DELETE). Each test below pins one observable property
// of that machine.

const HOST = 'alice'
const EVENT = 'intro'
const SLOT_A = '2026-06-01T09:00:00.000Z'
const SLOT_B = '2026-06-01T09:30:00.000Z'

function render() {
    return renderHook(() => useSlotHold({ hostSlug: HOST, eventTypeSlug: EVENT }))
}

// Happy path: select a slot, hook calls createSlotHold with the right input
// and exposes the returned token. Without this the booking submit can't
// reference the hold and the slot races with other guests.
it('selectSlot stores the returned hold token', async () => {
    mocked.createSlotHold.mockResolvedValue({
        holdToken: 'tok-a',
        expiresAt: '2026-06-01T09:05:00.000Z',
    })

    const { result } = render()
    await act(async () => {
        await result.current.selectSlot(SLOT_A)
    })

    expect(mocked.createSlotHold).toHaveBeenCalledWith({
        hostSlug: HOST,
        eventTypeSlug: EVENT,
        startsAt: SLOT_A,
    })
    expect(result.current.selectedSlot).toBe(SLOT_A)
    expect(result.current.holdToken).toBe('tok-a')
    expect(result.current.holdError).toBeNull()
})

// Switching slots must DELETE the previous hold so it doesn't sit until TTL
// blocking another guest. The release fires BEFORE awaiting the new POST so
// the freeing is concurrent with the new request.
it('switching slots releases the previous hold', async () => {
    mocked.createSlotHold
        .mockResolvedValueOnce({ holdToken: 'tok-a', expiresAt: 'x' })
        .mockResolvedValueOnce({ holdToken: 'tok-b', expiresAt: 'x' })

    const { result } = render()
    await act(async () => {
        await result.current.selectSlot(SLOT_A)
    })
    expect(result.current.holdToken).toBe('tok-a')

    await act(async () => {
        await result.current.selectSlot(SLOT_B)
    })

    expect(mocked.releaseSlotHold).toHaveBeenCalledWith('tok-a')
    expect(result.current.selectedSlot).toBe(SLOT_B)
    expect(result.current.holdToken).toBe('tok-b')
})

// The race the hook explicitly comments about: user picks A, then picks B
// while A's POST is still pending. When A finally returns, its hold must be
// released (not adopted) and the state must reflect B.
//
// If this regresses, the user sees their selected slot suddenly flip back
// to the old one when the slow request lands, AND two holds sit on the
// server waiting for TTL — both visible bugs.
it('a hold that returns after the user has moved on is released, not adopted', async () => {
    let resolveA: (v: { holdToken: string; expiresAt: string }) => void = () => {}
    let resolveB: (v: { holdToken: string; expiresAt: string }) => void = () => {}
    mocked.createSlotHold
        .mockImplementationOnce(() => new Promise(r => { resolveA = r }))
        .mockImplementationOnce(() => new Promise(r => { resolveB = r }))

    const { result } = render()
    // Fire both selectSlot calls without awaiting either.
    let aPromise!: Promise<void>
    let bPromise!: Promise<void>
    act(() => {
        aPromise = result.current.selectSlot(SLOT_A)
    })
    act(() => {
        bPromise = result.current.selectSlot(SLOT_B)
    })

    // Resolve B first (it was started after A but finishes first — totally
    // possible with a flaky network). Then resolve A — the "late winner".
    resolveB({ holdToken: 'tok-b', expiresAt: 'x' })
    await act(async () => { await bPromise })

    expect(result.current.selectedSlot).toBe(SLOT_B)
    expect(result.current.holdToken).toBe('tok-b')

    resolveA({ holdToken: 'tok-a-late', expiresAt: 'x' })
    await act(async () => { await aPromise })

    // After the dust settles: state still reflects B, A's token has been
    // released, B's token is untouched.
    expect(result.current.selectedSlot).toBe(SLOT_B)
    expect(result.current.holdToken).toBe('tok-b')
    expect(mocked.releaseSlotHold).toHaveBeenCalledWith('tok-a-late')
})

// SLOT_TAKEN is the most common failure (someone beat the user to the slot).
// The picker needs a specific, actionable message; surfacing the generic
// "Couldn't reserve this slot" loses that affordance.
it('surfaces a friendly message when the slot was taken', async () => {
    mocked.createSlotHold.mockRejectedValue(
        new PublicApiError(409, 'SLOT_TAKEN', 'conflict'),
    )

    const { result } = render()
    await act(async () => {
        await result.current.selectSlot(SLOT_A)
    })

    expect(result.current.holdError).toMatch(/no longer available/i)
    expect(result.current.holdToken).toBeNull()
    // selectedSlot stays set so the picker keeps the visual highlight; the
    // submit button is disabled because holdToken is null.
    expect(result.current.selectedSlot).toBe(SLOT_A)
})

// Any non-SLOT_TAKEN error must still surface SOMETHING — silent failures
// leave the user with no idea why the booking submit is disabled.
it('surfaces a generic message on non-SLOT_TAKEN errors', async () => {
    mocked.createSlotHold.mockRejectedValue(new Error('network down'))

    const { result } = render()
    await act(async () => {
        await result.current.selectSlot(SLOT_A)
    })

    expect(result.current.holdError).toBeTruthy()
    expect(result.current.holdError).not.toMatch(/no longer available/i)
    expect(result.current.holdToken).toBeNull()
})

// consumeHold is the booking-submit path: the booking POST will reference
// the token, and the server deletes the hold row on success. The hook must
// NOT also fire DELETE — that would race and 404 either the booking conflict
// check or the cleanup. Both observable consequences (server warns or
// booking fails) are visible bugs.
it('consumeHold returns the token and does NOT issue a DELETE', async () => {
    mocked.createSlotHold.mockResolvedValue({ holdToken: 'tok-a', expiresAt: 'x' })

    const { result } = render()
    await act(async () => {
        await result.current.selectSlot(SLOT_A)
    })

    mocked.releaseSlotHold.mockClear()
    mocked.releaseSlotHoldKeepalive.mockClear()

    let token: string | null = null
    act(() => {
        token = result.current.consumeHold()
    })

    expect(token).toBe('tok-a')
    expect(mocked.releaseSlotHold).not.toHaveBeenCalled()
    expect(mocked.releaseSlotHoldKeepalive).not.toHaveBeenCalled()
    expect(result.current.holdToken).toBeNull()
    expect(result.current.selectedSlot).toBeNull()
})

// selectSlot(null) is the explicit deselect. It must DELETE the current
// hold and reset state so the picker shows nothing selected.
it('selectSlot(null) releases the current hold and clears state', async () => {
    mocked.createSlotHold.mockResolvedValue({ holdToken: 'tok-a', expiresAt: 'x' })

    const { result } = render()
    await act(async () => {
        await result.current.selectSlot(SLOT_A)
    })

    await act(async () => {
        await result.current.selectSlot(null)
    })

    expect(mocked.releaseSlotHold).toHaveBeenCalledWith('tok-a')
    expect(result.current.selectedSlot).toBeNull()
    expect(result.current.holdToken).toBeNull()
    expect(result.current.holdError).toBeNull()
})

// Re-selecting a slot that's already held must be a no-op. Without the
// debounce, every click on the highlighted slot would issue a release+create
// cycle, briefly flashing the slot as unavailable to other guests.
it('re-selecting the currently-held slot is a no-op', async () => {
    mocked.createSlotHold.mockResolvedValue({ holdToken: 'tok-a', expiresAt: 'x' })

    const { result } = render()
    await act(async () => {
        await result.current.selectSlot(SLOT_A)
    })
    mocked.createSlotHold.mockClear()
    mocked.releaseSlotHold.mockClear()

    await act(async () => {
        await result.current.selectSlot(SLOT_A)
    })

    expect(mocked.createSlotHold).not.toHaveBeenCalled()
    expect(mocked.releaseSlotHold).not.toHaveBeenCalled()
})

// Re-selecting a slot whose POST hasn't returned yet is also a no-op (the
// in-flight `pendingSlotRef` check). Without this, a double-click would
// fire two POSTs and leak the first hold.
it('re-selecting the pending slot is a no-op (no duplicate POST)', async () => {
    let resolveA: (v: { holdToken: string; expiresAt: string }) => void = () => {}
    mocked.createSlotHold.mockImplementationOnce(() => new Promise(r => { resolveA = r }))

    const { result } = render()
    let firstPromise!: Promise<void>
    act(() => {
        firstPromise = result.current.selectSlot(SLOT_A)
    })

    // Second click before the first resolves.
    act(() => {
        void result.current.selectSlot(SLOT_A)
    })

    // Only one POST went out.
    expect(mocked.createSlotHold).toHaveBeenCalledTimes(1)

    // Resolve the in-flight POST so the hook settles cleanly.
    resolveA({ holdToken: 'tok-a', expiresAt: 'x' })
    await act(async () => { await firstPromise })
})

// pagehide is the unmount-safe DELETE for tab close / navigation. The hook
// must use the keepalive variant — a regular fetch() can be cancelled by
// the browser during page transition, leaving the slot held until TTL.
it('pagehide fires the keepalive DELETE', async () => {
    mocked.createSlotHold.mockResolvedValue({ holdToken: 'tok-a', expiresAt: 'x' })

    const { result } = render()
    await act(async () => {
        await result.current.selectSlot(SLOT_A)
    })

    mocked.releaseSlotHoldKeepalive.mockClear()
    act(() => {
        window.dispatchEvent(new Event('pagehide'))
    })

    await waitFor(() => {
        expect(mocked.releaseSlotHoldKeepalive).toHaveBeenCalledWith('tok-a')
    })
})

// Unmount (e.g. SPA route change) must also fire the keepalive DELETE.
// pagehide and unmount don't always both fire — SPA navigations within the
// same document don't trigger pagehide — so both paths matter.
it('unmount fires the keepalive DELETE', async () => {
    mocked.createSlotHold.mockResolvedValue({ holdToken: 'tok-a', expiresAt: 'x' })

    const { result, unmount } = render()
    await act(async () => {
        await result.current.selectSlot(SLOT_A)
    })

    mocked.releaseSlotHoldKeepalive.mockClear()
    unmount()
    expect(mocked.releaseSlotHoldKeepalive).toHaveBeenCalledWith('tok-a')
})

// If the user never selected a slot, the pagehide/unmount cleanup must NOT
// fire a DELETE for null — a defensive check the hook does inline. Tests
// the negative half of the cleanup.
it('pagehide with no active hold does nothing', () => {
    const { unmount } = render()
    act(() => {
        window.dispatchEvent(new Event('pagehide'))
    })
    unmount()
    expect(mocked.releaseSlotHoldKeepalive).not.toHaveBeenCalled()
})
