import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioStream, VideoStream } from '../Video'

class FakeMediaStream extends EventTarget {
  private tracks: MediaStreamTrack[]

  constructor(tracks: MediaStreamTrack[] = []) {
    super()
    this.tracks = [...tracks]
  }

  getTracks() { return [...this.tracks] }
  getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio') }
  getVideoTracks() { return this.tracks.filter(t => t.kind === 'video') }
  addTrack(track: MediaStreamTrack) {
    this.tracks.push(track)
    this.dispatchEvent(new Event('addtrack'))
  }
  removeTrack(track: MediaStreamTrack) {
    this.tracks = this.tracks.filter(t => t !== track)
    this.dispatchEvent(new Event('removetrack'))
  }
}

function makeTrack(kind: 'audio' | 'video'): MediaStreamTrack {
  return { kind } as MediaStreamTrack
}

describe('AudioStream', () => {
  beforeEach(() => {
    vi.stubGlobal('MediaStream', FakeMediaStream)
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('attaches audio when it is added to an existing remote stream', () => {
    const stream = new FakeMediaStream()
    const { container } = render(<AudioStream stream={stream as unknown as MediaStream} />)
    const audio = container.querySelector('audio')!

    expect(audio.srcObject).toBeNull()

    const track = makeTrack('audio')
    stream.addTrack(track)

    const attached = audio.srcObject as MediaStream
    expect(attached.getAudioTracks()).toEqual([track])
  })
})

describe('VideoStream', () => {
  beforeEach(() => {
    vi.stubGlobal('MediaStream', FakeMediaStream)
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('starts playback after attaching an existing video track', () => {
    const track = makeTrack('video')
    const stream = new FakeMediaStream([track])

    const { container } = render(
      <VideoStream stream={stream as unknown as MediaStream} isLocal={false} />
    )
    const video = container.querySelector('video')!

    const attached = video.srcObject as MediaStream
    expect(attached.getVideoTracks()).toEqual([track])
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()
  })
})
