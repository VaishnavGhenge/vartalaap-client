/**
 * Central authenticated fetch with one-shot 401 → refresh → retry.
 *
 * Importing refreshSession from auth.ts here would create a circular dependency
 * (auth.ts → fetch.ts → auth.ts). Instead we inline the raw refresh call —
 * the /auth/refresh endpoint uses the HttpOnly cookie, no token required.
 */

import { httpServerUri } from '@/src/services/api/config'
import { getAccessToken, getRoomToken, setAccessToken } from '@/src/services/api/token'

let refreshInFlight: Promise<boolean> | null = null

export class ApiError extends Error {
    constructor(
        public status: number,
        public code: string,
        message: string,
        public field?: string,
    ) {
        super(message)
    }
}

export async function parseApiError(res: Response): Promise<ApiError> {
    const contentType = res.headers?.get('Content-Type') ?? ''
    if (contentType.includes('application/json')) {
        try {
            const body = (await res.json()) as { error?: string; code?: string; field?: string }
            return new ApiError(
                res.status,
                body.code || 'ERROR',
                body.error || res.statusText || `${res.status}`,
                body.field,
            )
        } catch {
            // Fall through to text parsing.
        }
    }
    const text = await res.text().catch(() => '')
    return new ApiError(res.status, 'ERROR', text.trim() || res.statusText || `${res.status}`)
}

export function apiBearerHeaders(): Record<string, string> {
    // Identity token wins when both are present: a logged-in user joining via
    // ?gt= holds both, and /me/* routes only accept identity tokens. SFU
    // accepts either, so guests with only a room token still get authorized.
    const token = getAccessToken() ?? getRoomToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
}

async function attemptRefresh(): Promise<boolean> {
    if (refreshInFlight) return refreshInFlight
    refreshInFlight = doRefresh().finally(() => {
        refreshInFlight = null
    })
    return refreshInFlight
}

async function doRefresh(): Promise<boolean> {
    try {
        const res = await fetch(`${httpServerUri}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
        })
        if (!res.ok) {
            setAccessToken(null)
            return false
        }
        const data = await res.json() as { accessToken: string }
        setAccessToken(data.accessToken)
        return true
    } catch {
        setAccessToken(null)
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
        throw await parseApiError(res)
    }
    if (res.status === 204) return undefined as T
    return res.json() as Promise<T>
}
