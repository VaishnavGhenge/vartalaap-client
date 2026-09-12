import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// refreshSession is the only auth.ts dependency — mocked so tests control
// whether the "server" renews the session. The token module is real: the
// keepalive's rescheduling runs off its change notifications, which is
// exactly the behavior under test.
const { refreshMock, guestRefreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn(), guestRefreshMock: vi.fn() }))
vi.mock('../auth', () => ({ refreshSession: refreshMock }))
vi.mock('../guest-refresh', () => ({ refreshGuestSession: guestRefreshMock }))

import { startSessionKeepalive, jwtExpiryMs } from '../session-keepalive'
import { setAccessToken, setRoomToken } from '../token'

function fakeJwt(expSecondsFromNow: number): string {
    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expSecondsFromNow }))
    return `header.${payload}.sig`
}

beforeEach(() => {
    vi.useFakeTimers()
    refreshMock.mockReset()
    guestRefreshMock.mockReset()
    setAccessToken(null)
    setRoomToken(null)
})

afterEach(() => {
    vi.useRealTimers()
})

describe('jwtExpiryMs', () => {
    it('decodes exp from a JWT payload', () => {
        const token = fakeJwt(900)
        const exp = jwtExpiryMs(token)
        expect(exp).not.toBeNull()
        expect(exp! - Date.now()).toBeGreaterThan(890_000)
    })

    it('returns null for garbage', () => {
        expect(jwtExpiryMs('not-a-jwt')).toBeNull()
        expect(jwtExpiryMs('a.b.c')).toBeNull()
    })
})

describe('startSessionKeepalive', () => {
    it('retries transient refresh failures without declaring the session dead', async () => {
        setAccessToken(fakeJwt(30))
        refreshMock.mockRejectedValueOnce(new Error('offline')).mockImplementation(async () => {
            setAccessToken(fakeJwt(900))
            return { accessToken: 'new', user: {} }
        })
        const dead = vi.fn()
        const stop = startSessionKeepalive({ onSessionDead: dead })
        await vi.advanceTimersByTimeAsync(5_000)
        expect(refreshMock).toHaveBeenCalledTimes(2)
        expect(dead).not.toHaveBeenCalled()
        stop()
    })
    it('refreshes shortly before the token expires and reschedules on the new token', async () => {
        setAccessToken(fakeJwt(900)) // 15 min
        // Successful refresh: the real auth.ts sets the new token, which is
        // what re-anchors the schedule — simulate that.
        refreshMock.mockImplementation(async () => {
            setAccessToken(fakeJwt(900))
            return { accessToken: 'x', user: {} }
        })
        const onSessionDead = vi.fn()
        const stop = startSessionKeepalive({ onSessionDead })

        // 60s lead: nothing at 13 min, refresh by 14 min.
        await vi.advanceTimersByTimeAsync(13 * 60_000)
        expect(refreshMock).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(2 * 60_000)
        expect(refreshMock).toHaveBeenCalledTimes(1)

        // The renewed token schedules the NEXT refresh — proves the loop.
        await vi.advanceTimersByTimeAsync(15 * 60_000)
        expect(refreshMock).toHaveBeenCalledTimes(2)
        expect(onSessionDead).not.toHaveBeenCalled()
        stop()
    })

    it('fires onSessionDead exactly once when refresh fails', async () => {
        setAccessToken(fakeJwt(30)) // already inside the refresh lead → immediate
        refreshMock.mockImplementation(async () => {
            setAccessToken(null) // real auth.ts clears the token on failure
            return null
        })
        const onSessionDead = vi.fn()
        const stop = startSessionKeepalive({ onSessionDead })

        await vi.advanceTimersByTimeAsync(1_000)
        expect(refreshMock).toHaveBeenCalledTimes(1)
        expect(onSessionDead).toHaveBeenCalledTimes(1)

        // Cleared token → no further schedule, no repeat notification.
        await vi.advanceTimersByTimeAsync(60 * 60_000)
        expect(onSessionDead).toHaveBeenCalledTimes(1)
        stop()
    })

    it('refreshes a guest room token before expiry and reschedules', async () => {
        setRoomToken(fakeJwt(2 * 60 * 60))
        guestRefreshMock.mockImplementation(async () => {
            setRoomToken(fakeJwt(2 * 60 * 60))
            return true
        })
        const onSessionDead = vi.fn()
        const stop = startSessionKeepalive({ onSessionDead })
        await vi.advanceTimersByTimeAsync(119 * 60_000)
        expect(refreshMock).not.toHaveBeenCalled()
        expect(guestRefreshMock).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(120 * 60_000)
        expect(guestRefreshMock).toHaveBeenCalledTimes(2)
        expect(onSessionDead).not.toHaveBeenCalled()
        stop()
    })

    it('stop() cancels the pending refresh', async () => {
        setAccessToken(fakeJwt(900))
        const stop = startSessionKeepalive({ onSessionDead: vi.fn() })
        stop()
        await vi.advanceTimersByTimeAsync(20 * 60_000)
        expect(refreshMock).not.toHaveBeenCalled()
    })
})
