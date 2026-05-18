import { httpServerUri } from '@/src/services/api/config'
import { apiFetch } from '@/src/services/api/fetch'

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
    cancellationReason?: string
    cancelledBy?: 'host' | 'guest'
    roomStatus?: 'open' | 'too_early' | 'ended' | 'cancelled'
    roomMessage?: string
    roomOpensAt?: string
    roomClosesAt?: string
    serverNow?: string
}

interface ListResponse {
    bookings: HostBooking[]
}

export async function listMyBookings(): Promise<HostBooking[]> {
    const body = await apiFetch<ListResponse>('GET', `${httpServerUri}/me/bookings`)
    return body.bookings ?? []
}

// cancelBooking is the host-side counterpart to public.cancelBookingByMeetCode.
// Scoped server-side to bookings owned by the authed user — cross-host
// attempts return 404 so booking IDs can't be probed.
export async function cancelBooking(id: string, reason: string): Promise<void> {
    await apiFetch<void>('DELETE', `${httpServerUri}/bookings/${encodeURIComponent(id)}`, {
        body: { reason },
    })
}
