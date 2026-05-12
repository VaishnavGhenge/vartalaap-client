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

  it('shows Reconnecting overlay when connectionState is disconnected', () => {
    render(
      <VideoTile
        participant={{ id: 'peer-1', name: 'Dave' }}
        stream={makeStream()}
        connectionState="disconnected"
      />,
    )
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument()
  })

  it('shows Connection lost overlay when connectionState is failed', () => {
    render(
      <VideoTile
        participant={{ id: 'peer-1', name: 'Eve' }}
        stream={makeStream()}
        connectionState="failed"
      />,
    )
    expect(screen.getByText('Connection lost')).toBeInTheDocument()
  })

  it('shows Audio only badge when videoHeld is true', () => {
    render(
      <VideoTile
        participant={{ id: 'peer-1', name: 'Frank' }}
        stream={makeStream()}
        videoHeld
      />,
    )
    expect(screen.getByText('Audio only')).toBeInTheDocument()
  })

  it('does not show overlays on the local tile', () => {
    render(
      <VideoTile
        isLocal
        userName="Me"
        stream={makeStream()}
        connectionState="failed"
        videoHeld
      />,
    )
    expect(screen.queryByText('Connection lost')).not.toBeInTheDocument()
    expect(screen.queryByText('Audio only')).not.toBeInTheDocument()
  })
})
