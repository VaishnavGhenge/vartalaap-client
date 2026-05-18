import { httpServerUri } from '@/src/services/api/config'
import { apiFetch, parseApiError } from '@/src/services/api/fetch'
import { getAccessToken, setAccessToken } from '@/src/services/api/token'
import type { AuthResponse, RegisterCredentials, User, UserCredentials } from '@/src/types/auth'

const authSessionCookieName = 'sessionly_session'

function clearSessionMarker() {
    if (typeof document === 'undefined') return
    document.cookie = `${authSessionCookieName}=; Path=/; Max-Age=0; SameSite=Strict`
}

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
        throw await parseApiError(res)
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
        clearSessionMarker()
        return null
    }
}

export async function restoreAuthSession(): Promise<AuthResponse | null> {
    const existingToken = getAccessToken()
    if (existingToken) {
        try {
            const user = await getMe()
            return { accessToken: getAccessToken() ?? existingToken, user }
        } catch {
            setAccessToken(null)
        }
    }
    return refreshSession()
}

export async function logout(): Promise<void> {
    await authPost('/auth/logout', undefined, true).catch(() => {})
    setAccessToken(null)
    clearSessionMarker()
}

export async function getMe(): Promise<User> {
    return apiFetch<User>('GET', `${httpServerUri}/auth/me`)
}

export async function updateProfile(payload: {
    name: string
    slug: string
    timezone: string
    onboardingStep: number
    avatarUrl?: string | null
}): Promise<User> {
    return apiFetch<User>('PATCH', `${httpServerUri}/auth/me`, { body: payload })
}
