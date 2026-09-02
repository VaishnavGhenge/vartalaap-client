import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('partytracks/client', async () => {
    const mod = await import('./support/fake-partytracks')
    return { PartyTracks: mod.FakePartyTracks }
})
vi.mock('@/src/services/api/config', () => ({ httpServerUri: 'http://test' }))
vi.mock('@/src/services/api/fetch', () => ({ apiBearerHeaders: () => ({ Authorization: 'Bearer t' }) }))

import { SfuSession } from '../sfu-session'
import { CallReconciler } from '../call-reconciler'
import { sfuFake } from './support/fake-partytracks'

/**
 * The layers wired together, driven through their failure paths.
 *
 * Every unit suite here tests one piece against a stub of its neighbour, which
 * is where the bugs this project actually shipped went undetected: they all
 * lived at a seam. Announcing before the publisher confirmed, leaking a
 * subscribe session when a peer republished, discarding a replay because it
 * carried the wrong version. Each component was individually correct.
 *
 * So these tests use the real SfuSession and the real CallReconciler, and only
 * partytracks is faked — as the thing that can be told to drop an ack, swallow
 * a track, or kill a connection.
 */

interface Harness {
    session: SfuSession
    reconciler: CallReconciler
    tracks: Array<{ sessionId: string; trackName: string; kind: string }>
    close: () => void
}

function harness(): Harness {
    const tracks: Array<{ sessionId: string; trackName: string; kind: string }> = []
    let session: SfuSession | null = null
    const reconciler = new CallReconciler({ getSession: () => session })
    session = new SfuSession({
        roomId: 'room-1',
        peerId: 'peer-me',
        iceServers: [],
        onRemoteTrack: (track, sessionId, trackName) => {
            tracks.push({ sessionId, trackName, kind: track.kind })
        },
    })
    return { session, reconciler, tracks, close: () => session?.close() }
}

/** One detection window plus that attempt's backoff, with jitter pinned. */
async function repairCycles(count: number) {
    for (let attempt = 1; attempt <= count; attempt++) {
        await vi.advanceTimersByTimeAsync(4_000)
        await vi.advanceTimersByTimeAsync(500 * 2 ** (attempt - 1) + 1)
    }
}

beforeEach(() => {
    sfuFake.reset()
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
})
afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

describe('a lost announcement', () => {
    it('heals from the next room snapshot', async () => {
        // Bob's sfu-tracks broadcast never arrives. Nothing in the edge-driven
        // design would ever have made us subscribe to him: no retry helps,
        // because no retry knows there is anything to retry.
        const h = harness()
        h.reconciler.setPeerTracks('alice', 'cf-alice', ['t-alice'], 1)
        h.reconciler.reconcile()
        expect(sfuFake.allPulled()).toEqual([{ sessionId: 'cf-alice', trackName: 't-alice' }])

        h.reconciler.applySnapshot([
            { peerId: 'alice', sessionId: 'cf-alice', trackNames: ['t-alice'] },
            { peerId: 'bob', sessionId: 'cf-bob', trackNames: ['t-bob'] },
        ], 4)
        h.reconciler.reconcile()

        expect(sfuFake.allPulled()).toContainEqual({ sessionId: 'cf-bob', trackName: 't-bob' })
        // And the media actually reaches the caller, attributed to Bob.
        sfuFake.latestSubscribe().deliverLatestTrack('video')
        expect(h.tracks.at(-1)).toMatchObject({ sessionId: 'cf-bob', trackName: 't-bob' })
        expect(h.reconciler.peerForSession('cf-bob')).toBe('bob')
        h.close()
    })
})

describe('a peer who rebuilds their publish connection', () => {
    it('releases the dead session and pulls the new one', async () => {
        // Repair rung 2 rebuilds a publisher's PartyTracks, so they come back
        // under a new CF sessionId. The old subscribe connection receives
        // nothing from then on and is billed until something releases it.
        const h = harness()
        h.reconciler.setPeerTracks('alice', 'cf-a1', ['t-1'], 1)
        h.reconciler.reconcile()
        sfuFake.latestSubscribe().deliverLatestTrack('video')
        expect(h.tracks).toHaveLength(1)

        const before = sfuFake.subscribe().length
        h.reconciler.setPeerTracks('alice', 'cf-a2', ['t-2'], 2)
        h.reconciler.reconcile()

        // A fresh subscribe connection for the new session.
        expect(sfuFake.subscribe().length).toBe(before + 1)
        expect(sfuFake.allPulled()).toContainEqual({ sessionId: 'cf-a2', trackName: 't-2' })
        // The dead session is gone from the session's own view, which is what
        // stops us polling and paying for it.
        const stats = await h.session.collectStats()
        expect(stats.map((s) => s.sessionId)).not.toContain('cf-a1')
        expect(stats.map((s) => s.sessionId)).toContain('cf-a2')
        h.close()
    })
})

describe('a track that is pulled but never delivered', () => {
    it('is repaired and eventually flows', async () => {
        // The 2026-09-01 guest-side symptom: the pull was issued, Cloudflare
        // accepted it, and no media ever came. Before the repair ladder this
        // stayed dead for the rest of the call.
        const h = harness()
        h.reconciler.setPeerTracks('alice', 'cf-a', ['t-1'], 1)
        h.reconciler.reconcile()
        const sub = sfuFake.latestSubscribe()
        expect(sub.pullSubjects).toHaveLength(1)

        await repairCycles(1)
        // Rung 1 re-issued the pull against the same session.
        expect(sub.pullSubjects).toHaveLength(2)
        expect(h.tracks).toHaveLength(0)

        // The retry is what works. A shared pull subject would have made this
        // impossible to observe, which is why the fake gives each pull its own.
        sub.deliverLatestTrack('video')
        expect(h.tracks).toEqual([{ sessionId: 'cf-a', trackName: 't-1', kind: 'video' }])
        h.close()
    })

    it('escalates to a new subscribe connection when retrying keeps failing', async () => {
        const h = harness()
        h.reconciler.setPeerTracks('alice', 'cf-a', ['t-1'], 1)
        h.reconciler.reconcile()
        const before = sfuFake.subscribe().length

        await repairCycles(3)

        expect(sfuFake.subscribe().length).toBeGreaterThan(before)
        sfuFake.latestSubscribe().deliverLatestTrack('audio')
        expect(h.tracks.at(-1)).toMatchObject({ sessionId: 'cf-a', trackName: 't-1' })
        h.close()
    })

    it('recovers from a pull that errored, not just one that went quiet', async () => {
        const h = harness()
        h.reconciler.setPeerTracks('alice', 'cf-a', ['t-1'], 1)
        h.reconciler.reconcile()
        const sub = sfuFake.latestSubscribe()
        sub.failPull(0, new Error('SDP rejected'))

        await repairCycles(1)
        sub.deliverLatestTrack('video')
        expect(h.tracks).toHaveLength(1)
        h.close()
    })
})

describe('a push Cloudflare accepts but the browser never confirms', () => {
    it('is never announced to the room', async () => {
        // The 2026-09-01 publisher-side cause. The announce has to come from
        // the ack, because a track the browser has not confirmed is a track
        // nobody can pull — and announcing it hands every peer a dead pull.
        const announcements: unknown[] = []
        let session: SfuSession | null = null
        const reconciler = new CallReconciler({ getSession: () => session })
        session = new SfuSession({
            roomId: 'room-1', peerId: 'peer-me', iceServers: [],
            onLocalTracksChanged: (a) => announcements.push(a),
        })

        await session.publish({
            getTracks: () => [{ kind: 'audio', enabled: true, readyState: 'live', stop: vi.fn() }],
        } as unknown as MediaStream)
        const pub = sfuFake.latestPublish()
        expect(pub.pushCalls).toHaveLength(1)

        // No ack. Time passes, repairs run, and still nothing is announced.
        await repairCycles(2)
        expect(announcements).toEqual([])
        expect(session.getLocalTracksAnnouncement()).toBeNull()

        // The ack is what makes it announceable, however late it arrives.
        sfuFake.latestPublish().ackPush(sfuFake.latestPublish().pushCalls.length - 1, {
            sessionId: 'cf-pub', trackName: 'tn-audio',
        })
        expect(announcements).toHaveLength(1)
        expect(session.getLocalTracksAnnouncement()).toEqual({
            sessionId: 'cf-pub', tracks: [{ trackName: 'tn-audio' }],
        })
        void reconciler
        session.close()
    })
})

describe('a peer who leaves', () => {
    it('stops being repaired and stops being polled', async () => {
        // Repairs are unbounded by design, so departure is what has to end
        // them. Otherwise we keep rebuilding billed connections to pull media
        // from someone who is gone.
        const h = harness()
        h.reconciler.setPeerTracks('alice', 'cf-a', ['t-1'], 1)
        h.reconciler.reconcile()
        await repairCycles(1)
        const afterOneRepair = sfuFake.subscribe().length

        h.reconciler.removePeer('alice')
        h.reconciler.reconcile()
        await repairCycles(4)

        expect(sfuFake.subscribe().length).toBe(afterOneRepair)
        expect(await h.session.collectStats()).toEqual([])
        h.close()
    })
})

describe('a publish connection that drops', () => {
    it('keeps the stats poller pointed at the rebuilt one', async () => {
        // partytracks recreates the peer connection on its own. SfuSession has
        // to follow it, or collectStats keeps polling a closed connection and
        // the diagnostics panel silently freezes.
        const h = harness()
        await h.session.publish({
            getTracks: () => [{ kind: 'audio', enabled: true, readyState: 'live', stop: vi.fn() }],
        } as unknown as MediaStream)

        const pub = sfuFake.latestPublish()
        const firstPc = pub.pc
        pub.killPeerConnection()
        expect(pub.pc).not.toBe(firstPc)

        const stats = await h.session.collectStats()
        expect(stats.map((s) => s.id)).toContain('pub')
        // The new connection is the one being polled, not the discarded one.
        expect(pub.pc.getStatsCalls).toBe(1)
        expect(firstPc.getStatsCalls).toBe(0)
        h.close()
    })
})

// The network-switch case. Push and pull ack timers fire once, at setup, so
// before this nothing noticed a connection that failed later: signaling
// reconnected, the roster refilled, and media stayed dead for the whole call.
describe('a connection that fails and stays failed', () => {
    it('rebuilds the publish session', async () => {
        const h = harness()
        await h.session.publish({
            getTracks: () => [{ kind: 'audio', enabled: true, readyState: 'live', stop: vi.fn() }],
        } as unknown as MediaStream)
        sfuFake.latestPublish().ackPush(0, { sessionId: 'cf-me', trackName: 't-audio' })
        const before = sfuFake.publish().length

        sfuFake.latestPublish().peerConnectionState$.next('failed')
        await vi.advanceTimersByTimeAsync(1_000)

        expect(sfuFake.publish().length).toBe(before + 1)
        h.close()
    })

    it('rebuilds one peer subscribe session and re-pulls its tracks', async () => {
        const h = harness()
        h.reconciler.setPeerTracks('alice', 'cf-a', ['t-audio'], 1)
        h.reconciler.reconcile()
        await vi.advanceTimersByTimeAsync(0)
        const before = sfuFake.subscribe().length

        sfuFake.latestSubscribe().peerConnectionState$.next('failed')
        await vi.advanceTimersByTimeAsync(1_000)

        expect(sfuFake.subscribe().length).toBe(before + 1)
        expect(sfuFake.allPulled().filter((t) => t.trackName === 't-audio').length).toBeGreaterThan(1)
        h.close()
    })

    // partytracks rebuilds the connection itself in the common case. Racing it
    // with a second rebuild would throw away a session that just came back.
    it('does not rebuild when partytracks recovers on its own', async () => {
        const h = harness()
        await h.session.publish({
            getTracks: () => [{ kind: 'audio', enabled: true, readyState: 'live', stop: vi.fn() }],
        } as unknown as MediaStream)
        sfuFake.latestPublish().ackPush(0, { sessionId: 'cf-me', trackName: 't-audio' })
        const before = sfuFake.publish().length

        sfuFake.latestPublish().killPeerConnection()
        await vi.advanceTimersByTimeAsync(10_000)

        expect(sfuFake.publish().length).toBe(before)
        h.close()
    })
})

// The "video suddenly stuck" report. A pull that arrived and then went quiet
// had no recovery path: the dead-track timer only covers a track that never
// arrived, and an acked push never re-arms its ack timer.
describe('a stream that flowed and then went quiet', () => {
    it('rebuilds that peer subscribe session and re-pulls', async () => {
        const h = harness()
        h.reconciler.setPeerTracks('alice', 'cf-a', ['t-video'], 1)
        h.reconciler.reconcile()
        await vi.advanceTimersByTimeAsync(0)
        sfuFake.latestSubscribe().deliverTrack(0, 'video')
        const before = sfuFake.subscribe().length

        h.session.repairStalledFlow('subscribe', 'cf-a')
        await vi.advanceTimersByTimeAsync(1_000)

        expect(sfuFake.subscribe().length).toBe(before + 1)
        expect(sfuFake.allPulled().filter((t) => t.trackName === 't-video').length).toBeGreaterThan(1)
        h.close()
    })

    it('rebuilds the publish session when our own uplink goes quiet', async () => {
        const h = harness()
        await h.session.publish({
            getTracks: () => [{ kind: 'video', enabled: true, readyState: 'live', stop: vi.fn() }],
        } as unknown as MediaStream)
        sfuFake.latestPublish().ackPush(0, { sessionId: 'cf-me', trackName: 't-video' })
        const before = sfuFake.publish().length

        h.session.repairStalledFlow('publish')
        await vi.advanceTimersByTimeAsync(1_000)

        expect(sfuFake.publish().length).toBe(before + 1)
        h.close()
    })

    it('ignores a stall for a peer it is not subscribed to', async () => {
        const h = harness()
        const before = sfuFake.subscribe().length

        h.session.repairStalledFlow('subscribe', 'cf-nobody')
        await vi.advanceTimersByTimeAsync(5_000)

        expect(sfuFake.subscribe().length).toBe(before)
        h.close()
    })

    // Repeated stall reports arrive every 2s poll. They must collapse into one
    // rebuild rather than stacking a new CF session per poll.
    it('collapses repeated stall reports into one rebuild', async () => {
        const h = harness()
        h.reconciler.setPeerTracks('alice', 'cf-a', ['t-video'], 1)
        h.reconciler.reconcile()
        await vi.advanceTimersByTimeAsync(0)
        const before = sfuFake.subscribe().length

        h.session.repairStalledFlow('subscribe', 'cf-a')
        h.session.repairStalledFlow('subscribe', 'cf-a')
        h.session.repairStalledFlow('subscribe', 'cf-a')
        await vi.advanceTimersByTimeAsync(1_000)

        expect(sfuFake.subscribe().length).toBe(before + 1)
        h.close()
    })

    it('records a recovery so the ladder can be told from one that only spins', async () => {
        const repaired: string[] = []
        let session: SfuSession | null = null
        const reconciler = new CallReconciler({ getSession: () => session })
        session = new SfuSession({
            roomId: 'room-1', peerId: 'peer-me', iceServers: [],
            onRepaired: (info) => repaired.push(`${info.stage}:${info.rung}`),
        })
        reconciler.setPeerTracks('alice', 'cf-a', ['t-video'], 1)
        reconciler.reconcile()
        await vi.advanceTimersByTimeAsync(0)

        session.repairStalledFlow('subscribe', 'cf-a')
        await vi.advanceTimersByTimeAsync(1_000)
        session.settleStalledFlow('subscribe', 'cf-a')

        expect(repaired).toContain('subscribe:2')
        session.close()
    })
})
