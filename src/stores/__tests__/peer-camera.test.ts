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

// Stubs document.createElement('canvas') so createBlackVideoTrack works in jsdom.
// Returns the placeholder track object so tests can inspect it.
function stubCanvasCaptureStream() {
  const placeholder = makeTrack('video')
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') {
      return {
        width: 0,
        height: 0,
        captureStream: vi.fn(() => ({
          getVideoTracks: () => [placeholder],
        })),
      } as unknown as HTMLElement
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (document.createElement as any).__vitest_original?.(tag) ?? document.createElement(tag)
  })
  return placeholder
}

// Creates a FakePeer with a pinned video sender so replaceTrack calls are trackable.
async function makePeerWithVideoSender() {
  const Peer = (await import('simple-peer')).default
  const peer = new (Peer as unknown as new () => {
    _pc: { getSenders: ReturnType<typeof vi.fn> }
    addTrack: ReturnType<typeof vi.fn>
    removeTrack: ReturnType<typeof vi.fn>
  })()
  const sender = { track: { kind: 'video' }, replaceTrack: vi.fn().mockResolvedValue(undefined) }
  peer._pc.getSenders = vi.fn(() => [sender])
  return { peer, sender }
}

// Creates a FakePeer that has NO video sender (peer joined before camera was on).
async function makePeerWithoutVideoSender() {
  const Peer = (await import('simple-peer')).default
  const peer = new (Peer as unknown as new () => {
    _pc: { getSenders: ReturnType<typeof vi.fn> }
    addTrack: ReturnType<typeof vi.fn>
    removeTrack: ReturnType<typeof vi.fn>
  })()
  peer._pc.getSenders = vi.fn(() => [])
  return { peer }
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
  // jsdom doesn't ship MediaStream; provide a minimal stub so enableCamera's
  // `existing ?? new MediaStream()` branch works in tests.
  vi.stubGlobal('MediaStream', class {
    private _tracks: MediaStreamTrack[] = []
    getTracks() { return [...this._tracks] }
    getVideoTracks() { return this._tracks.filter(t => t.kind === 'video') }
    getAudioTracks() { return this._tracks.filter(t => t.kind === 'audio') }
    addTrack(t: MediaStreamTrack) { this._tracks.push(t) }
    removeTrack(t: MediaStreamTrack) { this._tracks = this._tracks.filter(x => x !== t) }
  })

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

// ─── disableCamera — peer interaction ────────────────────────────────────────

describe('disableCamera — peer interaction', () => {
  it('uses replaceTrack(placeholder) instead of peer.removeTrack so audio is not disrupted', async () => {
    const { peer, sender } = await makePeerWithVideoSender()
    const placeholder = stubCanvasCaptureStream()
    const videoTrack = makeTrack('video')
    const stream = makeStream([videoTrack])
    usePeerStore.setState({
      localStream: stream,
      peerConnections: new Map([
        ['peer-1', { id: 'peer-1', peer: peer as never, name: 'Alice', audio: true, video: true, speaking: false }],
      ]),
    })

    usePeerStore.getState().disableCamera()

    expect(peer.removeTrack).not.toHaveBeenCalled()
    expect(sender.replaceTrack).toHaveBeenCalledWith(placeholder)
  })

  it('stops the placeholder immediately after handing it to the sender', async () => {
    const { peer } = await makePeerWithVideoSender()
    const placeholder = stubCanvasCaptureStream()
    const stream = makeStream([makeTrack('video')])
    usePeerStore.setState({
      localStream: stream,
      peerConnections: new Map([
        ['peer-1', { id: 'peer-1', peer: peer as never, name: 'Alice', audio: true, video: true, speaking: false }],
      ]),
    })

    usePeerStore.getState().disableCamera()

    expect(placeholder.stop).toHaveBeenCalled()
  })

  it('stops the real video track', async () => {
    const { peer } = await makePeerWithVideoSender()
    stubCanvasCaptureStream()
    const videoTrack = makeTrack('video')
    const stream = makeStream([videoTrack])
    usePeerStore.setState({
      localStream: stream,
      peerConnections: new Map([
        ['peer-1', { id: 'peer-1', peer: peer as never, name: 'Alice', audio: true, video: true, speaking: false }],
      ]),
    })

    usePeerStore.getState().disableCamera()

    expect(videoTrack.stop).toHaveBeenCalled()
  })

  it('does not touch the audio sender when disabling camera', async () => {
    const { peer } = await makePeerWithVideoSender()
    // Add an audio sender alongside the video sender
    const audioSender = { track: { kind: 'audio' }, replaceTrack: vi.fn() }
    peer._pc.getSenders = vi.fn(() => [
      { track: { kind: 'video' }, replaceTrack: vi.fn().mockResolvedValue(undefined) },
      audioSender,
    ])
    stubCanvasCaptureStream()
    const stream = makeStream([makeTrack('audio'), makeTrack('video')])
    usePeerStore.setState({
      localStream: stream,
      peerConnections: new Map([
        ['peer-1', { id: 'peer-1', peer: peer as never, name: 'Alice', audio: true, video: true, speaking: false }],
      ]),
    })

    usePeerStore.getState().disableCamera()

    expect(audioSender.replaceTrack).not.toHaveBeenCalled()
  })

  it('keeps localStream when an audio track is still present', async () => {
    const { peer } = await makePeerWithVideoSender()
    stubCanvasCaptureStream()
    const stream = makeStream([makeTrack('audio'), makeTrack('video')])
    usePeerStore.setState({
      localStream: stream,
      peerConnections: new Map([
        ['peer-1', { id: 'peer-1', peer: peer as never, name: 'Alice', audio: true, video: true, speaking: false }],
      ]),
    })

    usePeerStore.getState().disableCamera()

    expect(usePeerStore.getState().localStream).not.toBeNull()
  })

  it('sets localStream to null when video was the only track', async () => {
    const { peer } = await makePeerWithVideoSender()
    stubCanvasCaptureStream()
    const stream = makeStream([makeTrack('video')])
    usePeerStore.setState({
      localStream: stream,
      peerConnections: new Map([
        ['peer-1', { id: 'peer-1', peer: peer as never, name: 'Alice', audio: false, video: true, speaking: false }],
      ]),
    })

    usePeerStore.getState().disableCamera()

    expect(usePeerStore.getState().localStream).toBeNull()
  })
})

// ─── enableCamera — peer sender reuse ────────────────────────────────────────

describe('enableCamera — peer sender reuse', () => {
  it('calls replaceTrack on the existing video sender (camera was on before)', async () => {
    const { peer, sender } = await makePeerWithVideoSender()
    const newTrack = makeTrack('video')
    stubGetUserMedia(newTrack)
    // Provide an audio-only stream so enableCamera reuses it instead of
    // calling new MediaStream() — which avoids an unrelated code path.
    const stream = makeStream([makeTrack('audio')])
    usePeerStore.setState({
      localStream: stream,
      peerConnections: new Map([
        ['peer-1', { id: 'peer-1', peer: peer as never, name: 'Alice', audio: true, video: false, speaking: false }],
      ]),
    })

    await usePeerStore.getState().enableCamera()

    expect(sender.replaceTrack).toHaveBeenCalledWith(newTrack)
    expect(peer.addTrack).not.toHaveBeenCalled()
  })

  it('falls back to peer.addTrack when no video sender exists yet (first enable)', async () => {
    const { peer } = await makePeerWithoutVideoSender()
    const newTrack = makeTrack('video')
    stubGetUserMedia(newTrack)
    const stream = makeStream([makeTrack('audio')])
    usePeerStore.setState({
      localStream: stream,
      peerConnections: new Map([
        ['peer-1', { id: 'peer-1', peer: peer as never, name: 'Alice', audio: true, video: false, speaking: false }],
      ]),
    })

    await usePeerStore.getState().enableCamera()

    expect(peer.addTrack).toHaveBeenCalledWith(newTrack, expect.any(Object))
  })
})

// ─── disableCamera → enableCamera full cycle ─────────────────────────────────

describe('disableCamera → enableCamera cycle', () => {
  it('enableCamera finds the sender left by disableCamera and uses replaceTrack', async () => {
    const { peer } = await makePeerWithVideoSender()

    // The sender starts with a real video track. disableCamera replaces it with
    // the placeholder (stopped, kind='video'). We track this by having getSenders
    // always return the same sender object whose .track updates via replaceTrack.
    const placeholder = stubCanvasCaptureStream()
    let currentTrack: MediaStreamTrack | null = makeTrack('video')
    const sender = {
      get track() { return currentTrack },
      replaceTrack: vi.fn().mockImplementation((t: MediaStreamTrack | null) => {
        currentTrack = t
        return Promise.resolve()
      }),
    }
    peer._pc.getSenders = vi.fn(() => [sender])

    // Stream has audio + video so localStream survives disableCamera (audio remains).
    const stream = makeStream([makeTrack('audio'), makeTrack('video')])
    const newTrack = makeTrack('video')
    stubGetUserMedia(newTrack)
    usePeerStore.setState({
      localStream: stream,
      peerConnections: new Map([
        ['peer-1', { id: 'peer-1', peer: peer as never, name: 'Alice', audio: true, video: true, speaking: false }],
      ]),
    })

    usePeerStore.getState().disableCamera()
    // After disableCamera: sender.track === placeholder (stopped, kind='video')
    expect(sender.track).toBe(placeholder)

    await usePeerStore.getState().enableCamera()
    // enableCamera finds the sender via track.kind==='video' and replaces with the real track
    expect(sender.replaceTrack).toHaveBeenLastCalledWith(newTrack)
    expect(peer.addTrack).not.toHaveBeenCalled()
  })
})
