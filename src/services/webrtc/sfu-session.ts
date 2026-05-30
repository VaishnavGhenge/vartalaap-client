'use client'

import { BehaviorSubject, Subscription } from 'rxjs'
import { PartyTracks, type TrackMetadata } from 'partytracks/client'
import { httpServerUri } from '@/src/services/api/config'
import { apiBearerHeaders } from '@/src/services/api/fetch'

export interface SfuSessionOptions {
  roomId: string
  peerId: string
  iceServers: RTCIceServer[]
  // Called whenever a subscribed remote track produces a fresh MediaStreamTrack.
  // partytracks re-emits the track if the underlying PC is recreated.
  onRemoteTrack?: (track: MediaStreamTrack, sessionId: string, trackName: string) => void
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void
  // A pull that errored (SDP/ICE/CF 4xx). The track will never arrive — caller
  // should surface this, not just log it.
  onPullError?: (sessionId: string, trackName: string, err: unknown) => void
  // Dead-track detection: we subscribed to a remote track but no MediaStreamTrack
  // arrived within SFU_PULL_TIMEOUT_MS. The remote peer announced it (the server
  // broadcast sfu-tracks), the pull did not error, yet CF never forwarded media.
  // This is the "host enabled camera, guest never saw it" failure made explicit.
  onPullTimeout?: (sessionId: string, trackName: string) => void
}

// How long to wait for a subscribed remote track to produce its first
// MediaStreamTrack before treating the pull as dead. Sits just under the
// TTFM_TIMEOUT_MS (10s) call-setup ceiling so the per-track cause is recorded
// before the call-level timeout fires. See CLAUDE.md SFU failure paths:
// "Track pull timeout (remote track never arrives) → dead track detection".
const SFU_PULL_TIMEOUT_MS = 8_000

/**
 * Wraps partytracks for one local peer. One pubTracks instance (sendonly)
 * carries all outbound tracks. Subscribe-side uses ONE PartyTracks instance
 * PER REMOTE SESSION so that renegotiating Carol's subscribe session (adding
 * her tracks to our PC) never touches the existing Alice↔Bob subscribe
 * connection.
 *
 * With a shared subTracks instance (the previous design), every new
 * subscription triggered a full SDP renegotiation on the same PC. CF Realtime
 * would issue a new offer that covered ALL existing transceivers; if that offer
 * or the subsequent PUT /renegotiate was rejected (or caused an ICE restart),
 * every already-flowing pull was silently disrupted — the bug observed when a
 * 3rd peer joined an active call.
 *
 * Cost: up to N CF subscribe sessions per participant instead of 1. CF pricing
 * is per-minute-of-PC so at N=4 this is roughly 4× the subscribe-side cost.
 * The reliability gain — no cross-peer renegotiation interference — is the
 * correct trade-off at this scale.
 */
export class SfuSession {
  // Publish-only — all transceivers are sendonly. Owns the CF session whose
  // ID is broadcast to other peers so they can pull our tracks.
  private readonly pubTracks: PartyTracks

  // One subscribe-only PartyTracks per remote CF publish sessionId. Each has
  // its own RTCPeerConnection and CF session so renegotiations are isolated.
  // Lazily created on first subscribeTrack() call for a given remote session.
  private readonly subTracksMap = new Map<string, PartyTracks>()
  // Connection-state subscriptions for each per-session subTracks instance.
  private readonly subConnStateMap = new Map<string, Subscription>()

  // kind ('audio'|'video') → subject feeding the corresponding push.
  // Calling .next() on it makes partytracks replaceTrack the existing sender.
  private readonly localSubjects = new Map<string, BehaviorSubject<MediaStreamTrack>>()
  private readonly localPushSubs = new Map<string, Subscription>()
  // `${remoteSessionId}/${trackName}` → pull subscription.
  private readonly remotePullSubs = new Map<string, Subscription>()
  // `${remoteSessionId}/${trackName}` → dead-track timer. Set when a pull starts,
  // cleared on the first track it produces. If it fires, the track never arrived.
  private readonly pullTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly pubConnStateSub: Subscription

  private destroyed = false
  private readonly opts: SfuSessionOptions
  // Shared PartyTracks config reused for each per-session subTracks instance.
  private readonly subTracksConfig: ConstructorParameters<typeof PartyTracks>[0]

  constructor(opts: SfuSessionOptions) {
    this.opts = opts

    const headers = new Headers()
    const auth = apiBearerHeaders().Authorization
    if (auth) headers.set('Authorization', auth)

    const baseParams = `roomId=${encodeURIComponent(opts.roomId)}&peerId=${encodeURIComponent(opts.peerId)}`

    this.pubTracks = new PartyTracks({
      prefix: `${httpServerUri}/sfu`,
      apiExtraParams: `${baseParams}&kind=publish`,
      iceServers: opts.iceServers,
      headers,
    })

    // Shared config used when creating per-session subscribe PartyTracks.
    // kind=subscribe is purely diagnostic — the server logs use it to tell
    // publish and subscribe CF sessions apart.
    this.subTracksConfig = {
      prefix: `${httpServerUri}/sfu`,
      apiExtraParams: `${baseParams}&kind=subscribe`,
      iceServers: opts.iceServers,
      headers,
    }

    // Surface the publish PC going to failed. Callers don't need to
    // distinguish direction — a broken publish PC means no media is being
    // sent.
    this.pubConnStateSub = this.pubTracks.peerConnectionState$.subscribe((state) => {
      opts.onConnectionStateChange?.(state)
    })

    // Per-session subTracks instances are created lazily in subscribeTrack().
    // This keeps subscribe-side CF sessions from being allocated until there
    // is actually a remote peer to subscribe to.
  }

  // Pushes every track in the stream. Idempotent per kind — calling with a
  // new track of the same kind replaces the outbound track without
  // renegotiation (partytracks routes it through the existing transceiver).
  publish(stream: MediaStream): Promise<void> {
    for (const track of stream.getTracks()) {
      this.publishTrack(track)
    }
    return Promise.resolve()
  }

  // Single-track variant used by the camera/mic toggle paths in peer.ts.
  replaceTrack(_kind: string, track: MediaStreamTrack): Promise<void> {
    this.publishTrack(track)
    return Promise.resolve()
  }

  private publishTrack(track: MediaStreamTrack): void {
    if (this.destroyed) return
    const kind = track.kind
    const existing = this.localSubjects.get(kind)
    if (existing) {
      // Same kind already being pushed — feed the new track in. partytracks
      // replaces it on the transceiver, no new metadata emission needed.
      existing.next(track)
      return
    }
    const subject = new BehaviorSubject<MediaStreamTrack>(track)
    this.localSubjects.set(kind, subject)
    // Subscribe with an error handler so a silently-failing push (e.g. SDP
    // negotiation problem) surfaces in the console instead of masquerading as
    // "publish succeeded but no one sees the track".
    const sub = this.pubTracks.push(subject.asObservable()).subscribe({
      error: (err) => console.error(`[sfu] push(${kind}) errored`, err),
    })
    this.localPushSubs.set(kind, sub)
  }

  // Subscribes (pulls) one or more remote tracks announced by another peer.
  // trackNames come from the remote peer's publish session's metadata, which
  // the Go signaling server broadcasts on sfu-tracks.
  // Idempotent — repeated calls for the same (sessionId, trackName) are no-ops.
  subscribe(sessionId: string, trackNames: string[]): Promise<void> {
    for (const trackName of trackNames) {
      this.subscribeTrack(sessionId, trackName)
    }
    return Promise.resolve()
  }

  private subscribeTrack(sessionId: string, trackName: string): void {
    if (this.destroyed) return
    const key = `${sessionId}/${trackName}`
    if (this.remotePullSubs.has(key)) return

    // Get or create the subscribe-only PartyTracks for this remote session.
    // Each remote peer gets its own PC + CF session so renegotiations for one
    // peer never affect subscriptions to others.
    let subTracks = this.subTracksMap.get(sessionId)
    if (!subTracks) {
      subTracks = new PartyTracks(this.subTracksConfig)
      this.subTracksMap.set(sessionId, subTracks)
      // Monitor connection state for this per-session subscribe PC. Lazy: the
      // peerConnectionState$ subscription triggers /sessions/new + ICE only
      // when there is a real remote peer to subscribe to.
      const connStateSub = subTracks.peerConnectionState$.subscribe((state) => {
        this.opts.onConnectionStateChange?.(state)
      })
      this.subConnStateMap.set(sessionId, connStateSub)
    }

    const meta$ = new BehaviorSubject<TrackMetadata>({
      sessionId,
      trackName,
      location: 'remote',
    })

    // Arm dead-track detection. partytracks gives no signal for "pull issued,
    // CF accepted, but media never flows" — the pull observable simply never
    // emits. Without this timer that case hangs silently, which is precisely
    // how "host enabled camera, guest never saw it" goes uninstrumented.
    const deadTrackTimer = setTimeout(() => {
      this.pullTimers.delete(key)
      this.opts.onPullTimeout?.(sessionId, trackName)
    }, SFU_PULL_TIMEOUT_MS)
    this.pullTimers.set(key, deadTrackTimer)

    const clearPullTimer = () => {
      const t = this.pullTimers.get(key)
      if (t) { clearTimeout(t); this.pullTimers.delete(key) }
    }

    const track$ = subTracks.pull(meta$.asObservable())
    const sub = track$.subscribe({
      next: (track) => {
        // First media for this track — the pull is alive, disarm the watchdog.
        clearPullTimer()
        this.opts.onRemoteTrack?.(track, sessionId, trackName)
      },
      error: (err) => {
        clearPullTimer()
        console.error(`[sfu] pull(${sessionId}/${trackName}) errored`, err)
        this.opts.onPullError?.(sessionId, trackName, err)
      },
    })
    this.remotePullSubs.set(key, sub)
  }

  // Stops pulling every track from a remote session and closes that session's
  // subscribe PC. Called when a peer leaves so idle CF sessions are released.
  unsubscribePeer(sessionId: string): void {
    for (const [key, sub] of this.remotePullSubs) {
      if (key.startsWith(`${sessionId}/`)) {
        sub.unsubscribe()
        this.remotePullSubs.delete(key)
        const t = this.pullTimers.get(key)
        if (t) { clearTimeout(t); this.pullTimers.delete(key) }
      }
    }
    // Unsubscribing the connection-state monitor drops the last reference to
    // this session's PartyTracks, which closes its underlying PC via refCount.
    const connStateSub = this.subConnStateMap.get(sessionId)
    if (connStateSub) {
      connStateSub.unsubscribe()
      this.subConnStateMap.delete(sessionId)
    }
    this.subTracksMap.delete(sessionId)
  }

  close(): void {
    if (this.destroyed) return
    this.destroyed = true
    for (const sub of this.localPushSubs.values()) sub.unsubscribe()
    for (const sub of this.remotePullSubs.values()) sub.unsubscribe()
    for (const sub of this.subConnStateMap.values()) sub.unsubscribe()
    for (const t of this.pullTimers.values()) clearTimeout(t)
    this.pubConnStateSub.unsubscribe()
    this.localSubjects.clear()
    this.localPushSubs.clear()
    this.remotePullSubs.clear()
    this.pullTimers.clear()
    this.subTracksMap.clear()
    this.subConnStateMap.clear()
  }
}
