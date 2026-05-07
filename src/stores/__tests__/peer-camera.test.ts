import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { usePeerStore } from '../peer'
import { WebRTCSession } from '@/src/services/webrtc/session'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/src/services/webrtc/session', () => {
  class WebRTCSession {
    replaceTrack = vi.fn().mockResolvedValue(undefined)
    applyEncodingLevel = vi.fn().mockResolvedValue(undefined)
    getStats = vi.fn().mockResolvedValue(new Map())
    signal = vi.fn().mockResolvedValue(undefined)
    close = vi.fn()
    connectionState: RTCPeerConnectionState = 'connected'
    destroyed = false
    constructor(_opts: unknown) {}
  }
  return { WebRTCSession, ENCODING_LEVELS: [] }
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
    return (document.createElement as any).__vitest_original?.(tag) ?? document.createElement(tag)
  })
  return placeholder
}

function makeSession(): InstanceType<typeof WebRTCSession> {
  return new WebRTCSession({} as never) as unknown as InstanceType<typeof WebRTCSession>
}

function peerConn(session: InstanceType<typeof WebRTCSession>, id = 'peer-1') {
  return { id, session, name: 'Alice', audio: true, video: true, speaking: false, screenSharing: false }
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
    screenTrack: null,
    facingMode: 'user',
    peerConnections: new Map(),
    peerStats: new Map(),
    iceServers: [],
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

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

  it('requests getUserMedia with ideal opposite facingMode', async () => {
    const stream = makeStream([makeTrack('video', 'user')])
    usePeerStore.setState({ localStream: stream, facingMode: 'user' })
    stubGetUserMedia(makeTrack('video', 'environment'))

    await usePeerStore.getState().switchCamera()

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ facingMode: { ideal: 'environment' } }),
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

  it('calls session.replaceTrack on all active peers with the new video track', async () => {
    const session = makeSession()
    const stream = makeStream([makeTrack('video', 'user')])
    usePeerStore.setState({
      localStream: stream,
      facingMode: 'user',
      peerConnections: new Map([['peer-1', peerConn(session)]]),
    })

    const newTrack = makeTrack('video', 'environment')
    stubGetUserMedia(newTrack)

    await usePeerStore.getState().switchCamera()

    expect(session.replaceTrack).toHaveBeenCalledWith('video', newTrack)
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
  it('calls session.replaceTrack with video placeholder (no removeTrack)', async () => {
    const session = makeSession()
    const placeholder = stubCanvasCaptureStream()
    const videoTrack = makeTrack('video')
    const stream = makeStream([videoTrack])
    usePeerStore.setState({
      localStream: stream,
      peerConnections: new Map([['peer-1', peerConn(session)]]),
    })

    usePeerStore.getState().disableCamera()

    expect(session.replaceTrack).toHaveBeenCalledWith('video', placeholder)
  })

  it('stops the placeholder after a delay (not synchronously)', async () => {
    vi.useFakeTimers()
    const session = makeSession()
    const placeholder = stubCanvasCaptureStream()
    const stream = makeStream([makeTrack('video')])
    usePeerStore.setState({
      localStream: stream,
      peerConnections: new Map([['peer-1', peerConn(session)]]),
    })

    usePeerStore.getState().disableCamera()

    expect(placeholder.stop).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(placeholder.stop).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('stops the real video track', async () => {
    const session = makeSession()
    stubCanvasCaptureStream()
    const videoTrack = makeTrack('video')
    const stream = makeStream([videoTrack])
    usePeerStore.setState({
      localStream: stream,
      peerConnections: new Map([['peer-1', peerConn(session)]]),
    })

    usePeerStore.getState().disableCamera()

    expect(videoTrack.stop).toHaveBeenCalled()
  })

  it('only replaces the video track, not audio', async () => {
    const session = makeSession()
    stubCanvasCaptureStream()
    const stream = makeStream([makeTrack('audio'), makeTrack('video')])
    usePeerStore.setState({
      localStream: stream,
      peerConnections: new Map([['peer-1', peerConn(session)]]),
    })

    usePeerStore.getState().disableCamera()

    expect(session.replaceTrack).toHaveBeenCalledWith('video', expect.any(Object))
    expect(session.replaceTrack).not.toHaveBeenCalledWith('audio', expect.anything())
  })

  it('keeps localStream when an audio track is still present', async () => {
    const session = makeSession()
    stubCanvasCaptureStream()
    const stream = makeStream([makeTrack('audio'), makeTrack('video')])
    usePeerStore.setState({
      localStream: stream,
      peerConnections: new Map([['peer-1', peerConn(session)]]),
    })

    usePeerStore.getState().disableCamera()

    expect(usePeerStore.getState().localStream).not.toBeNull()
  })

  it('sets localStream to null when video was the only track', async () => {
    const session = makeSession()
    stubCanvasCaptureStream()
    const stream = makeStream([makeTrack('video')])
    usePeerStore.setState({
      localStream: stream,
      peerConnections: new Map([['peer-1', { ...peerConn(session), audio: false }]]),
    })

    usePeerStore.getState().disableCamera()

    expect(usePeerStore.getState().localStream).toBeNull()
  })
})

// ─── enableCamera — peer sender reuse ────────────────────────────────────────

describe('enableCamera — peer sender reuse', () => {
  it('calls session.replaceTrack with the new camera track', async () => {
    const session = makeSession()
    const newTrack = makeTrack('video')
    stubGetUserMedia(newTrack)
    const stream = makeStream([makeTrack('audio')])
    usePeerStore.setState({
      localStream: stream,
      peerConnections: new Map([['peer-1', peerConn(session)]]),
    })

    await usePeerStore.getState().enableCamera()

    expect(session.replaceTrack).toHaveBeenCalledWith('video', newTrack)
  })
})

// ─── startScreenShare / stopScreenShare ───────────────────────────────────────

describe('startScreenShare', () => {
  it('replaces video sender on existing peers with the screen track', async () => {
    const session = makeSession()
    usePeerStore.setState({
      peerConnections: new Map([
        ['p1', { id: 'p1', session, name: '', audio: false, video: false, speaking: false, screenSharing: false }],
      ]),
    })
    const screenTrack = makeTrack('video')
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockResolvedValue(makeStream([screenTrack])),
      },
    })

    await usePeerStore.getState().startScreenShare()

    expect(session.replaceTrack).toHaveBeenCalledWith('video', screenTrack)
    expect(usePeerStore.getState().screenTrack).toBe(screenTrack)
  })

  it('stores screenTrack so late-joining peers receive the screen', async () => {
    const screenTrack = makeTrack('video')
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockResolvedValue(makeStream([screenTrack])),
      },
    })
    usePeerStore.setState({ localStream: makeStream([makeTrack('audio')]) })

    await usePeerStore.getState().startScreenShare()

    expect(usePeerStore.getState().screenTrack).toBe(screenTrack)
  })

  it('returns null and does not set screenTrack when user cancels', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' })),
      },
    })

    const result = await usePeerStore.getState().startScreenShare()

    expect(result).toBeNull()
    expect(usePeerStore.getState().screenTrack).toBeNull()
  })
})

describe('stopScreenShare', () => {
  it('clears screenTrack', async () => {
    const screenTrack = makeTrack('video')
    usePeerStore.setState({ screenTrack })

    usePeerStore.getState().stopScreenShare()

    expect(usePeerStore.getState().screenTrack).toBeNull()
  })

  it('restores camera track on peers when camera is on', async () => {
    const session = makeSession()
    const cameraTrack = makeTrack('video')
    const stream = makeStream([cameraTrack])
    const screenTrack = makeTrack('video')
    usePeerStore.setState({
      screenTrack,
      localStream: stream,
      peerConnections: new Map([
        ['p1', { id: 'p1', session, name: '', audio: false, video: true, speaking: false, screenSharing: false }],
      ]),
    })

    usePeerStore.getState().stopScreenShare()

    expect(session.replaceTrack).toHaveBeenCalledWith('video', cameraTrack)
  })

  it('restores black placeholder on peers when camera is off', async () => {
    const session = makeSession()
    const placeholder = stubCanvasCaptureStream()
    const screenTrack = makeTrack('video')
    usePeerStore.setState({
      screenTrack,
      localStream: null,
      peerConnections: new Map([
        ['p1', { id: 'p1', session, name: '', audio: false, video: false, speaking: false, screenSharing: false }],
      ]),
    })

    usePeerStore.getState().stopScreenShare()

    expect(session.replaceTrack).toHaveBeenCalledWith('video', placeholder)
  })
})
