import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CallReconciler, type DropReason } from '../call-reconciler'
import type { SfuSession } from '../sfu-session'

// A stand-in for SfuSession recording only what the reconciler drives: which
// tracks it asked to pull, and which sessions it released.
function fakeSession() {
    const subscribes: Array<{ sessionId: string; trackNames: string[] }> = []
    const unsubscribed: string[] = []
    const session = {
        subscribe: vi.fn(async (sessionId: string, trackNames: string[]) => {
            subscribes.push({ sessionId, trackNames })
        }),
        unsubscribePeer: vi.fn((sessionId: string) => { unsubscribed.push(sessionId) }),
    } as unknown as SfuSession
    return { session, subscribes, unsubscribed }
}

function setup(over: { session?: SfuSession | null } = {}) {
    const fake = fakeSession()
    const drops: Array<{ peerId: string; sessionId: string; reason: DropReason }> = []
    let current: SfuSession | null = over.session === undefined ? fake.session : over.session
    const reconciler = new CallReconciler({
        getSession: () => current,
        onDrop: (e) => drops.push({ peerId: e.peerId, sessionId: e.sessionId, reason: e.reason }),
    })
    return { reconciler, drops, ...fake, setSession: (s: SfuSession | null) => { current = s } }
}

describe('CallReconciler', () => {
    let ctx: ReturnType<typeof setup>
    beforeEach(() => { ctx = setup() })

    it('subscribes to what the room says a peer publishes', () => {
        ctx.reconciler.setPeerTracks('alice', 'cf-a', ['t-audio', 't-video'], 1)
        ctx.reconciler.reconcile()
        expect(ctx.subscribes).toEqual([{ sessionId: 'cf-a', trackNames: ['t-audio', 't-video'] }])
    })

    it('only subscribes to tracks it has not already pulled', () => {
        ctx.reconciler.setPeerTracks('alice', 'cf-a', ['t-audio'], 1)
        ctx.reconciler.reconcile()
        ctx.reconciler.setPeerTracks('alice', 'cf-a', ['t-audio', 't-video'], 2)
        ctx.reconciler.reconcile()
        expect(ctx.subscribes).toEqual([
            { sessionId: 'cf-a', trackNames: ['t-audio'] },
            { sessionId: 'cf-a', trackNames: ['t-video'] },
        ])
    })

    it('does nothing on a reconcile with no change', () => {
        ctx.reconciler.setPeerTracks('alice', 'cf-a', ['t-audio'], 1)
        ctx.reconciler.reconcile()
        ctx.reconciler.reconcile()
        ctx.reconciler.reconcile()
        expect(ctx.subscribes).toHaveLength(1)
        expect(ctx.unsubscribed).toEqual([])
    })

    it('records desired state before the session exists and applies it later', () => {
        // The old code buffered raw messages for this. Desired state does not
        // need buffering: it is just state, and reconcile picks it up.
        const late = setup({ session: null })
        late.reconciler.setPeerTracks('alice', 'cf-a', ['t-audio'], 1)
        late.reconciler.reconcile()
        expect(late.subscribes).toEqual([])

        late.setSession(late.session)
        late.reconciler.reconcile()
        expect(late.subscribes).toEqual([{ sessionId: 'cf-a', trackNames: ['t-audio'] }])
    })

    it('releases the old session when a peer republishes under a new one', () => {
        // A peer whose publish connection was rebuilt (repair rung 2) comes
        // back under a new CF sessionId. Holding the old subscription open
        // keeps paying for a connection that receives nothing, and keeps
        // pulling tracks nobody is sending.
        ctx.reconciler.setPeerTracks('alice', 'cf-a1', ['t-audio'], 1)
        ctx.reconciler.reconcile()
        ctx.reconciler.setPeerTracks('alice', 'cf-a2', ['t-audio-2'], 2)
        ctx.reconciler.reconcile()

        expect(ctx.unsubscribed).toEqual(['cf-a1'])
        expect(ctx.drops).toEqual([{ peerId: 'alice', sessionId: 'cf-a1', reason: 'session-replaced' }])
        expect(ctx.subscribes.at(-1)).toEqual({ sessionId: 'cf-a2', trackNames: ['t-audio-2'] })
        // The stale session must stop resolving to a peer, or a late track from
        // it would be attributed to a participant we are no longer pulling.
        expect(ctx.reconciler.peerForSession('cf-a1')).toBeUndefined()
        expect(ctx.reconciler.peerForSession('cf-a2')).toBe('alice')
    })

    it('releases a peer that left', () => {
        ctx.reconciler.setPeerTracks('alice', 'cf-a', ['t-audio'], 1)
        ctx.reconciler.reconcile()
        ctx.reconciler.removePeer('alice')
        ctx.reconciler.reconcile()
        expect(ctx.unsubscribed).toEqual(['cf-a'])
        expect(ctx.reconciler.appliedPeers()).toEqual([])
    })

    it('heals a missed announcement from a snapshot', () => {
        // The failure this exists for: an sfu-tracks broadcast never arrived,
        // so nothing would ever have made us subscribe to Bob.
        ctx.reconciler.setPeerTracks('alice', 'cf-a', ['t-a'], 1)
        ctx.reconciler.reconcile()

        ctx.reconciler.applySnapshot([
            { peerId: 'alice', sessionId: 'cf-a', trackNames: ['t-a'] },
            { peerId: 'bob', sessionId: 'cf-b', trackNames: ['t-b'] },
        ], 5)
        ctx.reconciler.reconcile()

        expect(ctx.subscribes.at(-1)).toEqual({ sessionId: 'cf-b', trackNames: ['t-b'] })
        // Alice was already correct and must not be re-subscribed.
        expect(ctx.subscribes).toHaveLength(2)
    })

    it('drops a peer the snapshot no longer lists', () => {
        ctx.reconciler.setPeerTracks('alice', 'cf-a', ['t-a'], 1)
        ctx.reconciler.setPeerTracks('bob', 'cf-b', ['t-b'], 2)
        ctx.reconciler.reconcile()

        ctx.reconciler.applySnapshot([{ peerId: 'alice', sessionId: 'cf-a', trackNames: ['t-a'] }], 5)
        ctx.reconciler.reconcile()

        expect(ctx.unsubscribed).toEqual(['cf-b'])
        expect(ctx.drops.at(-1)?.reason).toBe('absent-from-snapshot')
    })

    it('ignores a snapshot older than an update already applied', () => {
        // The race this guards: a snapshot is built, a peer announces, both are
        // in flight. Applying the older snapshot would roll the announcement
        // back and the track would go dark until the next snapshot.
        ctx.reconciler.setPeerTracks('alice', 'cf-a', ['t-a'], 7)
        ctx.reconciler.reconcile()

        const applied = ctx.reconciler.applySnapshot([], 5)
        ctx.reconciler.reconcile()

        expect(applied).toBe(false)
        expect(ctx.unsubscribed).toEqual([])
    })

    it('ignores an announcement older than a snapshot already applied', () => {
        ctx.reconciler.applySnapshot([{ peerId: 'alice', sessionId: 'cf-a', trackNames: ['t-a'] }], 9)
        ctx.reconciler.reconcile()

        const applied = ctx.reconciler.setPeerTracks('alice', 'cf-old', ['t-old'], 4)
        ctx.reconciler.reconcile()

        expect(applied).toBe(false)
        expect(ctx.unsubscribed).toEqual([])
        expect(ctx.reconciler.sessionForPeer('alice')).toBe('cf-a')
    })

    it('applies an unversioned update rather than discarding it', () => {
        // Version 0 means the sender did not stamp one. No ordering information
        // is not the same as being stale.
        ctx.reconciler.applySnapshot([{ peerId: 'alice', sessionId: 'cf-a', trackNames: ['t-a'] }], 9)
        ctx.reconciler.reconcile()
        const applied = ctx.reconciler.setPeerTracks('bob', 'cf-b', ['t-b'])
        ctx.reconciler.reconcile()
        expect(applied).toBe(true)
        expect(ctx.subscribes.at(-1)).toEqual({ sessionId: 'cf-b', trackNames: ['t-b'] })
    })

    it('forgets everything on clear, including the version floor', () => {
        // After a signaling reconnect the room may have moved on without us,
        // and a fresh server would restart its version counter. Holding the old
        // floor would make every later snapshot look stale.
        ctx.reconciler.applySnapshot([{ peerId: 'alice', sessionId: 'cf-a', trackNames: ['t-a'] }], 99)
        ctx.reconciler.reconcile()
        ctx.reconciler.clear()

        expect(ctx.reconciler.appliedPeers()).toEqual([])
        expect(ctx.reconciler.peerForSession('cf-a')).toBeUndefined()

        const applied = ctx.reconciler.applySnapshot([{ peerId: 'bob', sessionId: 'cf-b', trackNames: ['t-b'] }], 1)
        expect(applied).toBe(true)
        ctx.reconciler.reconcile()
        expect(ctx.subscribes.at(-1)).toEqual({ sessionId: 'cf-b', trackNames: ['t-b'] })
    })

    it('survives a subscribe that rejects', () => {
        const fake = fakeSession()
        ;(fake.session.subscribe as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nope'))
        const reconciler = new CallReconciler({ getSession: () => fake.session })
        reconciler.setPeerTracks('alice', 'cf-a', ['t-a'], 1)
        expect(() => reconciler.reconcile()).not.toThrow()
    })
})
