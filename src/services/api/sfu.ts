import { httpServerUri } from '@/src/services/api/config'
import { getAccessToken } from '@/src/services/api/token'

function authHeaders(): Record<string, string> {
    const token = getAccessToken()
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
}

async function sfuFetch<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${httpServerUri}${path}`, {
        method,
        credentials: 'include',
        headers: authHeaders(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(text.trim() || `sfu ${method} ${path}: ${res.status}`)
    }
    if (res.status === 204) return undefined as T
    return res.json()
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

export function sfuRenegotiate(
    sessionId: string,
    offerSdp: string,
): Promise<{ sessionDescription: { type: string; sdp: string } }> {
    return sfuFetch('PUT', `/sfu/sessions/${sessionId}/renegotiate`, {
        sessionDescription: { type: 'offer', sdp: offerSdp },
    })
}

export function closeSfuSession(sessionId: string): Promise<void> {
    return sfuFetch('DELETE', `/sfu/sessions/${sessionId}`)
}
