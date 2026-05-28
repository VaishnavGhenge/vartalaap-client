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
const { instances } = vi.hoisted(() => ({ instances: [] as Array<{
    config: unknown
    pushCalls: unknown[]
    pullCalls: unknown[]
}> }))

vi.mock('partytracks/client', async () => {
    const { BehaviorSubject, Subject, NEVER } = await import('rxjs')
    class FakePartyTracks {
        public peerConnectionState$ = new BehaviorSubject<RTCPeerConnectionState>('new')
        public pullSubject$ = new Subject<MediaStreamTrack>()
        private inst: { config: unknown; pushCalls: unknown[]; pullCalls: unknown[] }
        constructor(config: unknown) {
            this.inst = { config, pushCalls: [], pullCalls: [] }
            instances.push(this.inst)
        }
        push(track$: unknown) {
            this.inst.pushCalls.push(track$)
            return NEVER
        }
        pull(meta$: unknown) {
            this.inst.pullCalls.push(meta$)
            return this.pullSubject$.asObservable()
        }
    }
    return { PartyTracks: FakePartyTracks }
})

vi.mock('@/src/services/api/config', () => ({ httpServerUri: 'http://test' }))
vi.mock('@/src/services/api/fetch', () => ({
    apiBearerHeaders: () => ({ Authorization: 'Bearer test-token' }),
}))

import { SfuSession } from '../sfu-session'

beforeEach(() => {
    instances.length = 0
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
