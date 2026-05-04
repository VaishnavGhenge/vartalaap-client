import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VideoTile } from '../VideoTile'

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
  beforeEach(() => {
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    })
  })

  it('shows the avatar and no video element when a remote camera is off', () => {
    const { container } = render(
      <VideoTile
        participant={{ id: 'peer-1', name: 'Alice', isVideoOff: true }}
        stream={makeStream()}
      />,
    )

    expect(screen.getByText('A')).toBeInTheDocument()
    expect(container.querySelector('audio')).toBeInTheDocument()
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
