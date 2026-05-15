import { httpServerUri } from '@/src/services/api/config'
import { getAccessToken, setAccessToken } from '@/src/services/api/token'
import type { AuthResponse, RegisterCredentials, User, UserCredentials } from '@/src/types/auth'

async function authPost<T>(path: string, body?: unknown, requiresAuth = false): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (requiresAuth) {
        const token = getAccessToken()
        if (token) headers['Authorization'] = `Bearer ${token}`
    }
    const res = await fetch(`${httpServerUri}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(text.trim() || `${res.status}`)
    }
    if (res.status === 204) return undefined as T
    return res.json()
}

export async function register(creds: RegisterCredentials): Promise<AuthResponse> {
    const resp = await authPost<AuthResponse>('/auth/register', creds)
    setAccessToken(resp.accessToken)
    return resp
}

export async function login(creds: UserCredentials): Promise<AuthResponse> {
    const resp = await authPost<AuthResponse>('/auth/login', creds)
    setAccessToken(resp.accessToken)
    return resp
}

export async function refreshSession(): Promise<AuthResponse | null> {
    try {
        const resp = await authPost<AuthResponse>('/auth/refresh')
        setAccessToken(resp.accessToken)
        return resp
    } catch {
        setAccessToken(null)
        return null
    }
}

export async function logout(): Promise<void> {
    await authPost('/auth/logout', undefined, true).catch(() => {})
    setAccessToken(null)
}

export async function getMe(): Promise<User> {
    const token = getAccessToken()
    const res = await fetch(`${httpServerUri}/auth/me`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error('unauthorized')
    return res.json()
}

export async function updateProfile(payload: {
    name: string
    slug: string
    timezone: string
    onboardingStep: number
}): Promise<User> {
    const token = getAccessToken()
    const res = await fetch(`${httpServerUri}/auth/me`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(text.trim() || `${res.status}`)
    }
    return res.json()
}
