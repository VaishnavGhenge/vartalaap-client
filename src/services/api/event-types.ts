import { httpServerUri } from '@/src/services/api/config'
import { getAccessToken } from '@/src/services/api/token'

// Mirrors vartalaap-server/internal/httpx/me_handler.go::eventTypeDTO. ID is
// server-assigned. PriceCents/MaxPerDay are `null` on the wire — represent as
// optional here to keep the consumer code free of explicit-null branches.
export interface EventType {
    id?: string
    slug: string
    title: string
    durationMin: number
    bufferMin: number
    maxPerDay?: number
    isPaid: boolean
    priceCents?: number
    currency?: string
    paymentTiming?: 'upfront' | 'after'
    isActive: boolean
    description?: string
}

interface ListResponse {
    eventTypes: EventType[]
}

function authHeaders(): HeadersInit {
    const token = getAccessToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function listEventTypes(): Promise<EventType[]> {
    const res = await fetch(`${httpServerUri}/me/event-types`, {
        credentials: 'include',
        headers: authHeaders(),
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(text.trim() || `event-types list ${res.status}`)
    }
    const body = (await res.json()) as ListResponse
    return body.eventTypes ?? []
}

export async function createEventType(input: EventType): Promise<EventType> {
    const res = await fetch(`${httpServerUri}/me/event-types`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(input),
    })
    if (!res.ok) {
        const text = await res.text()
        // Server returns a precise message for every 4xx — pass through verbatim
        // so the UI can render the actual constraint that failed (e.g. "free
        // plan allows 1 active event type").
        throw new Error(text.trim() || `event-types create ${res.status}`)
    }
    return (await res.json()) as EventType
}
