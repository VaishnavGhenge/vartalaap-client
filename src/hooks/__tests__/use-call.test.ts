import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCall } from '../use-call'
import { usePeerStore } from '@/src/stores/peer'
import type { SignalingClient } from '@/src/services/signaling/client'
import type { Envelope } from '@/src/services/signaling/protocol'

// Captured before any vi.spyOn so the canvas stub fallback never recurses.
const origCreateElement = document.createElement.bind(document)

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/src/services/api/ice', () => ({
  fetchIceServers: vi.fn().mockResolvedValue([]),
}))

// Without a token useCall knocks and waits for an admit that never comes, so
// setup never reaches the SFU session.
vi.mock('@/src/services/api/token', () => ({
  getAccessToken: vi.fn(() => 'test-access-token'),
  setAccessToken: vi.fn(),
  getRoomToken: vi.fn(() => null),
  setRoomToken: vi.fn(),
  subscribeTokenChange: vi.fn(() => () => {}),
}))

// use-call does `new SfuSession(...)`, so this has to be constructible — a
// `function`, not an arrow. It mocked a static create() that no longer exists,
// which threw inside the setup IIFE, and every test here ran against no SFU
// session at all while still passing.
vi.mock('@/src/services/webrtc/sfu-session', () => ({
  SfuSession: vi.fn(function SfuSessionMock() {
    return {
      sessionId: 'test-sfu-session',
      publish: vi.fn().mockResolvedValue(undefined),
      replaceTrack: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribePeer: vi.fn(),
      unsubscribeTrack: vi.fn(),
      getLocalTracksAnnouncement: vi.fn(() => null),
      collectStats: vi.fn().mockResolvedValue([]),
      close: vi.fn(),
    }
  }),
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

// ─── Store reset ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('MediaStream', class {
    private _tracks: MediaStreamTrack[] = []
    getTracks() { return [...this._tracks] }
    getVideoTracks() { return this._tracks.filter(t => t.kind === 'video') }
    getAudioTracks() { return this._tracks.filter(t => t.kind === 'audio') }
    addTrack(t: MediaStreamTrack) { this._tracks.push(t) }
    removeTrack(t: MediaStreamTrack) { this._tracks = this._tracks.filter(x => x !== t) }
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
  usePeerStore.setState({ peerConnections: new Map(), peerStats: new Map(), localStream: null, iceServers: [] })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useCall — join', () => {
  it('sends join when client is connected and enabled', async () => {
    const client = makeClient()

    await act(async () => {
      renderHook(() => useCall({
        client,
        roomId: 'room-1',
        enabled: true,
        userName: 'Alice',
        initialAudio: true,
        initialVideo: true,
      }))
    })

    const joinMsg = client.sent.find(m => m.type === 'join')
    expect(joinMsg).toBeDefined()
    expect(joinMsg?.data).toMatchObject({
      name: 'Alice',
      audio: true,
      video: true,
      presenceId: 'presence-alice-tab',
    })
    expect((joinMsg?.extra as Record<string, unknown>)?.room).toBe('room-1')
  })

  it('does NOT send join when enabled is false', async () => {
    const client = makeClient()

    await act(async () => {
      renderHook(() => useCall({
        client,
        roomId: 'room-1',
        enabled: false,
        userName: 'Alice',
        initialAudio: true,
        initialVideo: true,
      }))
    })

    expect(client.sent.find(m => m.type === 'join')).toBeUndefined()
  })

  it('does NOT send join when client is null', async () => {
    const sendFn = vi.fn()

    await act(async () => {
      renderHook(() => useCall({
        client: null,
        roomId: 'room-1',
        enabled: true,
        userName: 'Alice',
        initialAudio: true,
        initialVideo: true,
      }))
    })

    expect(sendFn).not.toHaveBeenCalled()
  })
})

describe('useCall — peer creation', () => {
  it('creates a session for each peer in the joined response', async () => {
    const client = makeClient()

    await act(async () => {
      renderHook(() => useCall({
        client, roomId: 'room-1', enabled: true,
        userName: 'Alice', initialAudio: true, initialVideo: true,
      }))
    })

    await act(async () => {
      client.emit('joined', {
        data: {
          peers: [
            { id: 'peer-bob', name: 'Bob', audio: true, video: false },
            { id: 'peer-carol', name: 'Carol', audio: false, video: true },
          ],
        },
      })
    })

    const peers = usePeerStore.getState().peerConnections
    expect(peers.has('peer-bob')).toBe(true)
    expect(peers.has('peer-carol')).toBe(true)
  })

  it('creates a session when peer-joined fires', async () => {
    const client = makeClient()

    await act(async () => {
      renderHook(() => useCall({
        client, roomId: 'room-1', enabled: true,
        userName: 'Alice', initialAudio: true, initialVideo: true,
      }))
    })

    await act(async () => {
      client.emit('peer-joined', {
        data: { peerId: 'peer-bob', name: 'Bob', audio: true, video: true },
      })
    })

    expect(usePeerStore.getState().peerConnections.has('peer-bob')).toBe(true)
  })

  it('stores peer name and initial media state from peer-joined', async () => {
    const client = makeClient()

    await act(async () => {
      renderHook(() => useCall({
        client, roomId: 'room-1', enabled: true,
        userName: 'Alice', initialAudio: true, initialVideo: true,
      }))
    })

    await act(async () => {
      client.emit('peer-joined', {
        data: { peerId: 'peer-bob', name: 'Bob', audio: false, video: true },
      })
    })

    const bob = usePeerStore.getState().peerConnections.get('peer-bob')
    expect(bob?.name).toBe('Bob')
    expect(bob?.audio).toBe(false)
    expect(bob?.video).toBe(true)
  })
})

describe('useCall — peer removal', () => {
  it('removes a peer when peer-left fires', async () => {
    const client = makeClient()

    await act(async () => {
      renderHook(() => useCall({
        client, roomId: 'room-1', enabled: true,
        userName: 'Alice', initialAudio: true, initialVideo: true,
      }))
    })

    await act(async () => {
      client.emit('peer-joined', {
        data: { peerId: 'peer-bob', name: 'Bob', audio: true, video: true },
      })
    })

    expect(usePeerStore.getState().peerConnections.has('peer-bob')).toBe(true)

    await act(async () => {
      client.emit('peer-left', { data: { peerId: 'peer-bob' } })
    })

    expect(usePeerStore.getState().peerConnections.has('peer-bob')).toBe(false)
  })
})

describe('useCall — peer-state', () => {
  it('updates audio and video state for the matching peer', async () => {
    const client = makeClient()

    await act(async () => {
      renderHook(() => useCall({
        client, roomId: 'room-1', enabled: true,
        userName: 'Alice', initialAudio: true, initialVideo: true,
      }))
    })

    await act(async () => {
      client.emit('peer-joined', {
        data: { peerId: 'peer-bob', name: 'Bob', audio: true, video: true },
      })
    })

    await act(async () => {
      client.emit('peer-state', {
        from: 'peer-bob',
        data: { audio: false, video: true, speaking: false },
      })
    })

    const bob = usePeerStore.getState().peerConnections.get('peer-bob')
    expect(bob?.audio).toBe(false)
  })

  it('treats absent speaking field as false (not sticky)', async () => {
    const client = makeClient()

    await act(async () => {
      renderHook(() => useCall({
        client, roomId: 'room-1', enabled: true,
        userName: 'Alice', initialAudio: true, initialVideo: true,
      }))
    })

    await act(async () => {
      client.emit('peer-joined', {
        data: { peerId: 'peer-bob', name: 'Bob', audio: true, video: true },
      })
    })

    await act(async () => {
      client.emit('peer-state', {
        from: 'peer-bob',
        data: { audio: true, video: true, speaking: true },
      })
    })

    await act(async () => {
      client.emit('peer-state', {
        from: 'peer-bob',
        data: { audio: true, video: true },
      })
    })

    const bob = usePeerStore.getState().peerConnections.get('peer-bob')
    expect(bob?.speaking).toBe(false)
  })

  it('updates videoHeld from peer-state and preserves it when omitted', async () => {
    const client = makeClient()

    await act(async () => {
      renderHook(() => useCall({
        client, roomId: 'room-1', enabled: true,
        userName: 'Alice', initialAudio: true, initialVideo: true,
      }))
    })

    await act(async () => {
      client.emit('peer-joined', {
        data: { peerId: 'peer-bob', name: 'Bob', audio: true, video: true },
      })
    })

    await act(async () => {
      client.emit('peer-state', {
        from: 'peer-bob',
        data: { audio: true, video: true, videoHeld: true },
      })
    })

    expect(usePeerStore.getState().peerConnections.get('peer-bob')?.videoHeld).toBe(true)

    await act(async () => {
      client.emit('peer-state', {
        from: 'peer-bob',
        data: { audio: true, video: true, speaking: false },
      })
    })

    expect(usePeerStore.getState().peerConnections.get('peer-bob')?.videoHeld).toBe(true)
  })
})

describe('useCall — reconnect', () => {
  it('re-sends join and asks for a snapshot', async () => {
    const client = makeClient()

    await act(async () => {
      renderHook(() => useCall({
        client, roomId: 'room-1', enabled: true,
        userName: 'Alice', initialAudio: true, initialVideo: true,
      }))
    })

    await act(async () => { client.emit('joined', { data: { peers: [] } }) })
    const joinCountBefore = client.sent.filter(m => m.type === 'join').length

    await act(async () => {
      (client as unknown as SignalingClient).onReconnected?.()
      client.emit('joined', { data: { peers: [] } })
    })

    expect(client.sent.filter(m => m.type === 'join').length).toBe(joinCountBefore + 1)
    expect(client.sent.some(m => m.type === 'sync')).toBe(true)
  })

  // A reconnect used to tear down the SFU session, and nothing recreates it:
  // the rest of the call could neither publish nor subscribe, so peers were
  // listed with no media and every camera toggle was a silent no-op.
  it('keeps the SFU session across a reconnect', async () => {
    const client = makeClient()

    await act(async () => {
      renderHook(() => useCall({
        client, roomId: 'room-1', enabled: true,
        userName: 'Alice', initialAudio: true, initialVideo: true,
      }))
    })

    await act(async () => { client.emit('joined', { data: { peers: [] } }) })
    // Session setup awaits the ICE fetch after the join ack.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    const session = usePeerStore.getState().sfuSession
    expect(session).not.toBeNull()

    await act(async () => {
      (client as unknown as SignalingClient).onReconnected?.()
      client.emit('joined', { data: { peers: [] } })
    })

    expect(usePeerStore.getState().sfuSession).toBe(session)
  })

  // The tile's stream survives too. A live pull never re-emits its track, so a
  // peer dropped here would stay blank for the rest of the call.
  it('keeps a peer and their stream across a reconnect', async () => {
    const client = makeClient()

    await act(async () => {
      renderHook(() => useCall({
        client, roomId: 'room-1', enabled: true,
        userName: 'Alice', initialAudio: true, initialVideo: true,
      }))
    })

    await act(async () => {
      client.emit('peer-joined', {
        data: { peerId: 'peer-bob', name: 'Bob', audio: true, video: true },
      })
    })
    const stream = new MediaStream()
    usePeerStore.getState().updatePeerStream('peer-bob', stream)

    await act(async () => {
      (client as unknown as SignalingClient).onReconnected?.()
    })

    expect(usePeerStore.getState().peerConnections.get('peer-bob')?.stream).toBe(stream)
  })

  // Presence is in the snapshot, so a peer-left lost to the reconnect is still
  // corrected — the roster is no longer purely edge-driven.
  it('drops a peer who is absent from the snapshot that follows', async () => {
    const client = makeClient()

    await act(async () => {
      renderHook(() => useCall({
        client, roomId: 'room-1', enabled: true,
        userName: 'Alice', initialAudio: true, initialVideo: true,
      }))
    })

    await act(async () => {
      client.emit('peer-joined', {
        data: { peerId: 'peer-bob', name: 'Bob', audio: true, video: true },
      })
    })
    expect(usePeerStore.getState().peerConnections.has('peer-bob')).toBe(true)

    await act(async () => {
      (client as unknown as SignalingClient).onReconnected?.()
    })
    await act(async () => {
      client.emit('room-snapshot', { data: { version: 9, peers: [], tracks: [] } })
    })

    expect(usePeerStore.getState().peerConnections.has('peer-bob')).toBe(false)
  })
})


describe('useCall — cleanup', () => {
  it('deregisters all handlers and clears onReconnected on unmount', async () => {
    const client = makeClient()

    const { unmount } = renderHook(() => useCall({
      client, roomId: 'room-1', enabled: true,
      userName: 'Alice', initialAudio: true, initialVideo: true,
    }))

    await act(async () => {})

    unmount()

    expect(client.off).toHaveBeenCalledWith('joined', expect.any(Function))
    expect(client.off).toHaveBeenCalledWith('peer-joined', expect.any(Function))
    expect(client.off).toHaveBeenCalledWith('peer-left', expect.any(Function))
    expect(client.off).toHaveBeenCalledWith('peer-state', expect.any(Function))
    expect(client.off).toHaveBeenCalledWith('sfu-tracks', expect.any(Function))
    expect((client as unknown as SignalingClient).onReconnected).toBeUndefined()
  })
})

// TTFM used to open at join, so a host who joined before the guest switched
// their camera on measured the wait as setup latency: one such join reported
// p95 = 15s while the SFU was healthy, and filed it as
// call_setup_failure{peers_present_none_publishing}.
describe('useCall — the time-to-first-media window', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const metrics = (client: ReturnType<typeof makeClient>, name: string) =>
    client.sent.filter(m => m.type === 'client-metric'
      && (m.data as { name?: string })?.name === name)

  it('stays shut while a peer is present but publishing nothing', async () => {
    const client = makeClient()
    await act(async () => {
      renderHook(() => useCall({
        client, roomId: 'room-1', enabled: true,
        userName: 'Alice', initialAudio: false, initialVideo: false,
      }))
    })
    await act(async () => {
      client.emit('peer-joined', {
        data: { peerId: 'peer-bob', name: 'Bob', audio: false, video: false },
      })
    })

    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })

    expect(metrics(client, 'call_setup_failure')).toHaveLength(0)
  })

  it('opens when that peer starts publishing, and reports if media never lands', async () => {
    const client = makeClient()
    await act(async () => {
      renderHook(() => useCall({
        client, roomId: 'room-1', enabled: true,
        userName: 'Alice', initialAudio: false, initialVideo: false,
      }))
    })
    await act(async () => {
      client.emit('peer-joined', {
        data: { peerId: 'peer-bob', name: 'Bob', audio: false, video: false },
      })
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })

    await act(async () => {
      client.emit('peer-state', {
        from: 'peer-bob',
        data: { audio: false, video: true, speaking: false },
      })
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(11_000) })

    const failures = metrics(client, 'call_setup_failure')
    expect(failures).toHaveLength(1)
    expect((failures[0].data as { reason?: string }).reason).not.toBe('peers_present_none_publishing')
  })
})

// A re-mount leaves the device flags saying "camera on" while the previous
// cleanup stopped the tracks. The room was then told video:true with nothing
// published, and only a manual camera toggle fixed it.
describe('useCall — device intent versus reality', () => {
  it('re-acquires the camera when the flags say on but no track is live', async () => {
    const enableCamera = vi.fn(async () => null)
    usePeerStore.setState({ localStream: null, enableCamera })
    const client = makeClient()

    await act(async () => {
      renderHook(() => useCall({
        client, roomId: 'room-1', enabled: true,
        userName: 'Alice', initialAudio: false, initialVideo: true,
      }))
    })
    await act(async () => { client.emit('joined', { data: { peers: [] } }) })
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })

    expect(enableCamera).toHaveBeenCalled()
  })

  it('leaves the camera alone when a live track is already publishing', async () => {
    const enableCamera = vi.fn(async () => null)
    const stream = new MediaStream()
    stream.addTrack({ kind: 'video', readyState: 'live', stop: vi.fn() } as unknown as MediaStreamTrack)
    usePeerStore.setState({ localStream: stream, enableCamera })
    const client = makeClient()

    await act(async () => {
      renderHook(() => useCall({
        client, roomId: 'room-1', enabled: true,
        userName: 'Alice', initialAudio: false, initialVideo: true,
      }))
    })
    await act(async () => { client.emit('joined', { data: { peers: [] } }) })
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })

    expect(enableCamera).not.toHaveBeenCalled()
  })
})
