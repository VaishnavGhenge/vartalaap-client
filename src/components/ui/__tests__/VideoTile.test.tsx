import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VideoTile } from '../VideoTile'

// AudioStream routes audio through the Web Audio API, not an <audio> element.
vi.mock('@/src/lib/audio-context', () => ({
  getSharedAudioContext: vi.fn(() => ({
    state: 'running',
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
    destination: {},
  })),
  resumeSharedAudioContext: vi.fn(),
}))

function makeStream(): MediaStream {
  return {
    getTracks: () => [],
    getAudioTracks: () => [{ kind: 'audio' } as MediaStreamTrack],
    getVideoTracks: () => [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaStream
}

describe('VideoTile', () => {
  it('shows the avatar and no video element when a remote camera is off', () => {
    const { container } = render(
      <VideoTile
        participant={{ id: 'peer-1', name: 'Alice', isVideoOff: true }}
        stream={makeStream()}
      />,
    )

    expect(screen.getByText('A')).toBeInTheDocument()
    // AudioStream uses Web Audio API (no <audio> element); camera off means no <video> either.
    expect(container.querySelector('audio')).not.toBeInTheDocument()
    expect(container.querySelector('video')).not.toBeInTheDocument()
  })

  it('renders the participant name pill', () => {
    render(
      <VideoTile
        participant={{ id: 'peer-1', name: 'Bob', isVideoOff: true }}
        stream={null}
      />,
    )
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('labels the tile with speaking indicator when participant is speaking', () => {
    const { container } = render(
      <VideoTile
        participant={{ id: 'peer-1', name: 'Carol', speaking: true }}
        stream={null}
      />,
    )
    expect(container.querySelector('[aria-label="Carol, speaking"]')).toBeInTheDocument()
  })
})
