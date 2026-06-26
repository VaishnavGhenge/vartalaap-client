/**
 * useCall — multi-peer SFU routing tests.
 *
 * The existing use-call.test.ts mocks SfuSession as a plain object (not a
 * constructor), so the async init never completes and sfuSession is never set
 * in the store. Those tests cover signaling-level peer tracking only.
 *
 * This file uses a proper constructor mock so the async init runs to completion.
 * Tests then verify the SFU routing layer for N > 2 peers:
 *   - sfu-tracks from multiple peers all trigger subscribe() calls
 *   - onRemoteTrack routes each track to the correct peer's stream
 *   - Distinct peers do not contaminate each other's MediaStreams
 *   - Buffered sfu-tracks for N peers all drain after sfuSession init
 *
 * If any of these fail, the remoteSessionToPeer routing in use-call.ts has a
 * bug for N > 2 and the bug will surface as black tiles in E2E tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useCall } from '../use-call'
import { usePeerStore } from '@/src/stores/peer'
import type { SignalingClient } from '@/src/services/signaling/client'
import type { Envelope } from '@/src/services/signaling/protocol'
import type { SfuSessionOptions } from '@/src/services/webrtc/sfu-session'

// ─── Captured before any vi.spyOn to avoid canvas recursion ──────────────────
const origCreateElement = document.createElement.bind(document)

// ─── SfuSession constructor mock ─────────────────────────────────────────────
// The production code uses `new SfuSession(opts)`. vi.fn().mockImplementation()
// with an arrow function cannot be called with `new` in Vitest. Using a class
// ensures the constructor succeeds and the async init in use-call.ts completes.
//
// Methods are thin closures over module-level vi.fn() instances so that
// beforeEach resets (mockSubscribe = vi.fn()...) are reflected in every call.

let capturedOnRemoteTrack: SfuSessionOptions['onRemoteTrack'] | undefined
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockSubscribe: (...args: any[]) => any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockPublish: (...args: any[]) => any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockClose: (...args: any[]) => any

vi.mock('@/src/services/webrtc/sfu-session', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SfuSession: class {
    constructor(opts: SfuSessionOptions) {
      capturedOnRemoteTrack = opts.onRemoteTrack
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subscribe(...args: any[]) { return mockSubscribe(...args) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    publish(...args: any[]) { return mockPublish(...args) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    close(...args: any[]) { return mockClose(...args) }
    replaceTrack() { return Promise.resolve() }
    unsubscribePeer() {}
  },
}))

vi.mock('@/src/services/api/ice', () => ({
  fetchIceServers: vi.fn().mockResolvedValue([]),
}))

// getAccessToken must return a truthy value so willKnock is false and the async
// init does not stall on knockGrantedPromise.
vi.mock('@/src/services/api/token', () => ({
  getAccessToken: vi.fn(() => 'test-access-token'),
  getRoomToken: vi.fn(() => null),
  setRoomToken: vi.fn(),
  subscribeTokenChange: vi.fn(() => () => {}),
}))

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
  setTag: vi.fn(),
  addBreadcrumb: vi.fn(),
}))

vi.mock('@/src/lib/sounds', () => ({
  playPeerJoined: vi.fn(),
  playPeerLeft: vi.fn(),
  playScreenShareStart: vi.fn(),
  playScreenShareStop: vi.fn(),
}))

vi.mock('@/src/stores/meet', () => ({
  useMeetStore: {
    getState: vi.fn(() => ({ setIsKnocking: vi.fn() })),
  },
}))

// ─── Fake SignalingClient ─────────────────────────────────────────────────────

function makeClient() {
  const handlers = new Map<string, Set<(env: Envelope) => void>>()
  const sent: { type: string; data?: unknown; extra?: unknown }[] = []

  const client = {
    on: vi.fn((type: string, handler: (env: Envelope) => void) => {
      const set = handlers.get(type) ?? new Set()
      set.add(handler)
      handlers.set(type, set)
    }),
    off: vi.fn((type: string, handler: (env: Envelope) => void) => {
      handlers.get(type)?.delete(handler)
    }),
    send: vi.fn((type: string, data?: unknown, extra?: unknown) => {
      sent.push({ type, data, extra })
    }),
    getPeerId: vi.fn(() => 'peer-alice'),
    getPresenceId: vi.fn(() => 'presence-alice-tab'),
    onReconnected: undefined as (() => void) | undefined,
    setReconnectedHandler: vi.fn((handler: (() => void) | undefined) => {
      client.onReconnected = handler
    }),

    emit(type: string, env: Partial<Envelope>) {
      handlers.get(type)?.forEach(h => h({ type: type as Envelope['type'], ...env }))
    },

    sent,
  }

  return client as unknown as SignalingClient & typeof client
}

// ─── Store + mock reset ───────────────────────────────────────────────────────

beforeEach(() => {
  capturedOnRemoteTrack = undefined
  mockSubscribe = vi.fn().mockResolvedValue(undefined)
  mockPublish = vi.fn().mockResolvedValue(undefined)
  mockClose = vi.fn()

  vi.stubGlobal('MediaStream', class {
    private _tracks: MediaStreamTrack[] = []
    getTracks() { return [...this._tracks] }
    getVideoTracks() { return this._tracks.filter(t => t.kind === 'video') }
    getAudioTracks() { return this._tracks.filter(t => t.kind === 'audio') }
    addTrack(t: MediaStreamTrack) { this._tracks.push(t) }
    removeTrack(t: MediaStreamTrack) { this._tracks = this._tracks.filter(x => x !== t) }
    constructor(tracks?: MediaStreamTrack[]) { this._tracks = tracks ?? [] }
  })
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') {
      return {
        width: 0, height: 0,
        captureStream: vi.fn(() => ({ getVideoTracks: () => [{ kind: 'video', stop: vi.fn() }] })),
      } as unknown as HTMLElement
    }
    return origCreateElement(tag)
  })

  usePeerStore.setState({
    peerConnections: new Map(),
    peerStats: new Map(),
    localStream: null,
    iceServers: [],
    sfuSession: null,
  })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

// ─── Helper: render hook and wait for sfuSession to be created ───────────────

async function renderAndInit() {
  const client = makeClient()

  renderHook(() => useCall({
    client,
    roomId: 'room-1',
    enabled: true,
    userName: 'Alice',
    initialAudio: true,
    initialVideo: true,
  }))

  // Resolve joinedAck so the async init can proceed past `await joinedAck`.
  await act(async () => {
    client.emit('joined', { data: { peers: [] } })
  })

  // Wait for the async init to set sfuSession in the store.
  await waitFor(() => {
    expect(usePeerStore.getState().sfuSession).not.toBeNull()
  }, { timeout: 3_000 })

  return client
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useCall — multi-peer SFU routing (N > 2)', () => {
  describe('sfu-tracks subscription — subscribe() call count', () => {
    it('calls subscribe once for each of 3 distinct remote peers', async () => {
      const client = await renderAndInit()

      await act(async () => {
        client.emit('sfu-tracks', { from: 'peer-bob',   data: { sessionId: 'sfu-bob',   tracks: [{ trackName: 'video' }] } })
        client.emit('sfu-tracks', { from: 'peer-carol', data: { sessionId: 'sfu-carol', tracks: [{ trackName: 'video' }] } })
        client.emit('sfu-tracks', { from: 'peer-dave',  data: { sessionId: 'sfu-dave',  tracks: [{ trackName: 'video' }] } })
      })

      expect(mockSubscribe).toHaveBeenCalledTimes(3)
      expect(mockSubscribe).toHaveBeenCalledWith('sfu-bob',   ['video'])
      expect(mockSubscribe).toHaveBeenCalledWith('sfu-carol', ['video'])
      expect(mockSubscribe).toHaveBeenCalledWith('sfu-dave',  ['video'])
    })

    it('calls subscribe once for each of 5 distinct remote peers', async () => {
      const client = await renderAndInit()

      const peers = [
        { id: 'peer-b', sfu: 'sfu-b' }, { id: 'peer-c', sfu: 'sfu-c' },
        { id: 'peer-d', sfu: 'sfu-d' }, { id: 'peer-e', sfu: 'sfu-e' },
        { id: 'peer-f', sfu: 'sfu-f' },
      ]

      await act(async () => {
        for (const { id, sfu } of peers) {
          client.emit('sfu-tracks', { from: id, data: { sessionId: sfu, tracks: [{ trackName: 'video' }, { trackName: 'audio' }] } })
        }
      })

      expect(mockSubscribe).toHaveBeenCalledTimes(5)
      for (const { sfu } of peers) {
        expect(mockSubscribe).toHaveBeenCalledWith(sfu, ['video', 'audio'])
      }
    })

    it('does not deduplicate subscribe calls for distinct session IDs', async () => {
      const client = await renderAndInit()

      await act(async () => {
        // Two different peers, two different session IDs — both must be subscribed.
        client.emit('sfu-tracks', { from: 'peer-bob',   data: { sessionId: 'sfu-bob-pub',   tracks: [{ trackName: 'video' }] } })
        client.emit('sfu-tracks', { from: 'peer-carol', data: { sessionId: 'sfu-carol-pub', tracks: [{ trackName: 'video' }] } })
      })

      expect(mockSubscribe).toHaveBeenCalledTimes(2)
    })
  })

  describe('onRemoteTrack routing — track attribution', () => {
    it('routes each remote track to the correct peer\'s stream', async () => {
      const client = await renderAndInit()

      // Register 3 peers via joined event
      await act(async () => {
        client.emit('joined', {
          data: {
            peers: [
              { id: 'peer-bob',   name: 'Bob',   audio: true, video: true },
              { id: 'peer-carol', name: 'Carol', audio: true, video: true },
              { id: 'peer-dave',  name: 'Dave',  audio: true, video: true },
            ],
          },
        })
      })

      // Register session ID → peer ID mappings via sfu-tracks
      await act(async () => {
        client.emit('sfu-tracks', { from: 'peer-bob',   data: { sessionId: 'sfu-bob',   tracks: [{ trackName: 'video' }] } })
        client.emit('sfu-tracks', { from: 'peer-carol', data: { sessionId: 'sfu-carol', tracks: [{ trackName: 'video' }] } })
        client.emit('sfu-tracks', { from: 'peer-dave',  data: { sessionId: 'sfu-dave',  tracks: [{ trackName: 'video' }] } })
      })

      const makeTrack = (kind: string) => ({ kind, stop: vi.fn(), readyState: 'live' }) as unknown as MediaStreamTrack

      await act(async () => {
        // Simulate remote tracks arriving from each peer's publish session.
        capturedOnRemoteTrack?.(makeTrack('video'), 'sfu-bob',   'video')
        capturedOnRemoteTrack?.(makeTrack('video'), 'sfu-carol', 'video')
        capturedOnRemoteTrack?.(makeTrack('video'), 'sfu-dave',  'video')
      })

      const peers = usePeerStore.getState().peerConnections
      expect(peers.get('peer-bob')?.stream).toBeDefined()
      expect(peers.get('peer-carol')?.stream).toBeDefined()
      expect(peers.get('peer-dave')?.stream).toBeDefined()
    })

    it('does not cross-contaminate streams between peers', async () => {
      const client = await renderAndInit()

      await act(async () => {
        client.emit('joined', {
          data: {
            peers: [
              { id: 'peer-bob',   name: 'Bob',   audio: false, video: true },
              { id: 'peer-carol', name: 'Carol', audio: false, video: true },
            ],
          },
        })
        client.emit('sfu-tracks', { from: 'peer-bob',   data: { sessionId: 'sfu-bob',   tracks: [{ trackName: 'video' }] } })
        client.emit('sfu-tracks', { from: 'peer-carol', data: { sessionId: 'sfu-carol', tracks: [{ trackName: 'video' }] } })
      })

      const bobTrack   = { kind: 'video', id: 'track-bob',   stop: vi.fn(), readyState: 'live' } as unknown as MediaStreamTrack
      const carolTrack = { kind: 'video', id: 'track-carol', stop: vi.fn(), readyState: 'live' } as unknown as MediaStreamTrack

      await act(async () => {
        capturedOnRemoteTrack?.(bobTrack,   'sfu-bob',   'video')
        capturedOnRemoteTrack?.(carolTrack, 'sfu-carol', 'video')
      })

      const peers = usePeerStore.getState().peerConnections
      const bobStream   = peers.get('peer-bob')?.stream
      const carolStream = peers.get('peer-carol')?.stream

      // Each peer has their own distinct stream object.
      expect(bobStream).toBeDefined()
      expect(carolStream).toBeDefined()
      expect(bobStream).not.toBe(carolStream)

      // Bob's stream contains Bob's track, not Carol's.
      expect(bobStream?.getTracks().some(t => (t as MediaStreamTrack & { id: string }).id === 'track-bob')).toBe(true)
      expect(bobStream?.getTracks().some(t => (t as MediaStreamTrack & { id: string }).id === 'track-carol')).toBe(false)

      // Carol's stream contains Carol's track, not Bob's.
      expect(carolStream?.getTracks().some(t => (t as MediaStreamTrack & { id: string }).id === 'track-carol')).toBe(true)
      expect(carolStream?.getTracks().some(t => (t as MediaStreamTrack & { id: string }).id === 'track-bob')).toBe(false)
    })

    it('ignores remote tracks for unknown session IDs without crashing', async () => {
      await renderAndInit()

      const track = { kind: 'video', stop: vi.fn(), readyState: 'live' } as unknown as MediaStreamTrack

      // No sfu-tracks event was emitted so 'sfu-unknown' has no peer mapping.
      // onRemoteTrack should warn and return without throwing.
      await act(async () => {
        expect(() => {
          capturedOnRemoteTrack?.(track, 'sfu-unknown', 'video')
        }).not.toThrow()
      })

      // The store must not have gained any peer stream for the unknown session.
      const peers = usePeerStore.getState().peerConnections
      const anyStreamUpdated = [...peers.values()].some(p => p.stream !== undefined)
      expect(anyStreamUpdated).toBe(false)
    })
  })

  describe('pendingSfuTracks buffer — late sfuSession init', () => {
    it('drains all 3 buffered sfu-tracks after sfuSession is created', async () => {
      const client = makeClient()

      // Do NOT emit `joined` yet — keep sfuSession null so sfu-tracks are buffered.
      renderHook(() => useCall({
        client,
        roomId: 'room-1',
        enabled: true,
        userName: 'Alice',
        initialAudio: true,
        initialVideo: true,
      }))

      // Emit sfu-tracks before joined is acknowledged (sfuSession = null → buffer).
      await act(async () => {
        client.emit('sfu-tracks', { from: 'peer-bob',   data: { sessionId: 'sfu-bob',   tracks: [{ trackName: 'video' }] } })
        client.emit('sfu-tracks', { from: 'peer-carol', data: { sessionId: 'sfu-carol', tracks: [{ trackName: 'video' }] } })
        client.emit('sfu-tracks', { from: 'peer-dave',  data: { sessionId: 'sfu-dave',  tracks: [{ trackName: 'video' }] } })
      })

      // sfuSession must not be set yet.
      expect(usePeerStore.getState().sfuSession).toBeNull()

      // Now resolve joinedAck — triggers async init which will drain the buffer.
      await act(async () => {
        client.emit('joined', { data: { peers: [] } })
      })

      await waitFor(() => {
        expect(usePeerStore.getState().sfuSession).not.toBeNull()
      }, { timeout: 3_000 })

      // All 3 buffered entries must have been subscribed after sfuSession init.
      expect(mockSubscribe).toHaveBeenCalledTimes(3)
      expect(mockSubscribe).toHaveBeenCalledWith('sfu-bob',   ['video'])
      expect(mockSubscribe).toHaveBeenCalledWith('sfu-carol', ['video'])
      expect(mockSubscribe).toHaveBeenCalledWith('sfu-dave',  ['video'])
    })

    it('remoteSessionToPeer mapping is intact for all buffered entries', async () => {
      const client = makeClient()

      renderHook(() => useCall({
        client,
        roomId: 'room-1',
        enabled: true,
        userName: 'Alice',
        initialAudio: true,
        initialVideo: true,
      }))

      // Buffer sfu-tracks before init
      await act(async () => {
        client.emit('sfu-tracks', { from: 'peer-bob',   data: { sessionId: 'sfu-bob',   tracks: [{ trackName: 'video' }] } })
        client.emit('sfu-tracks', { from: 'peer-carol', data: { sessionId: 'sfu-carol', tracks: [{ trackName: 'video' }] } })
      })

      // Trigger init and register peers
      await act(async () => {
        client.emit('joined', {
          data: {
            peers: [
              { id: 'peer-bob',   name: 'Bob',   audio: false, video: true },
              { id: 'peer-carol', name: 'Carol', audio: false, video: true },
            ],
          },
        })
      })

      await waitFor(() => {
        expect(usePeerStore.getState().sfuSession).not.toBeNull()
      }, { timeout: 3_000 })

      const bobTrack   = { kind: 'video', id: 'bt', stop: vi.fn(), readyState: 'live' } as unknown as MediaStreamTrack
      const carolTrack = { kind: 'video', id: 'ct', stop: vi.fn(), readyState: 'live' } as unknown as MediaStreamTrack

      await act(async () => {
        capturedOnRemoteTrack?.(bobTrack,   'sfu-bob',   'video')
        capturedOnRemoteTrack?.(carolTrack, 'sfu-carol', 'video')
      })

      // Both peers must have received their stream even though sfu-tracks arrived
      // before sfuSession was created.
      expect(usePeerStore.getState().peerConnections.get('peer-bob')?.stream).toBeDefined()
      expect(usePeerStore.getState().peerConnections.get('peer-carol')?.stream).toBeDefined()
    })
  })

  describe('fourth peer joining sequentially', () => {
    it('subscribes to the 4th peer\'s sfu-tracks after 3 were already subscribed', async () => {
      const client = await renderAndInit()

      await act(async () => {
        client.emit('sfu-tracks', { from: 'peer-b', data: { sessionId: 'sfu-b', tracks: [{ trackName: 'video' }] } })
        client.emit('sfu-tracks', { from: 'peer-c', data: { sessionId: 'sfu-c', tracks: [{ trackName: 'video' }] } })
        client.emit('sfu-tracks', { from: 'peer-d', data: { sessionId: 'sfu-d', tracks: [{ trackName: 'video' }] } })
      })

      expect(mockSubscribe).toHaveBeenCalledTimes(3)

      // Fourth peer joins
      await act(async () => {
        client.emit('peer-joined', { data: { peerId: 'peer-e', name: 'Eve', audio: true, video: true } })
        client.emit('sfu-tracks', { from: 'peer-e', data: { sessionId: 'sfu-e', tracks: [{ trackName: 'video' }] } })
      })

      expect(mockSubscribe).toHaveBeenCalledTimes(4)
      expect(mockSubscribe).toHaveBeenCalledWith('sfu-e', ['video'])
    })

    it('4th peer\'s remote track is attributed to the correct stream', async () => {
      const client = await renderAndInit()

      await act(async () => {
        client.emit('joined', {
          data: {
            peers: [
              { id: 'peer-b', name: 'Bob',   audio: false, video: true },
              { id: 'peer-c', name: 'Carol', audio: false, video: true },
              { id: 'peer-d', name: 'Dave',  audio: false, video: true },
            ],
          },
        })
        client.emit('sfu-tracks', { from: 'peer-b', data: { sessionId: 'sfu-b', tracks: [{ trackName: 'video' }] } })
        client.emit('sfu-tracks', { from: 'peer-c', data: { sessionId: 'sfu-c', tracks: [{ trackName: 'video' }] } })
        client.emit('sfu-tracks', { from: 'peer-d', data: { sessionId: 'sfu-d', tracks: [{ trackName: 'video' }] } })
      })

      await act(async () => {
        client.emit('peer-joined', { data: { peerId: 'peer-e', name: 'Eve', audio: false, video: true } })
        client.emit('sfu-tracks', { from: 'peer-e', data: { sessionId: 'sfu-e', tracks: [{ trackName: 'video' }] } })
      })

      const eveTrack = { kind: 'video', id: 'eve-t', stop: vi.fn(), readyState: 'live' } as unknown as MediaStreamTrack
      await act(async () => {
        capturedOnRemoteTrack?.(eveTrack, 'sfu-e', 'video')
      })

      const peers = usePeerStore.getState().peerConnections
      expect(peers.get('peer-e')?.stream).toBeDefined()
      // Verify no other peer accidentally received Eve's track
      expect(peers.get('peer-b')?.stream).toBeUndefined()
      expect(peers.get('peer-c')?.stream).toBeUndefined()
      expect(peers.get('peer-d')?.stream).toBeUndefined()
    })
  })
})
