import { afterEach, describe, expect, it, vi } from 'vitest'
import { observeMediaTrackInterruption } from '../media-interruption'

function fakeTrack(): MediaStreamTrack {
  const events = new EventTarget()
  return Object.assign(events, { muted: false, readyState: 'live' }) as unknown as MediaStreamTrack
}

afterEach(() => vi.useRealTimers())

describe('observeMediaTrackInterruption', () => {
  it('reports an ended device immediately while the page remains visible', () => {
    const track = fakeTrack()
    const interrupted = vi.fn()
    const stop = observeMediaTrackInterruption(track, interrupted)
    track.dispatchEvent(new Event('ended'))
    expect(interrupted).toHaveBeenCalledOnce()
    stop()
  })

  it('requires a sustained microphone mute and cancels transient mutes', async () => {
    vi.useFakeTimers()
    const track = fakeTrack()
    const interrupted = vi.fn()
    const stop = observeMediaTrackInterruption(track, interrupted, 3_000)
    ;(track as unknown as { muted: boolean }).muted = true
    track.dispatchEvent(new Event('mute'))
    await vi.advanceTimersByTimeAsync(2_000)
    ;(track as unknown as { muted: boolean }).muted = false
    track.dispatchEvent(new Event('unmute'))
    await vi.advanceTimersByTimeAsync(2_000)
    expect(interrupted).not.toHaveBeenCalled()

    ;(track as unknown as { muted: boolean }).muted = true
    track.dispatchEvent(new Event('mute'))
    await vi.advanceTimersByTimeAsync(3_000)
    expect(interrupted).toHaveBeenCalledOnce()
    stop()
  })
})
