/**
 * Central authenticated fetch with one-shot 401 → refresh → retry.
 *
 * Importing refreshSession from auth.ts here would create a circular dependency
 * (auth.ts → fetch.ts → auth.ts). Instead we inline the raw refresh call —
 * the /auth/refresh endpoint uses the HttpOnly cookie, no token required.
 */

import { httpServerUri } from '@/src/services/api/config'
import { getAccessToken, setAccessToken } from '@/src/services/api/token'

export function apiBearerHeaders(): Record<string, string> {
    const token = getAccessToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
}

async function attemptRefresh(): Promise<boolean> {
    try {
        const res = await fetch(`${httpServerUri}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
        })
        if (!res.ok) return false
        const data = await res.json() as { accessToken: string }
        setAccessToken(data.accessToken)
        return true
    } catch {
        return false
    }
}

/**
 * Authenticated fetch with automatic 401 → token refresh → one retry.
 * Throws on non-2xx after the retry (or if refresh itself fails).
 */
export async function apiFetch<T>(
    method: string,
    url: string,
    options: {
        body?: unknown
        extraHeaders?: Record<string, string>
        /** Skip 401 retry — used by auth endpoints (login, refresh) that don't send tokens. */
        skipRefresh?: boolean
    } = {},
): Promise<T> {
    const bodyStr = options.body !== undefined ? JSON.stringify(options.body) : undefined
    const headers: Record<string, string> = {
        ...(bodyStr ? { 'Content-Type': 'application/json' } : {}),
        ...apiBearerHeaders(),
        ...options.extraHeaders,
    }

    let res = await fetch(url, { method, credentials: 'include', headers, body: bodyStr })

    if (res.status === 401 && !options.skipRefresh) {
        const ok = await attemptRefresh()
        if (!ok) {
            setAccessToken(null)
            throw new Error('Session expired. Please sign in again.')
        }
        // Retry with the new token
        res = await fetch(url, {
            method,
            credentials: 'include',
            headers: {
                ...(bodyStr ? { 'Content-Type': 'application/json' } : {}),
                ...apiBearerHeaders(),
                ...options.extraHeaders,
            },
            body: bodyStr,
        })
    }

    if (!res.ok) {
        const text = await res.text()
        throw new Error(text.trim() || `${method} ${url}: ${res.status}`)
    }
    if (res.status === 204) return undefined as T
    return res.json() as Promise<T>
}
