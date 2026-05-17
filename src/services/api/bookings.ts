import { httpServerUri } from '@/src/services/api/config'
import { getAccessToken } from '@/src/services/api/token'

// Authenticated host-side bookings client. Mirrors GET /me/bookings on
// vartalaap-server/internal/httpx/booking_handler.go. The public POST /bookings
// + GET /m/{code} pair lives in public.ts; keep them separate so authed and
// unauthed flows never share request decoration.

export interface HostBooking {
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

interface ListResponse {
    bookings: HostBooking[]
}

function authHeaders(): HeadersInit {
    const token = getAccessToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function listMyBookings(): Promise<HostBooking[]> {
    const res = await fetch(`${httpServerUri}/me/bookings`, {
        credentials: 'include',
        headers: authHeaders(),
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(text.trim() || `bookings list ${res.status}`)
    }
    const body = (await res.json()) as ListResponse
    return body.bookings ?? []
}
