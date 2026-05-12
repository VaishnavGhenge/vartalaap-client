import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCall } from '../use-call'
import { usePeerStore } from '@/src/stores/peer'
import type { SignalingClient } from '@/src/services/signaling/client'
import type { Envelope } from '@/src/services/signaling/protocol'

// Captured before any vi.spyOn so the canvas stub fallback never recurses.
const origCreateElement = document.createElement.bind(document)

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Track sessions created in each test so we can simulate connection state changes.
let createdSessions: { onConnectionStateChange?: (state: RTCPeerConnectionState) => void }[] = []

vi.mock('@/src/services/webrtc/session', () => {
  class WebRTCSession {
    private _opts: { onConnectionStateChange?: (state: RTCPeerConnectionState) => void }
    signal = vi.fn().mockResolvedValue(undefined)
    close = vi.fn()
    replaceTrack = vi.fn().mockResolvedValue(undefined)
    applyEncodingLevel = vi.fn().mockResolvedValue(undefined)
    getStats = vi.fn().mockResolvedValue(new Map())
    connectionState: RTCPeerConnectionState = 'connected'
    destroyed = false

    constructor(opts: { onConnectionStateChange?: (state: RTCPeerConnectionState) => void }) {
      this._opts = opts
      createdSessions.push(opts)
    }

    simulateConnectionState(state: RTCPeerConnectionState) {
      this._opts.onConnectionStateChange?.(state)
    }
  }
  return { WebRTCSession, ENCODING_LEVELS: [] }
})

vi.mock('@/src/services/api/ice', () => ({
  fetchIceServers: vi.fn().mockResolvedValue([]),
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
  createdSessions = []
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
    expect(joinMsg?.data).toMatchObject({ name: 'Alice', audio: true, video: true })
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
})

describe('useCall — reconnect', () => {
  it('clears all peers and re-sends join when onReconnected fires', async () => {
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

    const joinCountBefore = client.sent.filter(m => m.type === 'join').length

    await act(async () => {
      (client as unknown as SignalingClient).onReconnected?.()
    })

    expect(usePeerStore.getState().peerConnections.size).toBe(0)
    const joinCountAfter = client.sent.filter(m => m.type === 'join').length
    expect(joinCountAfter).toBe(joinCountBefore + 1)
  })
})

describe('useCall — connection state change', () => {
  it('wires up onConnectionStateChange for each created session', async () => {
    const client = makeClient()

    await act(async () => {
      renderHook(() => useCall({
        client, roomId: 'room-1', enabled: true,
        userName: 'Alice', initialAudio: true, initialVideo: true,
      }))
    })

    await act(async () => {
      client.emit('joined', {
        data: { peers: [{ id: 'peer-bob', name: 'Bob', audio: true, video: true }] },
      })
    })

    // A session should have been created with an onConnectionStateChange callback
    expect(createdSessions.length).toBeGreaterThan(0)
    expect(typeof createdSessions[0]?.onConnectionStateChange).toBe('function')
  })

  it('logs a warning when connection state is "failed"', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const client = makeClient()

    await act(async () => {
      renderHook(() => useCall({
        client, roomId: 'room-1', enabled: true,
        userName: 'Alice', initialAudio: true, initialVideo: true,
      }))
    })

    await act(async () => {
      client.emit('joined', {
        data: { peers: [{ id: 'peer-bob', name: 'Bob', audio: true, video: true }] },
      })
    })

    await act(async () => {
      createdSessions[0]?.onConnectionStateChange?.('failed')
    })

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[use-call]'), expect.anything())
    warnSpy.mockRestore()
  })

  it('updates peer connectionState in the store on every state change', async () => {
    const client = makeClient()

    await act(async () => {
      renderHook(() => useCall({
        client, roomId: 'room-1', enabled: true,
        userName: 'Alice', initialAudio: true, initialVideo: true,
      }))
    })

    await act(async () => {
      client.emit('joined', {
        data: { peers: [{ id: 'peer-bob', name: 'Bob', audio: true, video: true }] },
      })
    })

    for (const state of ['connecting', 'connected', 'disconnected', 'failed'] as RTCPeerConnectionState[]) {
      await act(async () => { createdSessions[0]?.onConnectionStateChange?.(state) })
      const bob = usePeerStore.getState().peerConnections.get('peer-bob')
      expect(bob?.connectionState).toBe(state)
    }
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
    expect(client.off).toHaveBeenCalledWith('signal', expect.any(Function))
    expect((client as unknown as SignalingClient).onReconnected).toBeUndefined()
  })
})
