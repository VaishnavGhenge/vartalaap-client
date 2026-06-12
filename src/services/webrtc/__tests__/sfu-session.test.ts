import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── PartyTracks mock ─────────────────────────────────────────────────────────
// We mock the external partytracks library because its behaviour (real
// RTCPeerConnection, CF Realtime API calls) is not what SfuSession's
// architectural invariants depend on. Tests below pin those invariants:
// per-session subscribe isolation, idempotency, cleanup. They do NOT pin the
// SDP/ICE plumbing — that belongs in the e2e suite where real partytracks runs.
//
// Each `new PartyTracks(...)` constructor call is recorded so tests can assert
// "this design creates exactly N CF subscribe sessions for N remote peers".
//
// vi.hoisted is required because vi.mock factories run BEFORE the file body
// is evaluated. The shared `instances` array therefore has to be created in
// the hoisted block so it exists when the mock factory runs.
interface FakePushSubject {
    next: (meta: { sessionId: string; trackName: string }) => void
    error: (err: unknown) => void
}

const { instances } = vi.hoisted(() => ({ instances: [] as Array<{
    config: unknown
    pushCalls: unknown[]
    // One subject per push() call, in call order — tests emit on these to
    // simulate CF acking (or terminally failing) a pushed track.
    pushSubjects: FakePushSubject[]
    pullCalls: unknown[]
}> }))

vi.mock('partytracks/client', async () => {
    const { BehaviorSubject, Subject } = await import('rxjs')
    class FakePartyTracks {
        public peerConnectionState$ = new BehaviorSubject<RTCPeerConnectionState>('new')
        public pullSubject$ = new Subject<MediaStreamTrack>()
        private inst: { config: unknown; pushCalls: unknown[]; pushSubjects: FakePushSubject[]; pullCalls: unknown[] }
        constructor(config: unknown) {
            this.inst = { config, pushCalls: [], pushSubjects: [], pullCalls: [] }
            instances.push(this.inst)
        }
        push(track$: unknown) {
            this.inst.pushCalls.push(track$)
            const subject = new Subject<{ sessionId: string; trackName: string }>()
            this.inst.pushSubjects.push(subject)
            return subject.asObservable()
        }
        pull(meta$: unknown) {
            this.inst.pullCalls.push(meta$)
            return this.pullSubject$.asObservable()
        }
    }
    return { PartyTracks: FakePartyTracks }
})

vi.mock('@/src/services/api/config', () => ({ httpServerUri: 'http://test' }))

// Mutable so tests can simulate a token refresh: SfuSession re-reads this via
// its token-change subscription and must update its live Headers in place.
const { authState } = vi.hoisted(() => ({ authState: { token: 'test-token' } }))
vi.mock('@/src/services/api/fetch', () => ({
    apiBearerHeaders: () =>
        authState.token ? { Authorization: `Bearer ${authState.token}` } : {},
}))

import { SfuSession } from '../sfu-session'
import { setAccessToken } from '@/src/services/api/token'

beforeEach(() => {
    instances.length = 0
    authState.token = 'test-token'
})

function makeTrack(kind: 'audio' | 'video' = 'video'): MediaStreamTrack {
    return { kind, stop: vi.fn() } as unknown as MediaStreamTrack
}

function makeSession() {
    return new SfuSession({
        roomId: 'room-1',
        peerId: 'peer-alice',
        iceServers: [],
        onRemoteTrack: vi.fn(),
        onConnectionStateChange: vi.fn(),
    })
}

// SfuSession's constructor always creates exactly ONE publish PartyTracks
// (the sendonly session). Subscribe-side instances are lazy — we don't want
// to allocate a CF session before there's anything to subscribe to.
it('constructor allocates exactly one publish PartyTracks (no eager subscribe)', () => {
    makeSession()
    expect(instances).toHaveLength(1)
    // The publish instance is configured with kind=publish.
    expect((instances[0].config as { apiExtraParams: string }).apiExtraParams).toContain('kind=publish')
})

// THE architectural invariant: each remote sessionId gets its OWN subscribe
// PartyTracks instance. The doc comment names a specific previously-shipped
// bug ("3rd peer joined an active call") that resulted from a shared
// subscribe PC. If this collapses back to one shared subscribe instance,
// adding a 3rd peer renegotiates every existing subscription and the call
// breaks. Test pins the N-instances rule.
it('subscribing to two remote sessions creates two isolated subscribe PCs', async () => {
    const session = makeSession()
    await session.subscribe('cf-sess-bob', ['audio', 'video'])
    await session.subscribe('cf-sess-carol', ['audio'])

    // 1 publish + 2 subscribe (bob, carol) — Bob's 2nd track stays on Bob's PC.
    expect(instances).toHaveLength(3)
    const subscribers = instances.slice(1)
    for (const inst of subscribers) {
        expect((inst.config as { apiExtraParams: string }).apiExtraParams).toContain('kind=subscribe')
    }
    // Bob's PartyTracks got 2 pull() calls (audio + video); Carol got 1.
    expect(subscribers[0].pullCalls.length + subscribers[1].pullCalls.length).toBe(3)
})

// subscribeTrack is idempotent per (sessionId, trackName). Without this,
// repeated sfu-tracks broadcasts (which happen legitimately when a peer adds
// a new track to an existing publish) would create duplicate pull
// subscriptions on the same PC and either no-op or wedge depending on
// partytracks internals.
it('subscribing to the same (session, track) twice is a no-op', async () => {
    const session = makeSession()
    await session.subscribe('cf-sess-bob', ['audio'])
    await session.subscribe('cf-sess-bob', ['audio']) // duplicate

    const bobInst = instances[1]
    expect(bobInst.pullCalls).toHaveLength(1)
})

// publishTrack is idempotent per kind: a second publish of the same kind
// (audio or video) must REPLACE the underlying track via the existing
// BehaviorSubject — not allocate a new push subscription. This is what
// makes camera/mic toggles cheap (no SDP renegotiation needed).
it('publishing a same-kind track twice replaces via the existing push', async () => {
    const session = makeSession()
    const stream = {
        getTracks: () => [makeTrack('video')],
    } as unknown as MediaStream
    await session.publish(stream)

    // First publish allocated one push subscription on the pub instance.
    expect(instances[0].pushCalls).toHaveLength(1)

    // Second video publish must reuse the existing subject — pushCalls stays 1.
    await session.replaceTrack('video', makeTrack('video'))
    expect(instances[0].pushCalls).toHaveLength(1)
})

// unsubscribePeer cleans up ONLY the targeted session and leaves the others
// untouched. A regression where it cleared subTracksMap globally would
// silently kill every remote peer's media on any single leave event.
it('unsubscribePeer removes only the targeted remote session', async () => {
    const session = makeSession()
    await session.subscribe('cf-sess-bob', ['audio'])
    await session.subscribe('cf-sess-carol', ['audio'])
    // Sanity: 1 pub + 2 sub
    expect(instances).toHaveLength(3)

    // Inspect internal map indirectly: subscribing AGAIN to bob should
    // re-create his PartyTracks (because unsubscribePeer dropped it), but
    // subscribing to carol must NOT — her PartyTracks should still be alive.
    session.unsubscribePeer('cf-sess-bob')

    await session.subscribe('cf-sess-bob', ['audio'])
    // A NEW PartyTracks for bob was created (instances grew).
    expect(instances).toHaveLength(4)

    await session.subscribe('cf-sess-carol', ['audio']) // her instance must still exist
    // No new PartyTracks for carol — her existing one was reused.
    expect(instances).toHaveLength(4)
})

// close() must be idempotent. Components unmount under React 18 strict-mode
// double-invoke or via cleanup races, and a second close that double-
// unsubscribes the publish state subscription would throw and break the
// unmount path.
it('close() is idempotent (safe to call twice)', () => {
    const session = makeSession()
    session.close()
    expect(() => session.close()).not.toThrow()
})

// After close, publish/subscribe must be no-ops. Without the `destroyed`
// guard, a stale callback (e.g. a delayed sfu-tracks message arriving after
// the user left the call) would allocate a new CF session post-mortem.
it('publish/subscribe after close are no-ops', async () => {
    const session = makeSession()
    session.close()

    const beforePush = instances[0].pushCalls.length
    await session.publish({ getTracks: () => [makeTrack('audio')] } as unknown as MediaStream)
    expect(instances[0].pushCalls.length).toBe(beforePush)

    const beforeCount = instances.length
    await session.subscribe('cf-sess-ghost', ['audio'])
    expect(instances.length).toBe(beforeCount)
})

// ─── Local track announcements (sfu-announce self-healing) ───────────────────
// The signaling server's stored track set is wiped whenever a peer's WS
// drops; the announcement built from push acks is the only durable record
// that can restore it. These tests pin: acks accumulate into a full-set
// announcement, duplicates dedupe, a new sessionId (PC recreation) supersedes
// the old set, and a stalled push surfaces instead of hanging silently.

it('push acks build the full announcement and fire onLocalTracksChanged once per change', async () => {
    const onLocalTracksChanged = vi.fn()
    const session = new SfuSession({
        roomId: 'room-1', peerId: 'peer-alice', iceServers: [],
        onLocalTracksChanged,
    })
    await session.publish({
        getTracks: () => [makeTrack('audio'), makeTrack('video')],
    } as unknown as MediaStream)

    const [audioPush, videoPush] = instances[0].pushSubjects
    audioPush.next({ sessionId: 'cf-pub-1', trackName: 'tn-audio' })
    expect(onLocalTracksChanged).toHaveBeenCalledTimes(1)
    expect(onLocalTracksChanged).toHaveBeenLastCalledWith({
        sessionId: 'cf-pub-1', tracks: [{ trackName: 'tn-audio' }],
    })

    videoPush.next({ sessionId: 'cf-pub-1', trackName: 'tn-video' })
    expect(onLocalTracksChanged).toHaveBeenCalledTimes(2)
    expect(onLocalTracksChanged).toHaveBeenLastCalledWith({
        sessionId: 'cf-pub-1', tracks: [{ trackName: 'tn-audio' }, { trackName: 'tn-video' }],
    })
    expect(session.getLocalTracksAnnouncement()).toEqual({
        sessionId: 'cf-pub-1', tracks: [{ trackName: 'tn-audio' }, { trackName: 'tn-video' }],
    })

    // Re-acks with unchanged metadata (every local replaceTrack re-emits) must
    // not spam the signaling channel.
    videoPush.next({ sessionId: 'cf-pub-1', trackName: 'tn-video' })
    expect(onLocalTracksChanged).toHaveBeenCalledTimes(2)
})

// partytracks recreates the publish PC after a connection failure and
// re-pushes every track under a NEW CF sessionId. The announcement must
// follow the new session and exclude tracks not yet re-acked on it.
it('a re-ack under a new sessionId supersedes the old announcement', async () => {
    const onLocalTracksChanged = vi.fn()
    const session = new SfuSession({
        roomId: 'room-1', peerId: 'peer-alice', iceServers: [],
        onLocalTracksChanged,
    })
    await session.publish({
        getTracks: () => [makeTrack('audio'), makeTrack('video')],
    } as unknown as MediaStream)
    const [audioPush, videoPush] = instances[0].pushSubjects
    audioPush.next({ sessionId: 'cf-pub-1', trackName: 'tn-audio' })
    videoPush.next({ sessionId: 'cf-pub-1', trackName: 'tn-video' })

    // PC recreated: video re-acks first under the new session.
    videoPush.next({ sessionId: 'cf-pub-2', trackName: 'tn-video-2' })
    expect(onLocalTracksChanged).toHaveBeenLastCalledWith({
        sessionId: 'cf-pub-2', tracks: [{ trackName: 'tn-video-2' }],
    })
    // Audio follows moments later → full set on the new session.
    audioPush.next({ sessionId: 'cf-pub-2', trackName: 'tn-audio-2' })
    expect(onLocalTracksChanged).toHaveBeenLastCalledWith({
        sessionId: 'cf-pub-2', tracks: [{ trackName: 'tn-audio-2' }, { trackName: 'tn-video-2' }],
    })
})

// A push that gets no CF ack within the window must surface via
// onPublishTimeout — partytracks retries silently forever, so this is the
// only signal behind "I turned my camera on but nobody sees me".
it('a push with no ack fires onPublishTimeout; an acked push does not', async () => {
    vi.useFakeTimers()
    try {
        const onPublishTimeout = vi.fn()
        const session = new SfuSession({
            roomId: 'room-1', peerId: 'peer-alice', iceServers: [],
            onPublishTimeout,
        })
        await session.publish({
            getTracks: () => [makeTrack('audio'), makeTrack('video')],
        } as unknown as MediaStream)

        // Audio acks in time; video never does.
        instances[0].pushSubjects[0].next({ sessionId: 'cf-pub-1', trackName: 'tn-audio' })
        vi.advanceTimersByTime(9_000)

        expect(onPublishTimeout).toHaveBeenCalledTimes(1)
        expect(onPublishTimeout).toHaveBeenCalledWith('video')
    } finally {
        vi.useRealTimers()
    }
})

// ─── Live SFU auth headers ────────────────────────────────────────────────
// partytracks reads config.headers on EVERY request. SfuSession must keep
// that Headers object current when the token refreshes — a header frozen at
// construction goes stale after the 15-minute access TTL and turns every
// later SFU request into a permanent 401 (the "joined but can't share or
// receive anything" production incident).

it('updates its live auth header in place when the token changes', () => {
    const session = makeSession()
    const config = instances[0].config as { headers: Headers }
    expect(config.headers.get('Authorization')).toBe('Bearer test-token')

    // Simulate a refresh: new token value, then the token-change notification
    // that the real token store fires.
    authState.token = 'refreshed-token'
    setAccessToken('refreshed-token')
    expect(config.headers.get('Authorization')).toBe('Bearer refreshed-token')

    // Signed out mid-call: header is removed rather than sent stale.
    authState.token = ''
    setAccessToken(null)
    expect(config.headers.get('Authorization')).toBeNull()
    session.close()
})

// All PartyTracks instances (publish + per-peer subscribe) must share the
// same live Headers object so one refresh fixes every connection.
it('publish and subscribe PartyTracks share the same live Headers instance', async () => {
    const session = makeSession()
    await session.subscribe('cf-sess-bob', ['audio'])
    const pubHeaders = (instances[0].config as { headers: Headers }).headers
    const subHeaders = (instances[1].config as { headers: Headers }).headers
    expect(subHeaders).toBe(pubHeaders)
    session.close()
})

// A terminal push error must clear the dead pipeline so the next
// enableCamera/enableMic re-creates the push. Leaving the dead subject in
// place turns every later toggle of that kind into a silent no-op.
it('a terminal push error allows the next publish of that kind to retry', async () => {
    const session = makeSession()
    await session.publish({ getTracks: () => [makeTrack('video')] } as unknown as MediaStream)
    expect(instances[0].pushCalls).toHaveLength(1)

    instances[0].pushSubjects[0].error(new Error('terminal push failure'))

    await session.replaceTrack('video', makeTrack('video'))
    expect(instances[0].pushCalls).toHaveLength(2)
})
