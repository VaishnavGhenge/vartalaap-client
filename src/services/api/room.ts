import { httpServerUri } from '@/src/services/api/config'

export type RoomStatus = 'open' | 'too_early' | 'ended' | 'cancelled' | 'not_found'

export interface RoomStatusResult {
    status: RoomStatus | 'unavailable'
    message?: string
    opensAt?: string  // ISO 8601 UTC, present when status === 'too_early'
    closesAt?: string // ISO 8601 UTC, present when status === 'open'
}

export async function fetchRoomStatus(code: string): Promise<RoomStatusResult> {
    try {
        const res = await fetch(
            `${httpServerUri}/room/status?code=${encodeURIComponent(code)}`,
            { signal: AbortSignal.timeout(5_000) },
        )
        if (!res.ok) return { status: 'unavailable' }
        return res.json() as Promise<RoomStatusResult>
    } catch {
        // Network error or timeout — fail open so a server hiccup doesn't
        // block users from reaching the join form. The signaling gate will
        // catch truly unavailable rooms on join.
        return { status: 'open' }
    }
}
