import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VideoTile } from '../VideoTile'

function makeStream(): MediaStream {
  return {
    getTracks: () => [],
    getAudioTracks: () => [{ kind: 'audio' } as MediaStreamTrack],
    getVideoTracks: () => [],
  } as unknown as MediaStream
}

describe('VideoTile', () => {
  it('shows the avatar and mounts dedicated audio playback when a remote camera is off', () => {
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
})
