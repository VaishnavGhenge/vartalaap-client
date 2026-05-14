'use client'

import {
    createSfuSession,
    sfuTracksNew,
    sfuRenegotiate,
    closeSfuSession,
    type SfuTrackObject,
} from '@/src/services/api/sfu'

export interface SfuTrackMeta {
    trackName: string
    mid?: string
}

export interface RealtimeSfuSessionOptions {
    roomId: string
    peerId: string
    iceServers: RTCIceServer[]
    onRemoteTrack?: (track: MediaStreamTrack, stream: MediaStream) => void
    onConnectionStateChange?: (state: RTCPeerConnectionState) => void
}

// RealtimeSfuSession owns a single RTCPeerConnection to the Cloudflare Realtime SFU.
// All local tracks are published through it and all remote tracks are received on it.
// There is exactly one instance per call participant.
export class RealtimeSfuSession {
    private _pc: RTCPeerConnection
    private _sessionId: string | null = null
    private _localSenders = new Map<string, RTCRtpSender>() // track.kind → sender
    private _destroyed = false
    private readonly _opts: RealtimeSfuSessionOptions

    private constructor(opts: RealtimeSfuSessionOptions) {
        this._opts = opts
        this._pc = new RTCPeerConnection({
            iceServers: opts.iceServers,
            bundlePolicy: 'max-bundle',
        })

        this._pc.onconnectionstatechange = () => {
            opts.onConnectionStateChange?.(this._pc.connectionState)
        }

        this._pc.ontrack = (event) => {
            const stream = event.streams[0] ?? new MediaStream([event.track])
            opts.onRemoteTrack?.(event.track, stream)
        }
    }

    static async create(opts: RealtimeSfuSessionOptions): Promise<RealtimeSfuSession> {
        const session = new RealtimeSfuSession(opts)
        const { sessionId } = await createSfuSession(opts.roomId, opts.peerId)
        session._sessionId = sessionId
        return session
    }

    get sessionId(): string | null {
        return this._sessionId
    }

    // publish — adds all tracks from stream as sendonly transceivers, negotiates with CF.
    // Returns the confirmed track metadata that the server will broadcast to room peers.
    async publish(stream: MediaStream): Promise<SfuTrackMeta[]> {
        if (!this._sessionId) throw new Error('SFU session not initialized')

        const trackMetas: SfuTrackObject[] = []
        for (const track of stream.getTracks()) {
            const transceiver = this._pc.addTransceiver(track, {
                direction: 'sendonly',
                streams: [stream],
            })
            this._localSenders.set(track.kind, transceiver.sender)
            trackMetas.push({ trackName: track.kind })
        }

        const offer = await this._pc.createOffer()
        await this._pc.setLocalDescription(offer)

        // Attach finalized mids after setLocalDescription resolves them.
        const withMids: SfuTrackObject[] = trackMetas.map((meta) => {
            const sender = this._localSenders.get(meta.trackName)
            const transceiver = this._pc.getTransceivers().find((t) => t.sender === sender)
            return { ...meta, mid: transceiver?.mid ?? undefined }
        })

        const resp = await sfuTracksNew(this._sessionId, {
            sessionDescription: { type: offer.type, sdp: offer.sdp! },
            tracks: withMids,
        })

        if (resp.sessionDescription) {
            await this._pc.setRemoteDescription(resp.sessionDescription as RTCSessionDescriptionInit)
        }

        return resp.tracks.map((t) => ({ trackName: t.trackName, mid: t.mid }))
    }

    // subscribe — pulls the given trackNames from remoteSessionId into this PC.
    async subscribe(remoteSessionId: string, trackNames: string[]): Promise<void> {
        if (!this._sessionId) throw new Error('SFU session not initialized')

        const remoteTracks: SfuTrackObject[] = trackNames.map((name) => ({
            trackName: name,
            location: 'remote' as const,
            sessionId: remoteSessionId,
        }))

        const resp = await sfuTracksNew(this._sessionId, { tracks: remoteTracks })

        if (resp.sessionDescription) {
            await this._pc.setRemoteDescription(resp.sessionDescription as RTCSessionDescriptionInit)
        }

        if (resp.requiresImmediateRenegotiation) {
            const offer = await this._pc.createOffer()
            await this._pc.setLocalDescription(offer)
            const reResp = await sfuRenegotiate(this._sessionId, offer.sdp!)
            await this._pc.setRemoteDescription(reResp.sessionDescription as RTCSessionDescriptionInit)
        }
    }

    // replaceTrack — swaps the outbound sender for the given kind without renegotiation.
    async replaceTrack(kind: string, track: MediaStreamTrack): Promise<void> {
        const sender = this._localSenders.get(kind)
        if (!sender) return
        try {
            await sender.replaceTrack(track)
        } catch (e) {
            // OperationError fires when the sender is gone — safe to ignore.
            if ((e as DOMException).name !== 'OperationError') throw e
        }
    }

    close(): void {
        if (this._destroyed) return
        this._destroyed = true
        this._pc.close()
        if (this._sessionId) {
            closeSfuSession(this._sessionId).catch(() => {})
        }
    }
}
