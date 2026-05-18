import { httpServerUri } from '@/src/services/api/config'
import { apiFetch } from '@/src/services/api/fetch'

// Mirrors vartalaap-server/internal/httpx/me_handler.go::eventTypeDTO. ID is
// server-assigned. PriceCents/MaxPerDay are `null` on the wire — represent as
// optional here to keep the consumer code free of explicit-null branches.
export interface EventType {
    id?: string
    slug: string
    title: string
    durationMin: number
    bufferMin: number        // buffer after the meeting ends
    bufferBeforeMin: number  // buffer before the meeting starts
    maxPerDay?: number       // undefined = unlimited
    minNoticeHours: number   // 0 = no minimum
    maxDaysAhead: number     // 0 = no limit
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

export async function listEventTypes(): Promise<EventType[]> {
    const body = await apiFetch<ListResponse>('GET', `${httpServerUri}/me/event-types`)
    return body.eventTypes ?? []
}

export async function createEventType(input: EventType): Promise<EventType> {
    return apiFetch<EventType>('POST', `${httpServerUri}/me/event-types`, { body: input })
}

export async function updateEventType(id: string, patch: Partial<EventType>): Promise<EventType> {
    return apiFetch<EventType>('PATCH', `${httpServerUri}/me/event-types/${encodeURIComponent(id)}`, {
        body: patch,
    })
}

export async function deleteEventType(id: string): Promise<void> {
    await apiFetch<void>('DELETE', `${httpServerUri}/me/event-types/${encodeURIComponent(id)}`)
}
