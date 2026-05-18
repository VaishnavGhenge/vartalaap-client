import { httpServerUri } from '@/src/services/api/config'
import { apiFetch } from '@/src/services/api/fetch'

export function get<T>(path: string): Promise<T> {
    return apiFetch<T>('GET', `${httpServerUri}/${path}`)
}

export function post<T>(path: string, data?: unknown): Promise<T> {
    return apiFetch<T>('POST', `${httpServerUri}/${path}`, { body: data })
}
