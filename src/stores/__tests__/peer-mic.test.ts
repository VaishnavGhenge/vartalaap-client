import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { usePeerStore } from '../peer'
import type { SfuSession } from '@/src/services/webrtc/sfu-session'

// AudioContext stub for createSilentAudioTrack
vi.mock('@/src/lib/audio-context', () => ({
  getSharedAudioContext: vi.fn(() => {
    const silentTrack = { kind: 'audio', stop: vi.fn(), enabled: true } as unknown as MediaStreamTrack
    return {
      createMediaStreamDestination: vi.fn(() => ({
        stream: { getAudioTracks: () => [silentTrack] },
      })),
    }
  }),
  resumeSharedAudioContext: vi.fn(),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTrack(kind: 'video' | 'audio'): MediaStreamTrack {
  return { kind, stop: vi.fn(), enabled: true } as unknown as MediaStreamTrack
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
    },
  })
}

function makeSfuSession(): SfuSession {
  return {
    replaceTrack: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    sessionId: 'test-session',
  } as unknown as SfuSession
}

function peerConn(id = 'p1') {
  return { id, name: '', audio: false, video: false, speaking: false, screenSharing: false, connectionState: 'connected' as RTCPeerConnectionState }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

const origCreateElement = document.createElement.bind(document)

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
  usePeerStore.setState({
    localStream: null,
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

// ─── enableMic ────────────────────────────────────────────────────────────────

describe('enableMic', () => {
  it('calls getUserMedia with audio constraints and returns the track', async () => {
    const track = makeTrack('audio')
    stubGetUserMedia(track)

    const result = await usePeerStore.getState().enableMic()

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: expect.any(Object) })
    )
    expect(result).toBe(track)
  })

  it('sets localStream when none exists', async () => {
    const track = makeTrack('audio')
    stubGetUserMedia(track)

    await usePeerStore.getState().enableMic()

    expect(usePeerStore.getState().localStream).not.toBeNull()
    expect(usePeerStore.getState().localStream!.getAudioTracks()).toContain(track)
  })

  it('reuses an existing localStream', async () => {
    const existing = makeStream([makeTrack('video')])
    usePeerStore.setState({ localStream: existing })
    const newAudio = makeTrack('audio')
    stubGetUserMedia(newAudio)

    await usePeerStore.getState().enableMic()

    expect(usePeerStore.getState().localStream).toBe(existing)
  })

  it('calls sfuSession.replaceTrack to publish the audio track', async () => {
    const sfuSession = makeSfuSession()
    usePeerStore.setState({
      sfuSession,
      peerConnections: new Map([['p1', peerConn()]]),
    })
    const track = makeTrack('audio')
    stubGetUserMedia(track)

    await usePeerStore.getState().enableMic()

    expect(sfuSession.replaceTrack).toHaveBeenCalledWith('audio', track)
  })

  it('returns null when getUserMedia rejects', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) },
    })

    const result = await usePeerStore.getState().enableMic()

    expect(result).toBeNull()
  })
})

// ─── disableMic ───────────────────────────────────────────────────────────────

describe('disableMic', () => {
  it('stops the live audio track', async () => {
    const track = makeTrack('audio')
    const stream = makeStream([track])
    usePeerStore.setState({ localStream: stream })

    usePeerStore.getState().disableMic()

    expect(track.stop).toHaveBeenCalled()
  })

  it('removes the track from localStream', async () => {
    const track = makeTrack('audio')
    const stream = makeStream([track])
    usePeerStore.setState({ localStream: stream })

    usePeerStore.getState().disableMic()

    expect(stream.getAudioTracks()).not.toContain(track)
  })

  it('replaces the sfuSession audio sender with a silent placeholder before stopping', async () => {
    const sfuSession = makeSfuSession()
    const track = makeTrack('audio')
    const stream = makeStream([track])
    usePeerStore.setState({
      localStream: stream,
      sfuSession,
      peerConnections: new Map([['p1', { ...peerConn(), audio: true }]]),
    })

    usePeerStore.getState().disableMic()

    expect(sfuSession.replaceTrack).toHaveBeenCalledWith('audio', expect.any(Object))
  })

  it('sets localStream to null when no tracks remain', async () => {
    const track = makeTrack('audio')
    const stream = makeStream([track])
    usePeerStore.setState({ localStream: stream })

    usePeerStore.getState().disableMic()

    expect(usePeerStore.getState().localStream).toBeNull()
  })

  it('keeps localStream when video track is still present', async () => {
    const audio = makeTrack('audio')
    const video = makeTrack('video')
    const stream = makeStream([audio, video])
    usePeerStore.setState({ localStream: stream })

    usePeerStore.getState().disableMic()

    expect(usePeerStore.getState().localStream).not.toBeNull()
    expect(usePeerStore.getState().localStream!.getVideoTracks()).toContain(video)
  })

  it('is a no-op when there is no localStream', () => {
    expect(() => usePeerStore.getState().disableMic()).not.toThrow()
  })
})

// ─── enableMic → disableMic cycle ────────────────────────────────────────────

describe('enableMic → disableMic cycle', () => {
  it('enable publishes track to sfuSession, disable sends silent placeholder', async () => {
    const sfuSession = makeSfuSession()
    usePeerStore.setState({
      sfuSession,
      peerConnections: new Map([['p1', peerConn()]]),
    })
    const liveTrack = makeTrack('audio')
    stubGetUserMedia(liveTrack)

    await usePeerStore.getState().enableMic()
    expect(sfuSession.replaceTrack).toHaveBeenCalledWith('audio', liveTrack)

    usePeerStore.getState().disableMic()
    expect(liveTrack.stop).toHaveBeenCalled()
    expect(sfuSession.replaceTrack).toHaveBeenCalledTimes(2)
  })
})
