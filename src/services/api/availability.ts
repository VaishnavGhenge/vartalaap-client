import { httpServerUri } from '@/src/services/api/config'
import { getAccessToken } from '@/src/services/api/token'

// Mirrors the shape on vartalaap-server/internal/httpx/me_handler.go. Keep this
// type collocated with the API rather than spread into multiple stores so the
// wire contract has one obvious owner.
export interface AvailabilityRule {
    // Server-assigned; absent on PUT payloads.
    id?: string
    // 0=Sun .. 6=Sat (matches JS Date.getDay()).
    dayOfWeek: number
    // "HH:MM" 24-hour wall time.
    startTime: string
    // "HH:MM" 24-hour wall time, strictly after startTime.
    endTime: string
    // IANA zone. The server rejects unknown zones at the boundary.
    timezone: string
}

export interface AvailabilityResponse {
    rules: AvailabilityRule[]
}

function authHeaders(): HeadersInit {
    const token = getAccessToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function getAvailability(): Promise<AvailabilityRule[]> {
    const res = await fetch(`${httpServerUri}/me/availability`, {
        credentials: 'include',
        headers: authHeaders(),
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(text.trim() || `availability fetch ${res.status}`)
    }
    const body = (await res.json()) as AvailabilityResponse
    return body.rules ?? []
}

export async function putAvailability(rules: AvailabilityRule[]): Promise<AvailabilityRule[]> {
    const res = await fetch(`${httpServerUri}/me/availability`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
        },
        body: JSON.stringify({ rules } satisfies AvailabilityResponse),
    })
    if (!res.ok) {
        const text = await res.text()
        // Server returns precise per-rule messages like "rule 2: endTime must
        // be after startTime" — surface them verbatim so the UI can render the
        // exact problem without inventing its own copy.
        throw new Error(text.trim() || `availability save ${res.status}`)
    }
    const body = (await res.json()) as AvailabilityResponse
    return body.rules ?? []
}
