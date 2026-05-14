import { httpServerUri } from '@/src/services/api/config'
import { getAccessToken } from '@/src/services/api/token'

function authHeaders(): Record<string, string> {
    const token = getAccessToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
}

export function get<T>(path: string): Promise<T> {
    return fetch(`${httpServerUri}/${path}`, {
        credentials: 'include',
        headers: authHeaders(),
    }) as Promise<T>
}

export function post<T>(path: string, data?: unknown): Promise<T> {
    return fetch(`${httpServerUri}/${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: data !== undefined ? JSON.stringify(data) : undefined,
    }) as Promise<T>
}
