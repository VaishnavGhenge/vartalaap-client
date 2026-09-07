import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { refreshSession } from '../refresh'
import { apiFetch } from '../fetch'
import { getAccessToken, setAccessToken } from '../token'

const fetchMock = vi.fn()
beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    setAccessToken('old')
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
const ok = () => new Response(JSON.stringify({ accessToken: 'new', user: { id: 'user' } }), { status: 200 })

describe('shared session renewal', () => {
    it('coalesces proactive refresh with a reactive API retry', async () => {
        let finish!: (response: Response) => void
        fetchMock.mockImplementation((url: string) => {
            if (url.endsWith('/auth/refresh')) return new Promise(resolve => { finish = resolve })
            return Promise.resolve(getAccessToken() === 'old' ? new Response('', { status: 401 }) : ok())
        })
        const proactive = refreshSession()
        const reactive = apiFetch('GET', '/resource')
        await vi.advanceTimersByTimeAsync(0)
        finish(ok())
        await Promise.all([proactive, reactive])
        expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))).toHaveLength(1)
        expect(getAccessToken()).toBe('new')
    })

    it('retains the live token after bounded retries on server failure', async () => {
        fetchMock.mockImplementation(() => Promise.resolve(new Response('', { status: 503 })))
        const result = refreshSession().catch(error => error)
        await vi.advanceTimersByTimeAsync(5_000)
        expect(await result).toBeInstanceOf(Error)
        expect(fetchMock).toHaveBeenCalledTimes(3)
        expect(getAccessToken()).toBe('old')
    })

    it('times out stalled network requests without signing out', async () => {
        fetchMock.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')))
        }))
        const result = refreshSession().catch(error => error)
        await vi.advanceTimersByTimeAsync(30_000)
        expect(await result).toMatchObject({ name: 'AbortError' })
        expect(fetchMock).toHaveBeenCalledTimes(3)
        expect(getAccessToken()).toBe('old')
    })

    it('clears credentials only after explicit rejection', async () => {
        fetchMock.mockResolvedValue(new Response('', { status: 401 }))
        expect(await refreshSession()).toBeNull()
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(getAccessToken()).toBeNull()
    })
})
