import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMeet } from '../meet'

describe('createMeet', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('returns a server-issued meet code', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ meetCode: 'abc-defg-hij' }),
        }))

        const result = await createMeet()

        expect(result).toEqual({ meetCode: 'abc-defg-hij' })
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/meets/new'), expect.objectContaining({
            method: 'POST',
        }))
    })

    it('throws when the server rejects meet creation', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 429,
            text: () => Promise.resolve(''),
        }))

        await expect(createMeet()).rejects.toThrow('POST http://localhost:8080/meets/new: 429')
    })
})
