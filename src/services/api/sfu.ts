import { httpServerUri } from '@/src/services/api/config'
import { apiFetch } from '@/src/services/api/fetch'

function sfuFetch<T>(method: string, path: string, body?: unknown): Promise<T> {
    return apiFetch<T>(method, `${httpServerUri}${path}`, { body })
}

export interface SfuTrackObject {
    trackName: string
    mid?: string
    location?: 'local' | 'remote'
    sessionId?: string
}

export interface SfuTracksNewRequest {
    sessionDescription?: { type: string; sdp: string }
    tracks: SfuTrackObject[]
}

export interface SfuTracksNewResponse {
    sessionDescription?: { type: string; sdp: string }
    tracks: SfuTrackObject[]
    requiresImmediateRenegotiation: boolean
}

export function createSfuSession(roomId: string, peerId: string): Promise<{ sessionId: string }> {
    return sfuFetch('POST', '/sfu/sessions', { roomId, peerId })
}

export function sfuTracksNew(sessionId: string, req: SfuTracksNewRequest): Promise<SfuTracksNewResponse> {
    return sfuFetch('POST', `/sfu/sessions/${sessionId}/tracks/new`, req)
}

// sfuRenegotiate sends the client's SDP to CF after a renegotiation is required.
// In the subscribe flow sdpType is 'answer'; for ICE-restart it may be 'offer'.
// CF returns 204 No Content on success.
export function sfuRenegotiate(sessionId: string, sdp: string, sdpType: 'offer' | 'answer'): Promise<void> {
    return sfuFetch('PUT', `/sfu/sessions/${sessionId}/renegotiate`, {
        sessionDescription: { type: sdpType, sdp },
    })
}

export function closeSfuSession(sessionId: string): Promise<void> {
    return sfuFetch('DELETE', `/sfu/sessions/${sessionId}`)
}
