'use client'

import { BehaviorSubject, Subscription } from 'rxjs'
import { PartyTracks, type TrackMetadata } from 'partytracks/client'
import { httpServerUri } from '@/src/services/api/config'
import { apiBearerHeaders } from '@/src/services/api/fetch'
import { subscribeTokenChange } from '@/src/services/api/token'
import type { SfuTracksData } from '@/src/services/signaling/protocol'
import { callDebug } from '@/src/lib/call-debug'

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
  // Fired whenever the set of locally published tracks changes: first CF ack
  // of a pushed kind, or partytracks re-pushing after a PC recreation under a
  // new CF sessionId. Payload is the FULL current set — the caller forwards it
  // to the signaling server (sfu-announce) so the room's stored track set
  // stays in sync even when the original tracks/new broadcast was lost.
  onLocalTracksChanged?: (announcement: SfuTracksData) => void
  // A pushed track got no CF acknowledgment within SFU_PUSH_TIMEOUT_MS.
  // partytracks retries silently forever, so without this the "I turned my
  // camera on but nobody sees me" case never surfaces to the user.
  onPublishTimeout?: (kind: string) => void
}

// How long to wait for a subscribed remote track to produce its first
// MediaStreamTrack before treating the pull as dead. Sits just under the
// TTFM_TIMEOUT_MS (10s) call-setup ceiling so the per-track cause is recorded
// before the call-level timeout fires. See CLAUDE.md SFU failure paths:
// "Track pull timeout (remote track never arrives) → dead track detection".
const SFU_PULL_TIMEOUT_MS = 8_000

// How long to wait for CF to acknowledge a pushed track (the TrackMetadata
// emission from partytracks) before surfacing the stall. partytracks keeps
// retrying with backoff after this fires — the timeout exists to tell the
// user, not to abort the push.
const SFU_PUSH_TIMEOUT_MS = 8_000

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
  // kind → last CF acknowledgment for that push. Together these form the
  // announcement re-sent to the signaling server after a reconnect — the
  // only durable record of what we publish.
  private readonly publishedMeta = new Map<string, { sessionId: string; trackName: string }>()
  // CF sessionId of the most recent push ack. After a PC recreation the kinds
  // re-ack one at a time under the new sessionId; announcements only include
  // tracks already acked on this session (the rest follow moments later).
  private lastPubSessionId: string | null = null
  private lastAnnouncedJson = ''
  // kind → stall timer armed at push start, cleared on the first CF ack.
  private readonly pushAckTimers = new Map<string, ReturnType<typeof setTimeout>>()
  // `${remoteSessionId}/${trackName}` → pull subscription.
  private readonly remotePullSubs = new Map<string, Subscription>()
  // `${remoteSessionId}/${trackName}` → dead-track timer. Set when a pull starts,
  // cleared on the first track it produces. If it fires, the track never arrived.
  private readonly pullTimers = new Map<string, ReturnType<typeof setTimeout>>()
  // Subscribed lazily on the first publishTrack() call so that the underlying
  // PartyTracks session$ (and therefore the CF session POST /sessions/new) is
  // not created until there is actual media to push. Eagerly subscribing here
  // allocates an idle CF session that CF times out with session_error (410)
  // if the user joined muted and takes longer than ~30s to unmute — causing
  // every subsequent tracks/new to fail permanently.
  private pubConnStateSub: Subscription | null = null

  private destroyed = false
  private readonly opts: SfuSessionOptions
  // Shared PartyTracks config reused for each per-session subTracks instance.
  private readonly subTracksConfig: ConstructorParameters<typeof PartyTracks>[0]

  // Single live Headers instance shared by the publish and every subscribe
  // PartyTracks. partytracks reads config.headers on EVERY request, so
  // updating this object (on token refresh/re-login) means all SFU requests —
  // including partytracks' internal retries — carry the current token. A
  // header snapshotted at construction goes stale after the 15-minute access
  // TTL and turns every later SFU request into a permanent 401.
  private readonly authHeaders = new Headers()
  private readonly unsubscribeTokenChange: () => void

  constructor(opts: SfuSessionOptions) {
    this.opts = opts

    this.syncAuthHeader()
    this.unsubscribeTokenChange = subscribeTokenChange(() => this.syncAuthHeader())

    const baseParams = `roomId=${encodeURIComponent(opts.roomId)}&peerId=${encodeURIComponent(opts.peerId)}`

    this.pubTracks = new PartyTracks({
      prefix: `${httpServerUri}/sfu`,
      apiExtraParams: `${baseParams}&kind=publish`,
      iceServers: opts.iceServers,
      headers: this.authHeaders,
    })

    // Shared config used when creating per-session subscribe PartyTracks.
    // kind=subscribe is purely diagnostic — the server logs use it to tell
    // publish and subscribe CF sessions apart.
    this.subTracksConfig = {
      prefix: `${httpServerUri}/sfu`,
      apiExtraParams: `${baseParams}&kind=subscribe`,
      iceServers: opts.iceServers,
      headers: this.authHeaders,
    }

    // pubConnStateSub is wired lazily in publishTrack() — see field comment.

    // Per-session subTracks instances are created lazily in subscribeTrack().
    // This keeps subscribe-side CF sessions from being allocated until there
    // is actually a remote peer to subscribe to.
  }

  private syncAuthHeader(): void {
    const auth = apiBearerHeaders().Authorization
    if (auth) this.authHeaders.set('Authorization', auth)
    else this.authHeaders.delete('Authorization')
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
      callDebug.sfuPushReplace(kind)
      existing.next(track)
      return
    }
    // First track of any kind: subscribe to the publish PC state now. This is
    // the moment that triggers CF session creation, so it happens right before
    // the first tracks/new — not up to minutes earlier in the constructor.
    if (!this.pubConnStateSub) {
      this.pubConnStateSub = this.pubTracks.peerConnectionState$.subscribe((state) => {
        callDebug.sfuConnState('pub', state)
        this.opts.onConnectionStateChange?.(state)
      })
    }
    callDebug.sfuPushStart(kind)
    // Arm stall detection before the push. partytracks retries failures
    // internally with infinite backoff, so a push that can't reach CF looks
    // identical to one that's about to succeed — only the missing ack tells
    // them apart.
    const ackTimer = setTimeout(() => {
      this.pushAckTimers.delete(kind)
      callDebug.sfuPushTimeout(kind)
      this.opts.onPublishTimeout?.(kind)
    }, SFU_PUSH_TIMEOUT_MS)
    this.pushAckTimers.set(kind, ackTimer)

    const subject = new BehaviorSubject<MediaStreamTrack>(track)
    this.localSubjects.set(kind, subject)
    const sub = this.pubTracks.push(subject.asObservable()).subscribe({
      // CF acked the push (also re-fires when partytracks re-pushes after a
      // PC recreation, with a new sessionId). Record it and re-announce.
      next: (meta) => {
        this.clearPushAckTimer(kind)
        // TrackMetadata types these as optional, but a push ack always
        // carries both — guard rather than store an unusable entry.
        if (!meta.sessionId || !meta.trackName) return
        callDebug.sfuPushAcked(kind, meta.sessionId, meta.trackName)
        this.publishedMeta.set(kind, { sessionId: meta.sessionId, trackName: meta.trackName })
        this.lastPubSessionId = meta.sessionId
        this.emitLocalTracksChanged()
      },
      error: (err) => {
        this.clearPushAckTimer(kind)
        console.error(`[sfu] push(${kind}) errored`, err)
        callDebug.sfuPushError(kind, err)
        // A terminal push error ends the pipeline — leaving the dead subject
        // in place would turn every later toggle of this kind into a silent
        // no-op (subject.next into a completed stream). Drop the bookkeeping
        // so the next enableMic/enableCamera re-creates the push.
        this.localSubjects.delete(kind)
        this.localPushSubs.delete(kind)
        this.publishedMeta.delete(kind)
      },
    })
    this.localPushSubs.set(kind, sub)
  }

  private clearPushAckTimer(kind: string): void {
    const t = this.pushAckTimers.get(kind)
    if (t) { clearTimeout(t); this.pushAckTimers.delete(kind) }
  }

  // The full set of tracks this peer currently publishes, as last acked by
  // CF. Null until the first ack. use-call re-sends this via sfu-announce
  // after a signaling reconnect — the server wiped its stored copy when the
  // old connection dropped, and the re-publish on reconnect is a no-op at the
  // HTTP level, so this is the only path that restores it.
  getLocalTracksAnnouncement(): SfuTracksData | null {
    if (!this.lastPubSessionId) return null
    const tracks = [...this.publishedMeta.values()]
      .filter((m) => m.sessionId === this.lastPubSessionId)
      .map((m) => ({ trackName: m.trackName }))
      .sort((a, b) => a.trackName.localeCompare(b.trackName))
    if (tracks.length === 0) return null
    return { sessionId: this.lastPubSessionId, tracks }
  }

  private emitLocalTracksChanged(): void {
    const announcement = this.getLocalTracksAnnouncement()
    if (!announcement) return
    // Acks re-fire on every local replaceTrack with unchanged metadata —
    // dedupe so the signaling channel only sees real changes.
    const json = JSON.stringify(announcement)
    if (json === this.lastAnnouncedJson) return
    this.lastAnnouncedJson = json
    this.opts.onLocalTracksChanged?.(announcement)
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
    if (this.remotePullSubs.has(key)) {
      callDebug.sfuSubscribeSkipped(sessionId, trackName)
      return
    }

    // Get or create the subscribe-only PartyTracks for this remote session.
    // Each remote peer gets its own PC + CF session so renegotiations for one
    // peer never affect subscriptions to others.
    let subTracks = this.subTracksMap.get(sessionId)
    if (!subTracks) {
      subTracks = new PartyTracks(this.subTracksConfig)
      this.subTracksMap.set(sessionId, subTracks)
      const connStateSub = subTracks.peerConnectionState$.subscribe((state) => {
        callDebug.sfuConnState(`sub:${sessionId.slice(0, 8)}`, state)
        this.opts.onConnectionStateChange?.(state)
      })
      this.subConnStateMap.set(sessionId, connStateSub)
    }

    callDebug.sfuSubscribeStart(sessionId, trackName)

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
      callDebug.sfuPullTimeout(sessionId, trackName)
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
        clearPullTimer()
        callDebug.sfuTrackArrived(sessionId, trackName, track.kind)
        this.opts.onRemoteTrack?.(track, sessionId, trackName)
      },
      error: (err) => {
        clearPullTimer()
        console.error(`[sfu] pull(${sessionId}/${trackName}) errored`, err)
        callDebug.sfuPullError(sessionId, trackName, err)
        this.opts.onPullError?.(sessionId, trackName, err)
      },
    })
    this.remotePullSubs.set(key, sub)
  }

  // Stops pulling every track from a remote session and closes that session's
  // subscribe PC. Called when a peer leaves so idle CF sessions are released.
  unsubscribePeer(sessionId: string): void {
    callDebug.sfuUnsubscribePeer(sessionId)
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
    callDebug.sfuClose()
    this.destroyed = true
    for (const sub of this.localPushSubs.values()) sub.unsubscribe()
    for (const sub of this.remotePullSubs.values()) sub.unsubscribe()
    for (const sub of this.subConnStateMap.values()) sub.unsubscribe()
    for (const t of this.pullTimers.values()) clearTimeout(t)
    for (const t of this.pushAckTimers.values()) clearTimeout(t)
    this.pubConnStateSub?.unsubscribe()
    this.unsubscribeTokenChange()
    this.localSubjects.clear()
    this.localPushSubs.clear()
    this.publishedMeta.clear()
    this.pushAckTimers.clear()
    this.remotePullSubs.clear()
    this.pullTimers.clear()
    this.subTracksMap.clear()
    this.subConnStateMap.clear()
  }
}
