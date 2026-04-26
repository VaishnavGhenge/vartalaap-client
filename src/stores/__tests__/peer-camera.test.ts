import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { usePeerStore } from '../peer'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('simple-peer', () => {
  class FakePeer {
    private _listeners = new Map<string, ((...args: unknown[]) => void)[]>()
    _pc = {
      getSenders: vi.fn(() => [
        { track: { kind: 'video' }, replaceTrack: vi.fn().mockResolvedValue(undefined) },
      ]),
    }
    destroyed = false
    addTrack = vi.fn()
    removeTrack = vi.fn()
    on(event: string, listener: (...args: unknown[]) => void) {
      const arr = this._listeners.get(event) ?? []
      arr.push(listener)
      this._listeners.set(event, arr)
      return this
    }
    emit(event: string, ...args: unknown[]) {
      this._listeners.get(event)?.forEach(l => l(...args))
    }
    destroy() {
      if (this.destroyed) return
      this.destroyed = true
      this.emit('close')
    }
  }
  return { default: FakePeer }
})

// ─── Fake media helpers ───────────────────────────────────────────────────────

function makeTrack(kind: 'video' | 'audio', facingMode?: string): MediaStreamTrack {
  return {
    kind,
    stop: vi.fn(),
    getSettings: vi.fn(() => ({ facingMode })),
  } as unknown as MediaStreamTrack
}

function makeStream(tracks: MediaStreamTrack[] = []): MediaStream {
  const list = [...tracks]
  return {
    getTracks: () => list,
    getVideoTracks: () => list.filter(t => t.kind === 'video'),
    getAudioTracks: () => list.filter(t => t.kind === 'audio'),
    addTrack: vi.fn((t: MediaStreamTrack) => list.push(t)),
    removeTrack: vi.fn((t: MediaStreamTrack) => list.splice(list.indexOf(t), 1)),
  } as unknown as MediaStream
}

function stubGetUserMedia(track: MediaStreamTrack) {
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue(makeStream([track])),
      enumerateDevices: vi.fn().mockResolvedValue([]),
    },
  })
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  usePeerStore.setState({
    localStream: null,
    facingMode: 'user',
    peerConnections: new Map(),
    iceServers: [],
  })
})

afterEach(() => vi.restoreAllMocks())

// ─── switchCamera ─────────────────────────────────────────────────────────────

describe('switchCamera', () => {
  it('returns false when there is no active local stream', async () => {
    const ok = await usePeerStore.getState().switchCamera()
    expect(ok).toBe(false)
  })

  it('switches facingMode from user to environment', async () => {
    const stream = makeStream([makeTrack('video', 'user')])
    usePeerStore.setState({ localStream: stream, facingMode: 'user' })
    stubGetUserMedia(makeTrack('video', 'environment'))

    const ok = await usePeerStore.getState().switchCamera()

    expect(ok).toBe(true)
    expect(usePeerStore.getState().facingMode).toBe('environment')
  })

  it('switches facingMode from environment back to user', async () => {
    const stream = makeStream([makeTrack('video', 'environment')])
    usePeerStore.setState({ localStream: stream, facingMode: 'environment' })
    stubGetUserMedia(makeTrack('video', 'user'))

    const ok = await usePeerStore.getState().switchCamera()

    expect(ok).toBe(true)
    expect(usePeerStore.getState().facingMode).toBe('user')
  })

  it('requests getUserMedia with exact opposite facingMode', async () => {
    const stream = makeStream([makeTrack('video', 'user')])
    usePeerStore.setState({ localStream: stream, facingMode: 'user' })
    stubGetUserMedia(makeTrack('video', 'environment'))

    await usePeerStore.getState().switchCamera()

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ facingMode: { exact: 'environment' } }),
      })
    )
  })

  it('stops the old video track after switching', async () => {
    const oldTrack = makeTrack('video', 'user')
    const stream = makeStream([oldTrack])
    usePeerStore.setState({ localStream: stream, facingMode: 'user' })
    stubGetUserMedia(makeTrack('video', 'environment'))

    await usePeerStore.getState().switchCamera()

    expect(oldTrack.stop).toHaveBeenCalled()
  })

  it('calls replaceTrack on all active peer RTCRtpSenders', async () => {
    const Peer = (await import('simple-peer')).default
    const fakePeer = new (Peer as unknown as new () => { _pc: { getSenders: ReturnType<typeof vi.fn> } })()

    // Pin getSenders to return the same sender object every call
    const sender = { track: { kind: 'video' }, replaceTrack: vi.fn().mockResolvedValue(undefined) }
    fakePeer._pc.getSenders = vi.fn(() => [sender])

    const stream = makeStream([makeTrack('video', 'user')])
    usePeerStore.setState({
      localStream: stream,
      facingMode: 'user',
      peerConnections: new Map([
        ['peer-1', { id: 'peer-1', peer: fakePeer as never, name: 'Bob', audio: true, video: true, speaking: false }],
      ]),
    })

    const newTrack = makeTrack('video', 'environment')
    stubGetUserMedia(newTrack)

    await usePeerStore.getState().switchCamera()

    expect(sender.replaceTrack).toHaveBeenCalledWith(newTrack)
  })

  it('returns false and does not change facingMode when getUserMedia fails', async () => {
    const stream = makeStream([makeTrack('video', 'user')])
    usePeerStore.setState({ localStream: stream, facingMode: 'user' })

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new Error('NotFoundError')),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    })

    const ok = await usePeerStore.getState().switchCamera()

    expect(ok).toBe(false)
    expect(usePeerStore.getState().facingMode).toBe('user')
  })
})

// ─── enableCamera respects facingMode ────────────────────────────────────────

describe('enableCamera — facingMode', () => {
  it('uses the stored facingMode when opening the camera', async () => {
    usePeerStore.setState({ facingMode: 'environment' })
    stubGetUserMedia(makeTrack('video', 'environment'))

    await usePeerStore.getState().enableCamera()

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ facingMode: 'environment' }),
      })
    )
  })

  it('defaults to user-facing camera on first open', async () => {
    stubGetUserMedia(makeTrack('video', 'user'))

    await usePeerStore.getState().enableCamera()

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ facingMode: 'user' }),
      })
    )
  })
})
