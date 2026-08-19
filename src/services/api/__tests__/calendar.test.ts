import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
    calendarCallbackMessage,
    disconnectCalendar,
    getCalendarStatus,
    startCalendarConnect,
} from '../calendar'
import { setAccessToken } from '../token'

function okJson(body: unknown) {
    return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve(body),
    }
}

describe('calendar API', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        setAccessToken('test-token')
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        setAccessToken(null)
    })

    it('reads connection status', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson({
            provider: 'google', connected: true, needsReconnect: false,
            accountEmail: 'host@gmail.com', available: true,
        })))

        const status = await getCalendarStatus()

        expect(status.connected).toBe(true)
        expect(status.accountEmail).toBe('host@gmail.com')
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/me/calendar/status'),
            expect.objectContaining({ method: 'GET' }),
        )
    })

    // A revoked grant is connected=false AND needsReconnect=true. Collapsing
    // the two would show a host "Connect" when their sync has silently stopped.
    it('distinguishes revoked from never-connected', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson({
            provider: 'google', connected: false, needsReconnect: true,
            lastError: 'google revoked access', available: true,
        })))

        const status = await getCalendarStatus()

        expect(status.connected).toBe(false)
        expect(status.needsReconnect).toBe(true)
    })

    it('returns the consent URL for the caller to navigate to', async () => {
        const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?state=abc'
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson({ authUrl })))

        await expect(startCalendarConnect()).resolves.toBe(authUrl)
    })

    it('disconnects on a 204', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true, status: 204, headers: { get: () => null },
        }))

        await expect(disconnectCalendar()).resolves.toBeUndefined()
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/me/calendar/disconnect'),
            expect.objectContaining({ method: 'DELETE' }),
        )
    })
})

describe('calendarCallbackMessage', () => {
    it('maps every outcome the server can send', () => {
        for (const code of ['connected', 'denied', 'invalid_callback', 'connect_failed']) {
            const msg = calendarCallbackMessage(code)
            expect(msg, `missing message for ${code}`).not.toBeNull()
            expect(msg!.text.length).toBeGreaterThan(0)
        }
    })

    it('marks success as info and every failure as a warning', () => {
        expect(calendarCallbackMessage('connected')!.tone).toBe('info')
        expect(calendarCallbackMessage('denied')!.tone).toBe('warning')
        expect(calendarCallbackMessage('connect_failed')!.tone).toBe('warning')
    })

    it('ignores an absent or unrecognised code rather than inventing a banner', () => {
        expect(calendarCallbackMessage(null)).toBeNull()
        expect(calendarCallbackMessage('')).toBeNull()
        expect(calendarCallbackMessage('something-else')).toBeNull()
    })
})
