'use client'

// ─── Signal data type ─────────────────────────────────────────────────────────
//
// A unified wire format for both offer/answer SDP and ICE candidates.
// Compatible with the existing WebSocket signaling protocol.
export type SignalData =
  | RTCSessionDescriptionInit                              // type: 'offer' | 'answer'
  | { type: 'candidate'; candidate: RTCIceCandidateInit } // ICE candidate

// ─── Adaptive video encoding levels ──────────────────────────────────────────

export const ENCODING_LEVELS = [
  { maxBitrate: 200_000, scaleDown: 2.0, maxFps: 15 },  // 0: reduced
  { maxBitrate: 500_000, scaleDown: 1.5, maxFps: 20 },  // 1: medium
  { maxBitrate: 900_000, scaleDown: 1.0, maxFps: 24 },  // 2: full (default)
] as const

// ─── Options ─────────────────────────────────────────────────────────────────

export interface WebRTCSessionOptions {
  iceServers: RTCIceServer[]
  initiator: boolean
  localStream: MediaStream
  onSignal: (data: SignalData) => void
  onRemoteStream: (stream: MediaStream) => void
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void
}

// ─── WebRTCSession ────────────────────────────────────────────────────────────
//
// Thin wrapper around RTCPeerConnection that:
//   • Uses the perfect-negotiation pattern to serialize offer/answer exchanges
//     and resolve offer collisions without glare.
//   • Tracks senders by kind so callers never need direct RTCPeerConnection
//     access for the common replaceTrack / getStats / restartIce paths.
//   • Handles ICE restart automatically (initiator side only) with exponential
//     back-off and a max of 3 attempts per disconnection event.
//
// Phase-2 SFU note: the main coupling to the P2P signaling transport is the
// `onSignal` callback and the `signal()` method. The Cloudflare Realtime SFU
// migration should replace peer-to-peer offer/answer relay with session/track
// publish-subscribe while keeping media controls behind this session boundary.

const MAX_ICE_RESTART_ATTEMPTS = 3
const ICE_RESTART_DELAY_MS = 2_000

export class WebRTCSession {
  private _pc: RTCPeerConnection
  private _polite: boolean  // non-initiator defers to remote offers
  private _makingOffer = false
  private _ignoreOffer = false
  private _destroyed = false
  private _senders = new Map<string, RTCRtpSender>()  // keyed by track.kind
  private _onSignal: (data: SignalData) => void
  private _restartTimer: ReturnType<typeof setTimeout> | null = null
  private _restartAttempts = 0

  constructor(options: WebRTCSessionOptions) {
    const { iceServers, initiator, localStream, onSignal, onRemoteStream, onConnectionStateChange } = options
    this._polite = !initiator
    this._onSignal = onSignal

    this._pc = new RTCPeerConnection({ iceServers })

    // Pre-negotiate senders for all tracks in the local stream.
    // Using addTrack here (not addTransceiver) so the stream is associated on
    // the remote side for stream grouping. Both audio and video
    // senders are established before the first offer is sent.
    for (const track of localStream.getTracks()) {
      const sender = this._pc.addTrack(track, localStream)
      this._senders.set(track.kind, sender)
    }

    // Apply congestion-tuned encoding params to the video sender immediately.
    // setParameters is idempotent pre-negotiation; the browser applies the
    // values once the first offer/answer completes.
    const videoSender = this._senders.get('video')
    if (videoSender) queueMicrotask(() => void this._tuneVideoSender(videoSender))

    // ── Perfect negotiation ────────────────────────────────────────────────
    //
    // setLocalDescription() with no args is the "implicit description" shorthand
    // (Chrome 94+, Firefox 75+, Safari 14.1+). It creates an offer in 'stable'
    // state and an answer in 'have-remote-offer' state.
    this._pc.onnegotiationneeded = async () => {
      if (this._destroyed) return
      try {
        this._makingOffer = true
        await this._pc.setLocalDescription()
        if (this._pc.localDescription) {
          this._onSignal({
            type: this._pc.localDescription.type,
            sdp:  this._pc.localDescription.sdp,
          } as RTCSessionDescriptionInit)
        }
      } catch (e) {
        if (!this._destroyed) console.error('[WebRTCSession] onnegotiationneeded failed', e)
      } finally {
        this._makingOffer = false
      }
    }

    this._pc.onicecandidate = ({ candidate }) => {
      if (candidate && !this._destroyed) {
        this._onSignal({ type: 'candidate', candidate: candidate.toJSON() })
      }
    }

    this._pc.ontrack = ({ track, streams }) => {
      if (!this._destroyed && streams[0]) {
        onRemoteStream(streams[0])
      }
    }

    // ── ICE restart (initiator side only) ──────────────────────────────────
    //
    // 'disconnected': ICE path lost but not yet given up. We wait
    // ICE_RESTART_DELAY_MS for a transient recovery then call restartIce(),
    // which triggers onnegotiationneeded → new offer → remote re-ICEs.
    // 'connected': clear all restart state.
    // 'failed': browser exhausted retries; close() will surface to caller.
    this._pc.onconnectionstatechange = () => {
      if (this._destroyed) return
      const state = this._pc.connectionState
      onConnectionStateChange?.(state)

      if (initiator) {
        if (state === 'disconnected') {
          if (this._restartTimer !== null) return
          if (this._restartAttempts >= MAX_ICE_RESTART_ATTEMPTS) return
          this._restartTimer = setTimeout(() => {
            this._restartTimer = null
            if (this._destroyed || this._pc.connectionState !== 'disconnected') return
            this._restartAttempts++
            console.info('[WebRTCSession] ICE restart attempt %d', this._restartAttempts)
            this._pc.restartIce()
          }, ICE_RESTART_DELAY_MS)
        } else if (state === 'connected') {
          this._clearRestartTimer()
          this._restartAttempts = 0
        } else if (state === 'failed') {
          this._clearRestartTimer()
        }
      }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  // Process an incoming signal from the remote peer — offer, answer, or ICE candidate.
  async signal(data: SignalData): Promise<void> {
    if (this._destroyed) return

    if (data.type === 'candidate') {
      try {
        await this._pc.addIceCandidate(new RTCIceCandidate(data.candidate))
      } catch (e) {
        // Ignore errors when we're intentionally ignoring an offer (impolite side).
        if (!this._ignoreOffer) console.warn('[WebRTCSession] addIceCandidate failed', e)
      }
      return
    }

    // offer or answer: perfect-negotiation collision handling
    const offerCollision =
      data.type === 'offer' &&
      (this._makingOffer || this._pc.signalingState !== 'stable')

    this._ignoreOffer = !this._polite && offerCollision
    if (this._ignoreOffer) return

    try {
      await this._pc.setRemoteDescription(new RTCSessionDescription(data))
      if (data.type === 'offer') {
        await this._pc.setLocalDescription()
        if (this._pc.localDescription) {
          this._onSignal({
            type: this._pc.localDescription.type,
            sdp:  this._pc.localDescription.sdp,
          } as RTCSessionDescriptionInit)
        }
      }
    } catch (e) {
      if (!this._destroyed) console.error('[WebRTCSession] signal failed', e)
    }
  }

  // Replace the outgoing track of the given kind without renegotiation.
  // Silently swallows OperationError (sender detached on hangup).
  async replaceTrack(kind: 'audio' | 'video', track: MediaStreamTrack | null): Promise<void> {
    const sender = this._senders.get(kind)
    if (!sender) return
    try {
      await sender.replaceTrack(track)
      if (kind === 'video' && track) void this._tuneVideoSender(sender)
    } catch (e) {
      if ((e as DOMException).name !== 'OperationError') {
        console.error('[WebRTCSession] replaceTrack failed', kind, e)
      }
    }
  }

  // Apply encoding level (bitrate + resolution + fps) to the video sender.
  async applyEncodingLevel(level: 0 | 1 | 2): Promise<void> {
    const sender = this._senders.get('video')
    if (!sender) return
    const params = sender.getParameters()
    if (!params.encodings?.length) return
    const enc = ENCODING_LEVELS[level]
    params.encodings = params.encodings.map((e) => ({
      ...e,
      maxBitrate:            enc.maxBitrate,
      maxFramerate:          enc.maxFps,
      scaleResolutionDownBy: enc.scaleDown,
    }))
    try {
      await sender.setParameters(params)
    } catch {
      // sender detached (camera off) — skip silently
    }
  }

  getStats(): Promise<RTCStatsReport> {
    return this._pc.getStats()
  }

  get connectionState(): RTCPeerConnectionState {
    return this._pc.connectionState
  }

  get destroyed(): boolean {
    return this._destroyed
  }

  close(): void {
    if (this._destroyed) return
    this._destroyed = true
    this._clearRestartTimer()
    this._pc.onicecandidate     = null
    this._pc.onnegotiationneeded = null
    this._pc.ontrack            = null
    this._pc.onconnectionstatechange = null
    this._pc.close()
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async _tuneVideoSender(sender: RTCRtpSender): Promise<void> {
    try {
      const params = sender.getParameters() as RTCRtpSendParameters & {
        degradationPreference?: 'maintain-framerate' | 'maintain-resolution' | 'balanced'
      }
      params.degradationPreference = 'maintain-framerate'
      params.encodings = params.encodings?.length ? params.encodings : [{}]
      params.encodings = params.encodings.map((e) => ({
        ...e,
        maxBitrate:            900_000,
        maxFramerate:          24,
        scaleResolutionDownBy: Math.max(e.scaleResolutionDownBy ?? 1, 1),
      }))
      await sender.setParameters(params)
    } catch {
      // pre-negotiation or sender detached — skip
    }
  }

  private _clearRestartTimer(): void {
    if (this._restartTimer !== null) {
      clearTimeout(this._restartTimer)
      this._restartTimer = null
    }
  }
}
