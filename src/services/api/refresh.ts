import { authServerUri } from './config'
import { getAccessToken, setAccessToken } from './token'
import type { AuthResponse } from '@/src/types/auth'

let inFlight: Promise<AuthResponse | null> | null = null

// Null means rejected credentials. Transport failures throw without deleting
// the current token, so callers can retry without breaking live SFU headers.
async function renew(): Promise<AuthResponse | null> {
    const originalToken = getAccessToken()
    for (let attempt = 0; attempt < 3; attempt++) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 8_000)
        try {
            const response = await fetch(`${authServerUri}/auth/refresh`, {
                method: 'POST', credentials: 'include', signal: controller.signal,
            })
            if (response.status === 401) {
                // A login in another tab must not be undone by this response.
                if (getAccessToken() === originalToken) setAccessToken(null)
                return null
            }
            if (!response.ok) throw new Error(`Session renewal unavailable (${response.status})`)
            const data = await response.json() as AuthResponse
            if (!data.accessToken) throw new Error('Invalid session renewal response')
            if (getAccessToken() === originalToken) setAccessToken(data.accessToken)
            return data
        } catch (error) {
            if (attempt === 2) throw error
        } finally {
            clearTimeout(timer)
        }
        await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt * (0.5 + Math.random() * 0.5)))
    }
    throw new Error('Session renewal unavailable')
}

export function refreshSession(): Promise<AuthResponse | null> {
    if (!inFlight) {
        // The HttpOnly refresh cookie is shared by tabs. A module-level promise
        // alone cannot serialize its single-use rotation across those tabs.
        const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
        inFlight = (locks
            ? locks.request('sessionly-refresh', { signal: AbortSignal.timeout(30_000) }, renew)
            : renew()).finally(() => { inFlight = null })
    }
    return inFlight
}
