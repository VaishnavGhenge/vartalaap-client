import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchIceServers, startIceServerKeepalive } from '../ice'

describe('fetchIceServers', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it('refreshes TURN credentials before their one-hour lifetime and stops cleanly', async () => {
        vi.useFakeTimers()
        const refreshed = [{ urls: ['turn:turn.example.com'], username: 'fresh', credential: 'fresh-pass' }]
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ iceServers: refreshed }),
        }))
        const onRefresh = vi.fn()
        const stop = startIceServerKeepalive('abc-defg-hij', onRefresh, undefined, 45 * 60_000)

        await vi.advanceTimersByTimeAsync(44 * 60_000)
        expect(fetch).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(60_000)
        expect(onRefresh).toHaveBeenCalledWith(refreshed)

        stop()
        await vi.advanceTimersByTimeAsync(60 * 60_000)
        expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('returns iceServers from a successful response', async () => {
        const servers = [
            { urls: ['stun:stun.example.com'] },
            { urls: ['turn:turn.example.com'], username: 'user', credential: 'pass' },
        ]
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ iceServers: servers }),
        }))

        const result = await fetchIceServers('abc-defg-hij')

        expect(result).toEqual(servers)
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/ice-servers'), expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ roomId: 'abc-defg-hij' }),
        }))
    })

    it('throws when the server returns a non-ok status', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 503,
        }))

        await expect(fetchIceServers('abc-defg-hij')).rejects.toThrow('ice-servers 503')
    })

    it('throws when fetch itself rejects (network error)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))

        await expect(fetchIceServers('abc-defg-hij')).rejects.toThrow('network error')
    })
})
