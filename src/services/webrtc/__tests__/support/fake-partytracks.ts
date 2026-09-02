import { BehaviorSubject, Subject } from 'rxjs'

/**
 * A partytracks stand-in that can be made to fail on demand.
 *
 * Every reliability bug this project has actually shipped lived in a failure
 * path: a push Cloudflare accepted but the browser never confirmed, a pull that
 * was issued and never delivered, a peer who rebuilt their publish connection
 * and came back under a new session. None of them are reachable by calling the
 * happy path and hoping. They need a partytracks that can be told to drop an
 * ack, swallow a track, or kill a peer connection, which is what this is.
 *
 * It deliberately does NOT model SDP, ICE or the Cloudflare wire protocol.
 * Those belong in the e2e suite against the real library. What it models is the
 * contract SfuSession depends on: push emits metadata or errors, pull emits
 * tracks or errors, and peerConnection$ re-emits when the connection is rebuilt.
 *
 * Usage — the mock factory is hoisted, so it loads this module dynamically
 * while the test body imports it normally. Both get the same module instance,
 * so `sfuFake` in the test body is the registry the fake writes to:
 *
 *   vi.mock('partytracks/client', async () => {
 *       const mod = await import('./support/fake-partytracks')
 *       return { PartyTracks: mod.FakePartyTracks }
 *   })
 *   import { sfuFake } from './support/fake-partytracks'
 */

export interface FakePushSubject {
  next: (meta: { sessionId: string; trackName: string }) => void
  error: (err: unknown) => void
}

/**
 * Minimal RTCPeerConnection stand-in: enough for collectStats() to read a
 * report and the live sender kinds, nothing more. Both fields are mutable so a
 * test can decide what the stats poller sees.
 */
export interface FakePeerConnection {
  connectionState: RTCPeerConnectionState
  statsEntries: Array<Record<string, unknown>>
  getStatsCalls: number
  senderKinds: string[]
  getStats: () => Promise<RTCStatsReport>
  getSenders: () => RTCRtpSender[]
}

function makePc(): FakePeerConnection {
  const pc: FakePeerConnection = {
    connectionState: 'connected',
    statsEntries: [],
    getStatsCalls: 0,
    senderKinds: ['audio'],
    getStats: async () => {
      pc.getStatsCalls++
      return new Map(pc.statsEntries.map((e, i) => [String(i), e])) as unknown as RTCStatsReport
    },
    getSenders: () =>
      pc.senderKinds.map((kind) => ({
        track: { kind, enabled: true, readyState: 'live' },
      })) as unknown as RTCRtpSender[],
  }
  return pc
}

/** The metadata SfuSession passes to pull(), unwrapped for assertions. */
export interface PulledTrack {
  sessionId: string
  trackName: string
}

export class FakePartyTracks {
  readonly config: { apiExtraParams?: string; headers?: Headers }
  /** 'publish' or 'subscribe', read off apiExtraParams for readable assertions. */
  readonly kind: string
  readonly pushCalls: unknown[] = []
  readonly pushSubjects: FakePushSubject[] = []
  readonly pullCalls: unknown[] = []
  /**
   * One subject per pull() call. This matters: an errored Subject is dead
   * forever, so a shared one would make a repair's re-pull inherit the failure
   * that triggered it and every repair test would pass for the wrong reason.
   */
  readonly pullSubjects: Array<Subject<MediaStreamTrack>> = []
  /** What each pull() was asked for, in call order. */
  readonly pulled: PulledTrack[] = []

  pc: FakePeerConnection
  readonly peerConnectionState$ = new BehaviorSubject<RTCPeerConnectionState>('new')
  readonly peerConnection$: BehaviorSubject<RTCPeerConnection>

  constructor(config: unknown) {
    this.config = (config ?? {}) as { apiExtraParams?: string; headers?: Headers }
    const params = this.config.apiExtraParams ?? ''
    this.kind = params.includes('kind=publish')
      ? 'publish'
      : params.includes('kind=subscribe')
        ? 'subscribe'
        : 'unknown'
    this.pc = makePc()
    this.peerConnection$ = new BehaviorSubject(this.pc as unknown as RTCPeerConnection)
    sfuFake.instances.push(this)
  }

  /** The most recent pull's subject, which is the one a test usually wants. */
  get pullSubject$(): Subject<MediaStreamTrack> {
    const last = this.pullSubjects.at(-1)
    if (!last) throw new Error('pullSubject$ read before any pull() was issued')
    return last
  }

  push(track$: unknown) {
    this.pushCalls.push(track$)
    const subject = new Subject<{ sessionId: string; trackName: string }>()
    this.pushSubjects.push(subject)
    return subject.asObservable()
  }

  pull(meta$: unknown) {
    this.pullCalls.push(meta$)
    // Subscribe to read what was requested, the way the real library does.
    // SfuSession hands over meta$.asObservable(), so there is no `.value` to
    // peek at — and reaching for one silently recorded every pull as unknown.
    const requested: PulledTrack = { sessionId: '?', trackName: '?' }
    ;(meta$ as { subscribe: (fn: (m: PulledTrack) => void) => { unsubscribe: () => void } })
      .subscribe((m) => {
        requested.sessionId = m.sessionId
        requested.trackName = m.trackName
      })
      .unsubscribe()
    this.pulled.push(requested)
    const subject = new Subject<MediaStreamTrack>()
    this.pullSubjects.push(subject)
    return subject.asObservable()
  }

  // ── Failure injection ────────────────────────────────────────────────────

  /** Cloudflare acked this push. Omitting this IS the dropped-ack case. */
  ackPush(index: number, meta: { sessionId: string; trackName: string }): void {
    this.pushSubjects[index].next(meta)
  }

  /** A terminal push error: SDP rejected, session gone, 4xx. */
  failPush(index: number, err: unknown = new Error('push failed')): void {
    this.pushSubjects[index].error(err)
  }

  /** Media arrives for a pull. Omitting this is the dead-track case. */
  deliverTrack(index: number, kind: 'audio' | 'video' = 'video'): void {
    this.pullSubjects[index].next({ kind } as MediaStreamTrack)
  }

  /** Deliver on the most recent pull, which is what a repair just re-issued. */
  deliverLatestTrack(kind: 'audio' | 'video' = 'video'): void {
    this.deliverTrack(this.pullSubjects.length - 1, kind)
  }

  /** A terminal pull error. The observable is dead after this. */
  failPull(index: number, err: unknown = new Error('pull failed')): void {
    this.pullSubjects[index].error(err)
  }

  /**
   * The connection dropped and partytracks rebuilt it. Emits the failed state,
   * then a fresh peer connection, which is what the real library does and what
   * SfuSession's pubPc/subPcs tracking has to follow.
   */
  killPeerConnection(): void {
    this.peerConnectionState$.next('failed')
    this.pc = makePc()
    this.peerConnection$.next(this.pc as unknown as RTCPeerConnection)
    this.peerConnectionState$.next('connected')
  }
}

/** Registry of every PartyTracks the code under test constructed. */
export const sfuFake = {
  instances: [] as FakePartyTracks[],

  reset(): void {
    // Mutated in place so a test file can hold a const alias to the array.
    this.instances.length = 0
  },

  publish(): FakePartyTracks[] {
    return this.instances.filter((i) => i.kind === 'publish')
  },

  subscribe(): FakePartyTracks[] {
    return this.instances.filter((i) => i.kind === 'subscribe')
  },

  /** The newest publish instance — repair rung 2 replaces the old one. */
  latestPublish(): FakePartyTracks {
    const found = this.publish().at(-1)
    if (!found) throw new Error('no publish PartyTracks has been created yet')
    return found
  },

  /** The newest subscribe instance, which is the one a repair just rebuilt. */
  latestSubscribe(): FakePartyTracks {
    const found = this.subscribe().at(-1)
    if (!found) throw new Error('no subscribe PartyTracks has been created yet')
    return found
  },

  /** Every (sessionId, trackName) any subscribe instance was asked to pull. */
  allPulled(): PulledTrack[] {
    return this.subscribe().flatMap((i) => i.pulled)
  },
}
