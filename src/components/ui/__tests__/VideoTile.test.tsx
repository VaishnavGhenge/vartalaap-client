import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VideoTile } from '../VideoTile'

function makeStream(): MediaStream {
  return {
    getTracks: () => [],
    getAudioTracks: () => [],
    getVideoTracks: () => [],
  } as unknown as MediaStream
}

describe('VideoTile', () => {
  it('keeps the media element mounted when a remote camera is off', () => {
    const { container } = render(
      <VideoTile
        participant={{ id: 'peer-1', name: 'Alice', isVideoOff: true }}
        stream={makeStream()}
      />,
    )

    expect(screen.getByText('A')).toBeInTheDocument()
    expect(container.querySelector('video')).toBeInTheDocument()
  })
})
