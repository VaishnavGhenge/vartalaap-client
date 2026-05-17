import { httpServerUri } from '@/src/services/api/config'

// Public (unauthenticated) booking API. Mirrors vartalaap-server's
// internal/httpx/slots_handler.go and the POST half of booking_handler.go.
// Authenticated calls live in their per-resource modules; everything here is
// reachable by anyone with the host's slug.

export interface PublicEvent {
    id: string
    slug: string
    title: string
    description?: string
    durationMin: number
    // Time reserved before/after each booking. Already baked into the slot
    // spacing returned by /slots, but exposed so the picker can label what
    // the guest is reserving.
    bufferMin: number
    isPaid: boolean
}

export interface HostProfile {
    name: string
    slug: string
    timezone: string
    eventTypes: PublicEvent[]
}

export interface PublicEventResponse {
    host: { name: string; slug: string; timezone: string }
    event: PublicEvent
}

export interface SlotsResponse {
    eventTypeId: string
    eventTitle: string
    durationMin: number
    hostName: string
    hostTimezone: string
    slots: string[]
}

export interface BookingResponse {
    id: string
    eventTypeId: string
    eventTypeSlug?: string
    eventTitle?: string
    hostId: string
    hostSlug?: string
    guestName: string
    guestEmail: string
    startsAt: string
    endsAt: string
    meetCode: string
    status: string
}

// Single throw shape so the page-level error UI doesn't have to second-guess
// what the server returned. `code` is the machine-readable identifier (e.g.
// "SLOT_TAKEN", "EVENT_INACTIVE") used by the booking page to disable the
// time picker on conflict without re-fetching.
export class PublicApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
        super(message)
    }
}

async function get<T>(path: string): Promise<T> {
    const res = await fetch(`${httpServerUri}${path}`, {
        credentials: 'include',
    })
    if (!res.ok) {
        throw await asPublicError(res)
    }
    return (await res.json()) as T
}

async function asPublicError(res: Response): Promise<PublicApiError> {
    let code = 'ERROR'
    let message = res.statusText
    try {
        const body = (await res.json()) as { error?: string; code?: string }
        if (body?.code) code = body.code
        if (body?.error) message = body.error
    } catch {
        // Non-JSON body — keep the defaults.
    }
    return new PublicApiError(res.status, code, message)
}

export async function getHostProfile(slug: string): Promise<HostProfile> {
    return get<HostProfile>(`/u/${encodeURIComponent(slug)}`)
}

export async function getPublicEvent(
    hostSlug: string,
    eventSlug: string,
): Promise<PublicEventResponse> {
    return get<PublicEventResponse>(
        `/u/${encodeURIComponent(hostSlug)}/${encodeURIComponent(eventSlug)}`,
    )
}

export async function listSlots(
    hostSlug: string,
    eventSlug: string,
    from: string,
    to?: string,
): Promise<SlotsResponse> {
    const qs = new URLSearchParams({ from })
    if (to) qs.set('to', to)
    return get<SlotsResponse>(
        `/u/${encodeURIComponent(hostSlug)}/${encodeURIComponent(eventSlug)}/slots?${qs}`,
    )
}

export interface CreateBookingInput {
    hostSlug: string
    eventTypeSlug: string
    startsAt: string
    guestName: string
    guestEmail: string
}

export async function createBooking(input: CreateBookingInput): Promise<BookingResponse> {
    const res = await fetch(`${httpServerUri}/bookings`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    })
    if (!res.ok) {
        throw await asPublicError(res)
    }
    return (await res.json()) as BookingResponse
}

export async function getBookingByMeetCode(code: string): Promise<BookingResponse> {
    return get<BookingResponse>(`/m/${encodeURIComponent(code)}`)
}

// cancelBookingByMeetCode is the guest-facing cancel. The server returns 204
// on success (and on a re-cancel — the endpoint is idempotent), so there's
// no body to parse.
export async function cancelBookingByMeetCode(code: string): Promise<void> {
    const res = await fetch(`${httpServerUri}/m/${encodeURIComponent(code)}`, {
        method: 'DELETE',
        credentials: 'include',
    })
    if (!res.ok) {
        throw await asPublicError(res)
    }
}
