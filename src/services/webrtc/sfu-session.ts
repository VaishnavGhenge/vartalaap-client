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
}

/**
 * Wraps two partytracks instances — one publish-only, one subscribe-only — so
 * each underlying RTCPeerConnection only carries transceivers in a single
 * direction. Mixing sendonly and recvonly transceivers in one PC produces SDP
 * answers from Cloudflare Realtime that Chrome's WebRTC stack rejects with
 * `ERROR_CONTENT: Failed to set remote video description send parameters for
 * m-section with mid='N'`, which we hit when a peer who joined without media
 * later enabled their camera.
 *
 * Cost: 2 CF sessions per participant instead of 1 — the Cloudflare Realtime
 * pricing is per-minute-of-PC so this roughly doubles SFU billing per peer.
 * Reliability gain: every renegotiation is direction-pure and never trips the
 * mixed-direction validator.
 */
export class SfuSession {
  // Publish-only — all transceivers are sendonly. Owns the CF session whose
  // ID is broadcast to other peers so they can pull our tracks.
  private readonly pubTracks: PartyTracks
  // Subscribe-only — all transceivers are recvonly. Pulls remote tracks from
  // other peers' publish sessions.
  private readonly subTracks: PartyTracks

  // kind ('audio'|'video') → subject feeding the corresponding push.
  // Calling .next() on it makes partytracks replaceTrack the existing sender.
  private readonly localSubjects = new Map<string, BehaviorSubject<MediaStreamTrack>>()
  private readonly localPushSubs = new Map<string, Subscription>()
  // `${remoteSessionId}/${trackName}` → pull subscription.
  private readonly remotePullSubs = new Map<string, Subscription>()
  private readonly pubConnStateSub: Subscription
  // subConnStateSub is attached lazily on first subscribe() call. See the
  // "lazy subscribe-session" note in the constructor.
  private subConnStateSub: Subscription | null = null

  private destroyed = false
  private readonly opts: SfuSessionOptions

  constructor(opts: SfuSessionOptions) {
    this.opts = opts

    const headers = new Headers()
    const auth = apiBearerHeaders().Authorization
    if (auth) headers.set('Authorization', auth)

    const baseParams = `roomId=${encodeURIComponent(opts.roomId)}&peerId=${encodeURIComponent(opts.peerId)}`

    // The `kind` param is purely diagnostic on the server side — it makes
    // logs distinguish the two sessions for this peer. The server treats both
    // sessions identically; the registry maps each CF session ID back to the
    // same (roomId, peerId).
    this.pubTracks = new PartyTracks({
      prefix: `${httpServerUri}/sfu`,
      apiExtraParams: `${baseParams}&kind=publish`,
      iceServers: opts.iceServers,
      headers,
    })
    this.subTracks = new PartyTracks({
      prefix: `${httpServerUri}/sfu`,
      apiExtraParams: `${baseParams}&kind=subscribe`,
      iceServers: opts.iceServers,
      headers,
    })

    // Surface the publish PC going to failed. Callers don't need to
    // distinguish direction — a broken publish PC means no media is being
    // sent.
    this.pubConnStateSub = this.pubTracks.peerConnectionState$.subscribe((state) => {
      opts.onConnectionStateChange?.(state)
    })

    // IMPORTANT: do NOT subscribe to subTracks.peerConnectionState$ here.
    // Subscribing eagerly triggers partytracks to call /sessions/new and
    // create the subscribe-side RTCPeerConnection upfront. When the local
    // peer joins alone and stays alone, this PC has no transceivers, so it
    // never goes through SDP/ICE; Cloudflare Realtime's server-side session
    // for it sits unestablished and gets reaped after a few minutes. The
    // next time a remote peer publishes and we try to .pull() through this
    // session, CF returns 410 "Session appears to be disconnected" and
    // partytracks' retry-with-backoff cannot recover (the same sessionId
    // gets reused on retry, same 410).
    //
    // Lazy creation: first call to subscribe() triggers the first .pull(),
    // which subscribes to session$, which posts /sessions/new and creates a
    // fresh PC. Because we add a recvonly transceiver immediately, ICE
    // establishes, and CF keeps the session alive via standard PC heartbeats.
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
    // First subscribe activates the connection-state monitor. Doing this
    // here rather than in the constructor keeps the subscribe-side CF
    // session lazy — see the note in the constructor.
    if (!this.subConnStateSub) {
      this.subConnStateSub = this.subTracks.peerConnectionState$.subscribe((state) => {
        this.opts.onConnectionStateChange?.(state)
      })
    }
    const meta$ = new BehaviorSubject<TrackMetadata>({
      sessionId,
      trackName,
      location: 'remote',
    })
    const track$ = this.subTracks.pull(meta$.asObservable())
    const sub = track$.subscribe({
      next: (track) => {
        this.opts.onRemoteTrack?.(track, sessionId, trackName)
      },
      error: (err) => console.error(`[sfu] pull(${sessionId}/${trackName}) errored`, err),
    })
    this.remotePullSubs.set(key, sub)
  }

  // Stops pulling every track from a remote session. Used when a peer leaves
  // so we don't keep idle pulls open against CF.
  unsubscribePeer(sessionId: string): void {
    for (const [key, sub] of this.remotePullSubs) {
      if (key.startsWith(`${sessionId}/`)) {
        sub.unsubscribe()
        this.remotePullSubs.delete(key)
      }
    }
  }

  close(): void {
    if (this.destroyed) return
    this.destroyed = true
    for (const sub of this.localPushSubs.values()) sub.unsubscribe()
    for (const sub of this.remotePullSubs.values()) sub.unsubscribe()
    this.pubConnStateSub.unsubscribe()
    this.subConnStateSub?.unsubscribe()
    this.localSubjects.clear()
    this.localPushSubs.clear()
    this.remotePullSubs.clear()
  }
}
