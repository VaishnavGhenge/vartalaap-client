import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { usePeerStore } from '../peer'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('simple-peer', () => {
  class FakePeer {
    private _listeners = new Map<string, ((...args: unknown[]) => void)[]>()
    _pc = {
      getSenders: vi.fn(() => [
        { track: { kind: 'audio' }, replaceTrack: vi.fn().mockResolvedValue(undefined) },
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

// AudioContext stub for createSilentAudioTrack
vi.mock('@/src/lib/audio-context', () => ({
  getSharedAudioContext: vi.fn(() => {
    const silentTrack = { kind: 'audio', stop: vi.fn(), enabled: true } as unknown as MediaStreamTrack
    return {
      createMediaStreamDestination: vi.fn(() => ({
        stream: {
          getAudioTracks: () => [silentTrack],
        },
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

async function makePeerWithAudioSender() {
  const Peer = (await import('simple-peer')).default
  const peer = new (Peer as unknown as new () => {
    _pc: { getSenders: ReturnType<typeof vi.fn> }
    addTrack: ReturnType<typeof vi.fn>
  })()
  const sender = { track: { kind: 'audio' }, replaceTrack: vi.fn().mockResolvedValue(undefined) }
  peer._pc.getSenders = vi.fn(() => [sender])
  return { peer, sender }
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

afterEach(() => vi.restoreAllMocks())

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

  it('calls replaceTrack on the audio sender (no addTrack / no renegotiation)', async () => {
    const { peer, sender } = await makePeerWithAudioSender()
    usePeerStore.setState({
      peerConnections: new Map([
        ['p1', { id: 'p1', peer: peer as never, name: '', audio: false, video: false, speaking: false, screenSharing: false }],
      ]),
    })
    const track = makeTrack('audio')
    stubGetUserMedia(track)

    await usePeerStore.getState().enableMic()

    expect(sender.replaceTrack).toHaveBeenCalledWith(track)
    expect(peer.addTrack).not.toHaveBeenCalled()
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
  it('stops the live audio track (mic indicator turns off)', async () => {
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

  it('replaces the sender with a silent placeholder before stopping', async () => {
    const { peer, sender } = await makePeerWithAudioSender()
    const track = makeTrack('audio')
    const stream = makeStream([track])
    usePeerStore.setState({
      localStream: stream,
      peerConnections: new Map([
        ['p1', { id: 'p1', peer: peer as never, name: '', audio: true, video: false, speaking: false, screenSharing: false }],
      ]),
    })

    usePeerStore.getState().disableMic()

    // Silent placeholder was put in place — addTrack never called
    expect(sender.replaceTrack).toHaveBeenCalled()
    expect(peer.addTrack).not.toHaveBeenCalled()
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
  it('full round trip: enable acquires mic, disable stops track and swaps sender', async () => {
    const { peer, sender } = await makePeerWithAudioSender()
    usePeerStore.setState({
      peerConnections: new Map([
        ['p1', { id: 'p1', peer: peer as never, name: '', audio: false, video: false, speaking: false, screenSharing: false }],
      ]),
    })
    const liveTrack = makeTrack('audio')
    stubGetUserMedia(liveTrack)

    // Enable
    await usePeerStore.getState().enableMic()
    expect(sender.replaceTrack).toHaveBeenCalledWith(liveTrack)

    // Disable
    usePeerStore.getState().disableMic()
    expect(liveTrack.stop).toHaveBeenCalled()
    // Sender was replaced again (with silent placeholder)
    expect(sender.replaceTrack).toHaveBeenCalledTimes(2)
  })
})
