'use client'

import { BehaviorSubject, Subscription } from 'rxjs'
import { PartyTracks, type TrackMetadata } from 'partytracks/client'
import { httpServerUri } from '@/src/services/api/config'
import { apiBearerHeaders } from '@/src/services/api/fetch'
import { subscribeTokenChange } from '@/src/services/api/token'
import type { SfuTracksData } from '@/src/services/signaling/protocol'
import type { FlowKind, StatsSource } from '@/src/services/webrtc/stats-monitor'
import { RepairLoop } from '@/src/services/webrtc/repair-loop'
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
  // arrived within SFU_PULL_REPAIR_AFTER_MS. The remote peer announced it (the server
  // broadcast sfu-tracks), the pull did not error, yet CF never forwarded media.
  // This is the "host enabled camera, guest never saw it" failure made explicit.
  onPullTimeout?: (sessionId: string, trackName: string) => void
  // Fired whenever the set of locally published tracks changes: first CF ack
  // of a pushed kind, or partytracks re-pushing after a PC recreation under a
  // new CF sessionId. Payload is the FULL current set — the caller forwards it
  // to the signaling server (sfu-announce) so the room's stored track set
  // stays in sync even when the original tracks/new broadcast was lost.
  onLocalTracksChanged?: (announcement: SfuTracksData) => void
  // A pushed track got no CF acknowledgment within SFU_PUSH_REPAIR_AFTER_MS.
  // Fires once per detection, before the repair ladder starts. The user-facing
  // message belongs here; the repair itself is automatic.
  onPublishTimeout?: (kind: string) => void
  // A repair attempt is running. `rung` says how far it escalated, which is
  // the number worth counting: rung 1 fixing things is a healthy system,
  // everything reaching rung 2 means the cheap retry never works.
  onRepair?: (info: RepairInfo) => void
  // Media is flowing again after at least one repair attempt. Pairs with
  // onRepair to answer "did self-healing actually heal anything".
  onRepaired?: (info: RepairInfo) => void
}

export interface RepairInfo {
  stage: 'publish' | 'subscribe'
  /** 1 = retry in place. 2 = rebuild this direction's CF session. */
  rung: number
  attempt: number
  kind?: string
  sessionId?: string
  trackName?: string
}

// These two are REPAIR TRIGGERS, not verdicts, and they are deliberately
// decoupled from the SLO numbers in CLAUDE.md.
//
// They used to sit at 8s "just under the 10s TTFM ceiling", which tied how long
// we wait before fixing something to how long we consider a call fast. Those
// are different questions. The only thing that matters here is how long a
// track can plausibly be in flight before retrying is worth the cost, and the
// answer is a few seconds: a pull or push that has not produced anything in
// four is not about to.
//
// Making them shorter is now safe precisely because they no longer end
// anything. A premature trigger costs one cheap retry (repair rung 1), where
// before it would have burned the call's only detection.
const SFU_PULL_REPAIR_AFTER_MS = 4_000
const SFU_PUSH_REPAIR_AFTER_MS = 4_000

// Highest repair rung either direction escalates to:
//   1 — retry the push/pull in place, against the same CF session
//   2 — rebuild this direction's PartyTracks, which means a fresh CF session
// Rung 3 and beyond (ICE restart, room resync, telling the user) are the
// reconciler's job and are not implemented yet.
const MAX_REPAIR_RUNG = 2

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
  // ID is broadcast to other peers so they can pull our tracks. Not readonly:
  // repair rung 2 replaces the instance to get a fresh CF session.
  private pubTracks: PartyTracks

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
  // kind → the track currently meant to be going out. Held separately from the
  // subject because a repair tears the subject down and needs to know what to
  // push again.
  private readonly localTracks = new Map<string, MediaStreamTrack>()
  // kind → repair ladder for that push. Armed on ack timeout or push error,
  // reset on ack.
  private readonly pushRepairs = new Map<string, RepairLoop>()
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
  // `${remoteSessionId}/${trackName}` → repair ladder for that pull.
  private readonly pullRepairs = new Map<string, RepairLoop>()
  // 'pub' | `sub:${sessionId}` → repair ladder for that direction's PC. Push
  // and pull ack timers fire once at setup, so nothing else notices a PC that
  // fails later — the network-switch case, where the tab and signaling are
  // fine and only media is dead.
  private readonly pcRepairs = new Map<string, RepairLoop>()
  // remote sessionId → the track names we are meant to be pulling from it.
  // Repair rung 2 throws away the subscribe PartyTracks for a session, and
  // this is what tells it which pulls to re-establish on the new one.
  private readonly subSessionTracks = new Map<string, Set<string>>()
  // Subscribed lazily on the first publishTrack() call so that the underlying
  // PartyTracks session$ (and therefore the CF session POST /sessions/new) is
  // not created until there is actual media to push. Eagerly subscribing here
  // allocates an idle CF session that CF times out with session_error (410)
  // if the user joined muted and takes longer than ~30s to unmute — causing
  // every subsequent tracks/new to fail permanently.
  private pubConnStateSub: Subscription | null = null

  // Live RTCPeerConnection references, tracked purely so collectStats() can
  // poll them. Direct PC access stays inside this class (client CLAUDE.md) —
  // callers get RTCStatsReports, never the connection. Both subscriptions are
  // wired in the same lazy spots as the connection-state ones, because
  // subscribing to a partytracks observable is itself what creates the CF
  // session; doing it eagerly allocates a session CF then times out.
  private pubPc: RTCPeerConnection | null = null
  private pubPcSub: Subscription | null = null
  private readonly subPcs = new Map<string, RTCPeerConnection>()
  private readonly subPcSubs = new Map<string, Subscription>()

  private destroyed = false
  private readonly opts: SfuSessionOptions
  // Shared PartyTracks config reused for each per-session subTracks instance.
  private readonly subTracksConfig: ConstructorParameters<typeof PartyTracks>[0]
  // Kept so repair rung 2 can rebuild the publish instance identically.
  private readonly pubTracksConfig: ConstructorParameters<typeof PartyTracks>[0]

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

    this.pubTracksConfig = {
      prefix: `${httpServerUri}/sfu`,
      apiExtraParams: `${baseParams}&kind=publish`,
      iceServers: opts.iceServers,
      headers: this.authHeaders,
    }
    this.pubTracks = new PartyTracks(this.pubTracksConfig)

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
    this.localTracks.set(kind, track)
    const existing = this.localSubjects.get(kind)
    if (existing) {
      callDebug.sfuPushReplace(kind)
      existing.next(track)
      return
    }
    this.startPush(kind, track)
  }

  /**
   * Wires one kind's push and arms stall detection. Separate from
   * publishTrack() because repair rung 1 re-runs exactly this, and because the
   * lazy PC subscriptions below must happen on the first push of the SESSION,
   * not the first push of a kind.
   */
  private startPush(kind: string, track: MediaStreamTrack): void {
    if (this.destroyed) return
    // First track of any kind: subscribe to the publish PC state now. This is
    // the moment that triggers CF session creation, so it happens right before
    // the first tracks/new — not up to minutes earlier in the constructor.
    if (!this.pubConnStateSub) {
      this.pubConnStateSub = this.pubTracks.peerConnectionState$.subscribe((state) => {
        this.onPcState('pub', 'pub', 'publish', state, () => this.resetPubTracks())
      })
      // Re-emits on every PC recreation, so this always holds the live one.
      this.pubPcSub = this.pubTracks.peerConnection$.subscribe((pc) => {
        this.pubPc = pc
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
      // The timeout is now a repair trigger, not a verdict. Before this, the
      // only response was a toast saying "still retrying" while nothing in our
      // layer actually retried.
      this.pushRepair(kind).schedule()
    }, SFU_PUSH_REPAIR_AFTER_MS)
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
        this.settlePushRepair(kind)
        this.emitLocalTracksChanged()
      },
      error: (err) => {
        this.clearPushAckTimer(kind)
        console.error(`[sfu] push(${kind}) errored`, err)
        callDebug.sfuPushError(kind, err)
        // A terminal push error ends the pipeline — leaving the dead subject
        // in place would turn every later toggle of this kind into a silent
        // no-op (subject.next into a completed stream). Drop the bookkeeping
        // so both the repair below and any later enableMic/enableCamera
        // re-create the push from scratch.
        this.teardownPush(kind)
        this.publishedMeta.delete(kind)
        this.pushRepair(kind).schedule()
      },
    })
    this.localPushSubs.set(kind, sub)
  }

  private pushRepair(kind: string): RepairLoop {
    let loop = this.pushRepairs.get(kind)
    if (!loop) {
      loop = new RepairLoop({
        maxRung: MAX_REPAIR_RUNG,
        repair: (rung, attempt) => {
          if (this.destroyed) return
          this.opts.onRepair?.({ stage: 'publish', rung, attempt, kind })
          callDebug.sfuRepair('publish', rung, attempt, kind)
          if (rung >= 2) this.resetPubTracks()
          else this.repush(kind)
        },
      })
      this.pushRepairs.set(kind, loop)
    }
    return loop
  }

  /** An ack landed. If we had been repairing, that repair is what fixed it. */
  private settlePushRepair(kind: string): void {
    const loop = this.pushRepairs.get(kind)
    if (!loop?.repairing) return
    this.opts.onRepaired?.({ stage: 'publish', rung: loop.nextRung, attempt: loop.attempts, kind })
    callDebug.sfuRepaired('publish', loop.attempts, kind)
    loop.reset()
  }

  /** Rung 1: tear the push down and re-push the same track, same CF session. */
  private repush(kind: string): void {
    const track = this.localTracks.get(kind)
    // The user turned this kind off while we were backing off. Nothing to
    // repair — a stopped track is the desired state, not a failure.
    if (!track || track.readyState !== 'live') {
      this.pushRepairs.get(kind)?.reset()
      return
    }
    this.teardownPush(kind)
    this.startPush(kind, track)
  }

  /**
   * Rung 2: throw away the publish PartyTracks and build a new one, which
   * gets a fresh CF session and a fresh RTCPeerConnection, then re-push every
   * kind that should be going out.
   *
   * Safe because a re-ack under a new sessionId is already a normal path:
   * partytracks does the same thing on its own when the PC dies, and the
   * announcement logic follows the newest session by design.
   */
  private resetPubTracks(): void {
    if (this.destroyed) return
    callDebug.sfuPubReset()
    const kinds = [...this.localSubjects.keys()]
    for (const kind of kinds) this.teardownPush(kind)
    // Dropping every subscription releases the old PartyTracks, which closes
    // its PC and CF session by refCount.
    this.pubConnStateSub?.unsubscribe()
    this.pubPcSub?.unsubscribe()
    this.pubConnStateSub = null
    this.pubPcSub = null
    this.pubPc = null
    // The old session's track names are unpullable now. Clearing them stops
    // getLocalTracksAnnouncement from advertising names nobody can subscribe
    // to until the new acks land.
    this.publishedMeta.clear()
    this.lastPubSessionId = null
    this.pubTracks = new PartyTracks(this.pubTracksConfig)
    for (const [kind, track] of this.localTracks) {
      if (track.readyState === 'live') this.startPush(kind, track)
    }
  }

  /** Drops one kind's push wiring without forgetting what should be sent. */
  private teardownPush(kind: string): void {
    this.clearPushAckTimer(kind)
    this.localPushSubs.get(kind)?.unsubscribe()
    this.localPushSubs.delete(kind)
    this.localSubjects.delete(kind)
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

    let names = this.subSessionTracks.get(sessionId)
    if (!names) {
      names = new Set()
      this.subSessionTracks.set(sessionId, names)
    }
    names.add(trackName)

    if (this.remotePullSubs.has(key)) {
      // Already pulling. If it is currently broken, a fresh announcement for
      // the same track is a reason to try again NOW rather than wait out the
      // backoff: the publisher re-announcing usually means their side just
      // came back. Previously this branch returned unconditionally, which is
      // what made a dead track permanent for the rest of the call.
      const loop = this.pullRepairs.get(key)
      if (loop?.repairing) {
        callDebug.sfuSubscribeRetryOnAnnounce(sessionId, trackName)
        this.repull(sessionId, trackName)
        return
      }
      callDebug.sfuSubscribeSkipped(sessionId, trackName)
      return
    }

    this.startPull(sessionId, trackName)
  }

  /** Wires one pull and arms dead-track detection. Re-run by repair rung 1. */
  private startPull(sessionId: string, trackName: string): void {
    if (this.destroyed) return
    const key = `${sessionId}/${trackName}`

    // Get or create the subscribe-only PartyTracks for this remote session.
    // Each remote peer gets its own PC + CF session so renegotiations for one
    // peer never affect subscriptions to others.
    let subTracks = this.subTracksMap.get(sessionId)
    if (!subTracks) {
      subTracks = new PartyTracks(this.subTracksConfig)
      this.subTracksMap.set(sessionId, subTracks)
      const connStateSub = subTracks.peerConnectionState$.subscribe((state) => {
        this.onPcState(
          `sub:${sessionId}`, `sub:${sessionId.slice(0, 8)}`, 'subscribe',
          state, () => this.resetSubSession(sessionId),
        )
      })
      this.subConnStateMap.set(sessionId, connStateSub)
      this.subPcSubs.set(sessionId, subTracks.peerConnection$.subscribe((pc) => {
        this.subPcs.set(sessionId, pc)
      }))
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
      this.pullRepair(sessionId, trackName).schedule()
    }, SFU_PULL_REPAIR_AFTER_MS)
    this.pullTimers.set(key, deadTrackTimer)

    const track$ = subTracks.pull(meta$.asObservable())
    const sub = track$.subscribe({
      next: (track) => {
        this.clearPullTimer(key)
        callDebug.sfuTrackArrived(sessionId, trackName, track.kind)
        this.settlePullRepair(sessionId, trackName)
        this.opts.onRemoteTrack?.(track, sessionId, trackName)
      },
      error: (err) => {
        this.clearPullTimer(key)
        console.error(`[sfu] pull(${sessionId}/${trackName}) errored`, err)
        callDebug.sfuPullError(sessionId, trackName, err)
        this.opts.onPullError?.(sessionId, trackName, err)
        // An errored observable is terminal: without a repair this track can
        // never arrive, no matter how many times the publisher re-announces.
        this.pullRepair(sessionId, trackName).schedule()
      },
    })
    this.remotePullSubs.set(key, sub)
  }

  private onPcState(
    key: string,
    label: string,
    stage: 'publish' | 'subscribe',
    state: RTCPeerConnectionState,
    rebuild: () => void,
  ): void {
    callDebug.sfuConnState(label, state)
    this.opts.onConnectionStateChange?.(state)
    const loop = this.pcRepairs.get(key)
    if (state === 'connected') {
      if (loop?.repairing) {
        this.opts.onRepaired?.({ stage, rung: 2, attempt: loop.attempts })
        callDebug.sfuRepaired(stage, loop.attempts, label)
        loop.reset()
      }
      return
    }
    if (state !== 'failed') return
    this.pcRepair(key, label, stage, rebuild).schedule()
  }

  // One rung, reported as rung 2: retrying a push or pull over a dead
  // connection cannot work, so rebuilding is the only repair available.
  private pcRepair(
    key: string,
    label: string,
    stage: 'publish' | 'subscribe',
    rebuild: () => void,
  ): RepairLoop {
    let loop = this.pcRepairs.get(key)
    if (!loop) {
      loop = new RepairLoop({
        maxRung: 1,
        attemptsPerRung: 1,
        repair: (_rung, attempt) => {
          if (this.destroyed) return
          callDebug.sfuPcFailed(label)
          this.opts.onRepair?.({ stage, rung: 2, attempt })
          rebuild()
        },
      })
      this.pcRepairs.set(key, loop)
    }
    return loop
  }

  private pullRepair(sessionId: string, trackName: string): RepairLoop {
    const key = `${sessionId}/${trackName}`
    let loop = this.pullRepairs.get(key)
    if (!loop) {
      loop = new RepairLoop({
        maxRung: MAX_REPAIR_RUNG,
        repair: (rung, attempt) => {
          if (this.destroyed) return
          this.opts.onRepair?.({ stage: 'subscribe', rung, attempt, sessionId, trackName })
          callDebug.sfuRepair('subscribe', rung, attempt, `${sessionId}/${trackName}`)
          if (rung >= 2) this.resetSubSession(sessionId)
          else this.repull(sessionId, trackName)
        },
      })
      this.pullRepairs.set(key, loop)
    }
    return loop
  }

  /** A track arrived. If we had been repairing, that repair is what fixed it. */
  private settlePullRepair(sessionId: string, trackName: string): void {
    const loop = this.pullRepairs.get(`${sessionId}/${trackName}`)
    if (!loop?.repairing) return
    this.opts.onRepaired?.({ stage: 'subscribe', rung: loop.nextRung, attempt: loop.attempts, sessionId, trackName })
    callDebug.sfuRepaired('subscribe', loop.attempts, `${sessionId}/${trackName}`)
    loop.reset()
  }

  /** Rung 1: re-issue the pull on the existing subscribe session. */
  private repull(sessionId: string, trackName: string): void {
    const key = `${sessionId}/${trackName}`
    this.clearPullTimer(key)
    this.remotePullSubs.get(key)?.unsubscribe()
    this.remotePullSubs.delete(key)
    this.startPull(sessionId, trackName)
  }

  /**
   * Rung 2: throw away this remote peer's subscribe PartyTracks and rebuild
   * it, then re-pull every track we should be receiving from them. Isolated to
   * one peer by the per-session design, so a rebuild for Carol cannot disturb
   * media already flowing from Bob.
   */
  private resetSubSession(sessionId: string): void {
    if (this.destroyed) return
    const names = [...(this.subSessionTracks.get(sessionId) ?? [])]
    callDebug.sfuSubReset(sessionId, names)
    for (const trackName of names) {
      const key = `${sessionId}/${trackName}`
      this.clearPullTimer(key)
      this.remotePullSubs.get(key)?.unsubscribe()
      this.remotePullSubs.delete(key)
    }
    this.disposeSubSession(sessionId)
    for (const trackName of names) this.startPull(sessionId, trackName)
  }

  /**
   * Releases one remote session's subscribe PartyTracks. Every subscription
   * counts as a reference and partytracks closes the PC — and the billed CF
   * session — only when the last one goes, so all three must be dropped.
   */
  private disposeSubSession(sessionId: string): void {
    this.subConnStateMap.get(sessionId)?.unsubscribe()
    this.subConnStateMap.delete(sessionId)
    this.subPcSubs.get(sessionId)?.unsubscribe()
    this.subPcSubs.delete(sessionId)
    this.subPcs.delete(sessionId)
    this.subTracksMap.delete(sessionId)
  }

  private clearPullTimer(key: string): void {
    const t = this.pullTimers.get(key)
    if (t) { clearTimeout(t); this.pullTimers.delete(key) }
  }

  /**
   * A stream that was flowing went silent. Nothing else catches this: the
   * dead-track timer only covers a track that never arrived, and an already
   * acked push never re-arms its ack timer. Rebuilding the affected direction
   * is the only repair available, so this reuses the PC ladder.
   */
  repairStalledFlow(direction: 'publish' | 'subscribe', sessionId?: string): void {
    if (this.destroyed) return
    if (direction === 'publish') {
      if (!this.pubConnStateSub) return
      this.pcRepair('pub', 'pub', 'publish', () => this.resetPubTracks()).schedule()
      return
    }
    if (!sessionId || !this.subTracksMap.has(sessionId)) return
    this.pcRepair(
      `sub:${sessionId}`, `sub:${sessionId.slice(0, 8)}`, 'subscribe',
      () => this.resetSubSession(sessionId),
    ).schedule()
  }

  /** Bytes are moving again. Pairs with repairStalledFlow so the repair
   * counters can distinguish a ladder that heals from one that only spins. */
  settleStalledFlow(direction: 'publish' | 'subscribe', sessionId?: string): void {
    const key = direction === 'publish' ? 'pub' : sessionId ? `sub:${sessionId}` : null
    if (!key) return
    const loop = this.pcRepairs.get(key)
    if (!loop?.repairing) return
    this.opts.onRepaired?.({ stage: direction, rung: 2, attempt: loop.attempts, sessionId })
    callDebug.sfuRepaired(direction, loop.attempts, key)
    loop.reset()
  }

  // Stops pulling one track, leaving the rest of that peer's session alone.
  unsubscribeTrack(sessionId: string, trackName: string): void {
    const key = `${sessionId}/${trackName}`
    if (!this.remotePullSubs.has(key)) return
    callDebug.sfuUnsubscribeTrack(sessionId, trackName)
    this.remotePullSubs.get(key)?.unsubscribe()
    this.remotePullSubs.delete(key)
    this.clearPullTimer(key)
    this.pullRepairs.get(key)?.cancel()
    this.pullRepairs.delete(key)
    this.subSessionTracks.get(sessionId)?.delete(trackName)
  }

  // Stops pulling every track from a remote session and closes that session's
  // subscribe PC. Called when a peer leaves so idle CF sessions are released.
  unsubscribePeer(sessionId: string): void {
    callDebug.sfuUnsubscribePeer(sessionId)
    for (const [key, sub] of this.remotePullSubs) {
      if (key.startsWith(`${sessionId}/`)) {
        sub.unsubscribe()
        this.remotePullSubs.delete(key)
        this.clearPullTimer(key)
      }
    }
    // Cancel repairs for this peer. Repair attempts are unbounded by design —
    // the call is the deadline — so the peer leaving is what has to stop them,
    // otherwise we would keep rebuilding CF subscribe sessions (and paying for
    // them) to pull media from someone who is gone.
    for (const [key, loop] of this.pullRepairs) {
      if (key.startsWith(`${sessionId}/`)) {
        loop.cancel()
        this.pullRepairs.delete(key)
      }
    }
    this.subSessionTracks.delete(sessionId)
    this.pcRepairs.get(`sub:${sessionId}`)?.cancel()
    this.pcRepairs.delete(`sub:${sessionId}`)
    // Unsubscribing every reference drops the last one to this session's
    // PartyTracks, which closes its underlying PC via refCount. The stats
    // subscription counts too — leaving it subscribed would keep the CF
    // subscribe session (and its billing) alive after the peer left.
    this.disposeSubSession(sessionId)
  }

  /**
   * One RTCStatsReport per live peer connection, for the stats monitor.
   * Returns the reports rather than the connections so PC access stays inside
   * this class. A PC that is closed or rejects getStats() is omitted: that is
   * the reconnect path's problem, not the monitor's.
   */
  async collectStats(): Promise<StatsSource[]> {
    if (this.destroyed) return []
    const targets: Array<{ id: string; direction: 'publish' | 'subscribe'; sessionId?: string; pc: RTCPeerConnection }> = []
    if (this.pubPc) targets.push({ id: 'pub', direction: 'publish', pc: this.pubPc })
    for (const [sessionId, pc] of this.subPcs) {
      targets.push({ id: `sub:${sessionId}`, direction: 'subscribe', sessionId, pc })
    }

    const settled = await Promise.all(targets.map(async (t): Promise<StatsSource | null> => {
      if (t.pc.connectionState === 'closed') return null
      try {
        return {
          id: t.id,
          direction: t.direction,
          sessionId: t.sessionId,
          report: await t.pc.getStats(),
          liveOutboundKinds: t.direction === 'publish' ? liveSenderKinds(t.pc) : [],
        }
      } catch {
        return null
      }
    }))
    return settled.filter((s): s is StatsSource => s !== null)
  }

  close(): void {
    if (this.destroyed) return
    callDebug.sfuClose()
    this.destroyed = true
    for (const sub of this.localPushSubs.values()) sub.unsubscribe()
    for (const sub of this.remotePullSubs.values()) sub.unsubscribe()
    for (const sub of this.subConnStateMap.values()) sub.unsubscribe()
    for (const sub of this.subPcSubs.values()) sub.unsubscribe()
    for (const t of this.pullTimers.values()) clearTimeout(t)
    for (const t of this.pushAckTimers.values()) clearTimeout(t)
    // Cancel before clearing: a pending repair timer that fires after close
    // would rebuild a CF session for a call that has ended.
    for (const loop of this.pushRepairs.values()) loop.cancel()
    for (const loop of this.pullRepairs.values()) loop.cancel()
    for (const loop of this.pcRepairs.values()) loop.cancel()
    this.pubConnStateSub?.unsubscribe()
    this.pubPcSub?.unsubscribe()
    this.pubPc = null
    this.unsubscribeTokenChange()
    this.localSubjects.clear()
    this.localPushSubs.clear()
    this.publishedMeta.clear()
    this.pushAckTimers.clear()
    this.remotePullSubs.clear()
    this.pullTimers.clear()
    this.subTracksMap.clear()
    this.subConnStateMap.clear()
    this.subPcSubs.clear()
    this.subPcs.clear()
    this.localTracks.clear()
    this.pushRepairs.clear()
    this.pullRepairs.clear()
    this.pcRepairs.clear()
    this.subSessionTracks.clear()
  }
}

/** Kinds this connection is actually transmitting right now. A muted mic or a
 * camera that is off has no live enabled sender, so its silence is expected. */
function liveSenderKinds(pc: RTCPeerConnection): FlowKind[] {
  const kinds = new Set<FlowKind>()
  for (const sender of pc.getSenders()) {
    const track = sender.track
    if (!track || !track.enabled || track.readyState !== 'live') continue
    if (track.kind === 'audio' || track.kind === 'video') kinds.add(track.kind)
  }
  return [...kinds]
}
