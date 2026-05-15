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
    // remoteSessionId identifies which remote peer the track belongs to.
    onRemoteTrack?: (track: MediaStreamTrack, stream: MediaStream, remoteSessionId: string) => void
    onConnectionStateChange?: (state: RTCPeerConnectionState) => void
}

// RealtimeSfuSession owns a single RTCPeerConnection to the Cloudflare Realtime SFU.
// All local tracks are published through it and all remote tracks are received on it.
// There is exactly one instance per call participant.
export class RealtimeSfuSession {
    private _pc: RTCPeerConnection
    private _sessionId: string | null = null
    private _localSenders = new Map<string, RTCRtpSender>() // track.kind → sender
    private _midToRemoteSession = new Map<string, string>()  // mid → remoteSessionId
    private _remoteStreams = new Map<string, MediaStream>()   // remoteSessionId → combined stream
    private _destroyed = false
    private readonly _opts: RealtimeSfuSessionOptions

    // Serialises all operations that involve SDP negotiation with CF.
    // CF's SDP state machine rejects interleaved offer/answer sequences with
    // "invalid_session_description: expecting a remote answer", so every
    // publish / subscribe / new-track-replaceTrack must run sequentially.
    private _lock: Promise<void> = Promise.resolve()

    private withLock<T>(fn: () => Promise<T>): Promise<T> {
        const next = this._lock.then(fn, fn)
        // Update the lock tail, swallowing errors so subsequent ops aren't stuck.
        this._lock = next.then(
            () => {},
            () => {},
        )
        return next
    }

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
            const mid = event.transceiver.mid
            const remoteSessionId = mid ? this._midToRemoteSession.get(mid) : undefined
            if (!remoteSessionId) {
                // Track arrived before subscribe mapped the mid — ignore (CF sends local track echoes).
                return
            }
            let stream = this._remoteStreams.get(remoteSessionId)
            if (!stream) {
                stream = new MediaStream()
                this._remoteStreams.set(remoteSessionId, stream)
            }
            stream.addTrack(event.track)
            opts.onRemoteTrack?.(event.track, stream, remoteSessionId)
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
    publish(stream: MediaStream): Promise<SfuTrackMeta[]> {
        return this.withLock(async () => {
            if (!this._sessionId) throw new Error('SFU session not initialized')

            const tracks = stream.getTracks()
            if (tracks.length === 0) return []

            const trackMetas: SfuTrackObject[] = []
            for (const track of tracks) {
                const transceiver = this._pc.addTransceiver(track, {
                    direction: 'sendonly',
                    streams: [stream],
                })
                this._localSenders.set(track.kind, transceiver.sender)
                trackMetas.push({ trackName: track.kind, location: 'local' })
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
        })
    }

    // subscribe — pulls the given trackNames from remoteSessionId into this PC.
    //
    // When CF sets requiresImmediateRenegotiation, it sends an SDP offer in the response.
    // The client must set it as the remote description, create an answer, and send the
    // answer back via /renegotiate. CF returns no SDP — it just confirms success.
    //
    // The renegotiate step is treated as best-effort: if it fails (e.g. the remote
    // session was closed between the subscribe response and the renegotiate call),
    // the PC is already in stable state locally so future operations are unaffected.
    subscribe(remoteSessionId: string, trackNames: string[]): Promise<void> {
        return this.withLock(async () => {
            if (!this._sessionId) throw new Error('SFU session not initialized')

            const remoteTracks: SfuTrackObject[] = trackNames.map((name) => ({
                trackName: name,
                location: 'remote' as const,
                sessionId: remoteSessionId,
            }))

            const resp = await sfuTracksNew(this._sessionId, { tracks: remoteTracks })

            // Map each assigned mid back to this remote session so ontrack can route correctly.
            for (const t of resp.tracks) {
                if (t.mid) this._midToRemoteSession.set(t.mid, remoteSessionId)
            }

            if (resp.requiresImmediateRenegotiation && resp.sessionDescription) {
                // CF sends an offer; we answer it and send the answer back.
                await this._pc.setRemoteDescription(resp.sessionDescription as RTCSessionDescriptionInit)
                const answer = await this._pc.createAnswer()
                await this._pc.setLocalDescription(answer)
                // Best-effort: the remote session may have closed between our subscribe
                // and this call (e.g. same user rejoining from a new tab).
                await sfuRenegotiate(this._sessionId, answer.sdp!, 'answer').catch((e) => {
                    console.warn('[sfu] subscribe renegotiate failed (remote session likely gone):', e)
                })
            }
        })
    }

    // replaceTrack — swaps the outbound sender for the given kind.
    // If no sender exists yet (user enabled camera/mic after joining), adds a new
    // sendonly transceiver and renegotiates with CF so remote peers can subscribe.
    // Simple sender swaps (existing kind) skip the lock — RTCRtpSender.replaceTrack
    // needs no SDP negotiation and does not touch CF's state machine.
    async replaceTrack(kind: string, track: MediaStreamTrack): Promise<void> {
        const sender = this._localSenders.get(kind)
        if (sender) {
            try {
                await sender.replaceTrack(track)
            } catch (e) {
                // OperationError fires when the sender is gone — safe to ignore.
                if ((e as DOMException).name !== 'OperationError') throw e
            }
            return
        }

        // First time this track kind is published — must go through the lock
        // because it involves a full offer/answer renegotiation with CF.
        return this.withLock(async () => {
            if (!this._sessionId) return
            const stream = new MediaStream([track])
            const transceiver = this._pc.addTransceiver(track, { direction: 'sendonly', streams: [stream] })
            this._localSenders.set(kind, transceiver.sender)

            const offer = await this._pc.createOffer()
            await this._pc.setLocalDescription(offer)

            const resp = await sfuTracksNew(this._sessionId, {
                sessionDescription: { type: offer.type, sdp: offer.sdp! },
                tracks: [{ trackName: kind, location: 'local', mid: transceiver.mid ?? undefined }],
            })
            if (resp.sessionDescription) {
                await this._pc.setRemoteDescription(resp.sessionDescription as RTCSessionDescriptionInit)
            }
        })
    }

    close(): void {
        if (this._destroyed) return
        this._destroyed = true
        this._midToRemoteSession.clear()
        this._remoteStreams.clear()
        this._pc.close()
        if (this._sessionId) {
            closeSfuSession(this._sessionId).catch(() => {})
        }
    }
}
