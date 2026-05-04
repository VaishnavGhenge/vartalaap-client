import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchIceServers } from '../ice'

describe('fetchIceServers', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
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

        const result = await fetchIceServers()

        expect(result).toEqual(servers)
    })

    it('throws when the server returns a non-ok status', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 503,
        }))

        await expect(fetchIceServers()).rejects.toThrow('ice-servers failed: 503')
    })

    it('throws when fetch itself rejects (network error)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))

        await expect(fetchIceServers()).rejects.toThrow('network error')
    })
})
