import { httpServerUri } from '@/src/services/api/config'
import { apiFetch } from '@/src/services/api/fetch'

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

export async function getAvailability(): Promise<AvailabilityRule[]> {
    const body = await apiFetch<AvailabilityResponse>('GET', `${httpServerUri}/me/availability`)
    return body.rules ?? []
}

export async function putAvailability(rules: AvailabilityRule[]): Promise<AvailabilityRule[]> {
    const body = await apiFetch<AvailabilityResponse>('PUT', `${httpServerUri}/me/availability`, {
        body: { rules } satisfies AvailabilityResponse,
    })
    return body.rules ?? []
}
