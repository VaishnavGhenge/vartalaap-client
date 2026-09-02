import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The partytracks stand-in lives in support/fake-partytracks.ts so the repair
// and recovery suites can drive the same failure injection. See that file for
// what it does and does not model.
//
// The factory is hoisted above imports, so it loads the module dynamically;
// the top-level import below resolves to the same instance, which is why
// `instances` here is the array the fake writes to.
vi.mock('partytracks/client', async () => {
    const mod = await import('./support/fake-partytracks')
    return { PartyTracks: mod.FakePartyTracks }
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
import { sfuFake } from './support/fake-partytracks'

const instances = sfuFake.instances
import { setAccessToken } from '@/src/services/api/token'

beforeEach(() => {
    sfuFake.reset()
    authState.token = 'test-token'
})

function makeTrack(kind: 'audio' | 'video' = 'video'): MediaStreamTrack {
    return { kind, stop: vi.fn(), enabled: true, readyState: 'live' } as unknown as MediaStreamTrack
}

function makeSession(over: Partial<ConstructorParameters<typeof SfuSession>[0]> = {}) {
    return new SfuSession({
        roomId: 'room-1',
        peerId: 'peer-alice',
        iceServers: [],
        onRemoteTrack: vi.fn(),
        onConnectionStateChange: vi.fn(),
        ...over,
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
// only signal behind "I turned my camera on but nobody sees me". The kind that
// DID ack must stay quiet.
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
        // Just past the 4s repair trigger and no further: detection now re-arms
        // after each repair attempt, so a longer window would legitimately
        // report the same unacked video push again.
        vi.advanceTimersByTime(4_500)

        expect(onPublishTimeout).toHaveBeenCalledTimes(1)
        expect(onPublishTimeout).toHaveBeenCalledWith('video')
    } finally {
        vi.useRealTimers()
    }
})

// The detection window is a repair trigger, not a verdict, so it re-arms after
// every attempt. A push that stays unacked keeps reporting rather than going
// quiet after the first detection — the user's camera is still not reaching
// anyone, and one stale warning would not say so.
it('keeps reporting a push that stays unacked', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
        const onPublishTimeout = vi.fn()
        const session = new SfuSession({
            roomId: 'room-1', peerId: 'peer-alice', iceServers: [],
            onPublishTimeout,
        })
        await session.publish({
            getTracks: () => [makeTrack('video')],
        } as unknown as MediaStream)

        await vi.advanceTimersByTimeAsync(4_000)
        expect(onPublishTimeout).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(501)   // repair attempt 1 re-pushes
        await vi.advanceTimersByTimeAsync(4_000) // and the new push stalls too
        expect(onPublishTimeout).toHaveBeenCalledTimes(2)
        session.close()
    } finally {
        vi.useRealTimers()
        vi.restoreAllMocks()
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

// ─── collectStats ─────────────────────────────────────────────────────────────
// The stats poller must never receive an RTCPeerConnection (client CLAUDE.md
// keeps PC access inside SfuSession), so these pin the shape of what it does
// get: one source per live PC, tagged by direction and CF session.

it('collectStats reports nothing until something is published or subscribed', async () => {
    const session = makeSession()
    // The publish PartyTracks exists, but peerConnection$ is subscribed lazily
    // in publishTrack — subscribing eagerly would allocate a CF session that
    // CF then expires, breaking every later tracks/new.
    expect(await session.collectStats()).toEqual([])
    session.close()
})

it('collectStats returns one source per live peer connection', async () => {
    const session = makeSession()
    await session.publish({ getTracks: () => [makeTrack('audio')] } as unknown as MediaStream)
    await session.subscribe('cf-sess-bob', ['track-1'])

    const sources = await session.collectStats()
    expect(sources.map((s) => [s.id, s.direction, s.sessionId])).toEqual([
        ['pub', 'publish', undefined],
        ['sub:cf-sess-bob', 'subscribe', 'cf-sess-bob'],
    ])
    // Live sender kinds are read for the publish leg only — a subscribe PC has
    // no senders of ours, so an empty list there is correct, not a gap.
    expect(sources[0].liveOutboundKinds).toEqual(['audio'])
    expect(sources[1].liveOutboundKinds).toEqual([])
    session.close()
})

it('collectStats skips a closed peer connection instead of throwing', async () => {
    const session = makeSession()
    await session.publish({ getTracks: () => [makeTrack('audio')] } as unknown as MediaStream)
    await session.subscribe('cf-sess-bob', ['track-1'])

    instances[1].pc.connectionState = 'closed'
    const sources = await session.collectStats()
    expect(sources.map((s) => s.id)).toEqual(['pub'])
    // getStats must not even be attempted on a closed PC — it rejects.
    expect(instances[1].pc.getStatsCalls).toBe(0)
    session.close()
})

// The stats subscription holds a reference to the subscribe PartyTracks, and
// partytracks closes the underlying PC (and the billed CF session) by refCount.
// Forgetting to unsubscribe it on peer-left would keep paying for a session
// nobody is pulling from.
it('unsubscribePeer drops the peer stats source', async () => {
    const session = makeSession()
    await session.publish({ getTracks: () => [makeTrack('audio')] } as unknown as MediaStream)
    await session.subscribe('cf-sess-bob', ['track-1'])
    expect(await session.collectStats()).toHaveLength(2)

    session.unsubscribePeer('cf-sess-bob')
    expect((await session.collectStats()).map((s) => s.id)).toEqual(['pub'])
    session.close()
})

it('collectStats returns nothing after close', async () => {
    const session = makeSession()
    await session.publish({ getTracks: () => [makeTrack('audio')] } as unknown as MediaStream)
    session.close()
    expect(await session.collectStats()).toEqual([])
})

// ─── Regression: the 2026-09-01 dead-track incident ───────────────────────────
// A Firefox guest unmuted (audio push acked), then turned the camera on. CF
// returned 200 to the video tracks/new, the server announced from that 200,
// Chrome pulled the video track, and the push never acked — so Chrome sat on a
// track nobody was sending until the pull timed out. Two Sentry issues, one
// cause. The announce is now the publisher's alone, which makes this test the
// guard: a track CF accepted but the browser never confirmed must stay out of
// the announcement entirely.
it('a second track whose push never acks stays out of the announcement', async () => {
    const onLocalTracksChanged = vi.fn()
    const session = new SfuSession({
        roomId: 'room-1', peerId: 'peer-firefox', iceServers: [],
        onLocalTracksChanged,
    })

    // Unmute: audio pushes and acks.
    await session.replaceTrack('audio', makeTrack('audio'))
    instances[0].pushSubjects[0].next({ sessionId: 'cf-pub-1', trackName: 'tn-audio' })
    expect(onLocalTracksChanged).toHaveBeenCalledTimes(1)

    // Camera on: video pushes on the same session and never acks.
    await session.replaceTrack('video', makeTrack('video'))
    expect(instances[0].pushCalls).toHaveLength(2)

    // No further announcement, and the set peers would receive names audio only.
    expect(onLocalTracksChanged).toHaveBeenCalledTimes(1)
    expect(session.getLocalTracksAnnouncement()).toEqual({
        sessionId: 'cf-pub-1', tracks: [{ trackName: 'tn-audio' }],
    })

    // When the ack finally lands, the video track joins the announced set —
    // late is fine, wrong is not.
    instances[0].pushSubjects[1].next({ sessionId: 'cf-pub-1', trackName: 'tn-video' })
    expect(onLocalTracksChanged).toHaveBeenLastCalledWith({
        sessionId: 'cf-pub-1', tracks: [{ trackName: 'tn-audio' }, { trackName: 'tn-video' }],
    })
    session.close()
})

// ─── Repair ladder ────────────────────────────────────────────────────────────
// Step 3 of the reliability work: detection ends in a repair, never in "report
// and stop". Before this a dead pull was permanent for the rest of the call —
// the timeout fired once, sent a Sentry message, and left the subscription key
// in place so even a re-announce was skipped as a duplicate.
//
// Rung 1 retries in place. Rung 2 rebuilds that direction's PartyTracks, which
// means a fresh CF session. Attempts are unbounded on purpose: the call is the
// deadline, because connecting slowly beats not connecting.

// Runs exactly N repair cycles: each is the 8s detection window followed by
// that attempt's backoff. Precise rather than generous, because over-advancing
// silently runs extra cycles and turns "one repair happened" into "several
// did". Math.random is pinned to 0 in these suites, which fixes the jitter
// factor at 0.5 and makes each attempt's delay exactly 500ms * 2^(attempt-1).
async function runRepairCycles(count: number) {
    for (let attempt = 1; attempt <= count; attempt++) {
        await vi.advanceTimersByTimeAsync(8_000)
        await vi.advanceTimersByTimeAsync(500 * 2 ** (attempt - 1) + 1)
    }
}

function useDeterministicRepairTimers() {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
}

describe('pull repair', () => {
    beforeEach(() => { useDeterministicRepairTimers() })
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

    it('re-pulls a dead track instead of leaving it dead forever', async () => {
        const onPullTimeout = vi.fn()
        const session = makeSession({ onPullTimeout })
        await session.subscribe('cf-bob', ['tn-video'])
        expect(instances[1].pullCalls).toHaveLength(1)

        await runRepairCycles(1)

        expect(onPullTimeout).toHaveBeenCalled()
        // The repair re-issued the pull on the same subscribe session.
        expect(instances[1].pullCalls).toHaveLength(2)
        // No new PartyTracks yet — rung 1 is the cheap retry.
        expect(instances).toHaveLength(2)
        session.close()
    })

    it('escalates to a fresh subscribe session when retrying in place keeps failing', async () => {
        const onRepair = vi.fn()
        const session = makeSession({ onRepair })
        await session.subscribe('cf-bob', ['tn-video'])

        await runRepairCycles(3)

        const rungs = onRepair.mock.calls.map(([info]) => info.rung)
        expect(rungs.slice(0, 3)).toEqual([1, 1, 2])
        // Rung 2 built a new subscribe PartyTracks for that peer.
        expect(instances.length).toBeGreaterThan(2)
        expect((instances.at(-1)!.config as { apiExtraParams: string }).apiExtraParams).toContain('kind=subscribe')
        session.close()
    })

    it('repairs a pull that errored, not just one that timed out', async () => {
        // An errored observable is terminal: without a repair the track can
        // never arrive no matter how often the publisher re-announces.
        const session = makeSession()
        await session.subscribe('cf-bob', ['tn-video'])
        instances[1].pullSubject$.error(new Error('SDP rejected'))

        await runRepairCycles(1)
        expect(instances[1].pullCalls.length).toBeGreaterThan(1)
        session.close()
    })

    it('reports which rung got media flowing again', async () => {
        const onRepaired = vi.fn()
        const session = makeSession({ onRepaired })
        await session.subscribe('cf-bob', ['tn-video'])

        await runRepairCycles(1)
        expect(onRepaired).not.toHaveBeenCalled()

        instances[1].pullSubject$.next({ kind: 'video' } as MediaStreamTrack)
        expect(onRepaired).toHaveBeenCalledTimes(1)
        expect(onRepaired.mock.calls[0][0]).toMatchObject({
            stage: 'subscribe', sessionId: 'cf-bob', trackName: 'tn-video', attempt: 1,
        })
        session.close()
    })

    it('retries immediately when the publisher re-announces a broken track', async () => {
        // The publisher re-announcing usually means their side just came back,
        // so it is a better signal than waiting out the backoff. This branch
        // used to return unconditionally, which is what made dead permanent.
        const session = makeSession()
        await session.subscribe('cf-bob', ['tn-video'])
        await runRepairCycles(1)
        const afterFirstRepair = instances[1].pullCalls.length

        await session.subscribe('cf-bob', ['tn-video'])
        expect(instances[1].pullCalls.length).toBe(afterFirstRepair + 1)
        session.close()
    })

    it('still skips a re-announce for a track that is working', async () => {
        const session = makeSession()
        await session.subscribe('cf-bob', ['tn-video'])
        instances[1].pullSubject$.next({ kind: 'video' } as MediaStreamTrack)

        await session.subscribe('cf-bob', ['tn-video'])
        expect(instances[1].pullCalls).toHaveLength(1)
        session.close()
    })

    it('stops repairing when the peer leaves', async () => {
        // Repairs are unbounded, so peer-left is what has to stop them.
        // Otherwise we keep rebuilding — and paying for — CF subscribe sessions
        // to pull media from someone who is gone.
        const onRepair = vi.fn()
        const session = makeSession({ onRepair })
        await session.subscribe('cf-bob', ['tn-video'])
        await runRepairCycles(1)
        expect(onRepair).toHaveBeenCalledTimes(1)

        session.unsubscribePeer('cf-bob')
        await runRepairCycles(3)
        expect(onRepair).toHaveBeenCalledTimes(1)
        session.close()
    })

    it('stops repairing when the call ends', async () => {
        const onRepair = vi.fn()
        const session = makeSession({ onRepair })
        await session.subscribe('cf-bob', ['tn-video'])
        session.close()

        await runRepairCycles(3)
        expect(onRepair).not.toHaveBeenCalled()
    })
})

describe('push repair', () => {
    beforeEach(() => { useDeterministicRepairTimers() })
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

    it('re-pushes a track whose ack never arrived', async () => {
        // The 2026-09-01 Firefox shape: CF accepted the push, the browser never
        // confirmed it. Previously the only response was a toast.
        const onPublishTimeout = vi.fn()
        const session = makeSession({ onPublishTimeout })
        await session.publish({ getTracks: () => [makeTrack('video')] } as unknown as MediaStream)
        expect(instances[0].pushCalls).toHaveLength(1)

        await runRepairCycles(1)
        expect(onPublishTimeout).toHaveBeenCalledWith('video')
        expect(instances[0].pushCalls).toHaveLength(2)
        session.close()
    })

    it('rebuilds the publish session when re-pushing keeps failing', async () => {
        const onRepair = vi.fn()
        const session = makeSession({ onRepair })
        await session.publish({ getTracks: () => [makeTrack('video')] } as unknown as MediaStream)

        await runRepairCycles(3)
        const rungs = onRepair.mock.calls.map(([info]) => info.rung)
        expect(rungs.slice(0, 3)).toEqual([1, 1, 2])
        // A new publish PartyTracks, which means a fresh CF session.
        const publishInstances = instances.filter(
            (i) => (i.config as { apiExtraParams: string }).apiExtraParams.includes('kind=publish'),
        )
        expect(publishInstances.length).toBeGreaterThan(1)
        session.close()
    })

    it('drops the stale announcement when the publish session is rebuilt', async () => {
        // Track names from the old CF session are unpullable. Continuing to
        // advertise them would hand every peer a guaranteed dead track.
        const onLocalTracksChanged = vi.fn()
        const session = makeSession({ onLocalTracksChanged })
        await session.publish({ getTracks: () => [makeTrack('audio')] } as unknown as MediaStream)
        instances[0].pushSubjects[0].next({ sessionId: 'cf-pub-1', trackName: 'tn-audio' })
        expect(session.getLocalTracksAnnouncement()).toEqual({
            sessionId: 'cf-pub-1', tracks: [{ trackName: 'tn-audio' }],
        })

        // Force rung 2 by failing the video push repeatedly.
        await session.replaceTrack('video', makeTrack('video'))
        await runRepairCycles(3)

        expect(session.getLocalTracksAnnouncement()).toBeNull()
        session.close()
    })

    it('gives up repairing a kind the user switched off', async () => {
        // A stopped track is the desired state, not a fault to heal.
        const onRepair = vi.fn()
        const session = makeSession({ onRepair })
        const track = makeTrack('video')
        await session.publish({ getTracks: () => [track] } as unknown as MediaStream)

        ;(track as unknown as { readyState: string }).readyState = 'ended'
        await runRepairCycles(3)

        // The first attempt runs and finds nothing worth repairing; it must not
        // then escalate to rebuilding the whole publish session.
        const rungs = onRepair.mock.calls.map(([info]) => info.rung)
        expect(rungs.every((r: number) => r === 1)).toBe(true)
        session.close()
    })

    it('reports recovery when a re-pushed track finally acks', async () => {
        const onRepaired = vi.fn()
        const session = makeSession({ onRepaired })
        await session.publish({ getTracks: () => [makeTrack('audio')] } as unknown as MediaStream)

        await runRepairCycles(1)
        instances[0].pushSubjects[1].next({ sessionId: 'cf-pub-2', trackName: 'tn-audio' })

        expect(onRepaired).toHaveBeenCalledTimes(1)
        expect(onRepaired.mock.calls[0][0]).toMatchObject({ stage: 'publish', kind: 'audio', attempt: 1 })
        session.close()
    })
})
