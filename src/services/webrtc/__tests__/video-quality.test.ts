import { describe, expect, it } from 'vitest'
import { VideoQualityController, type VideoQuality } from '../video-quality'

const full: VideoQuality = { encodingLevel: 2, videoHeld: false }
function report(timestamp: number, rtt: number, bandwidth?: number): RTCStatsReport {
  return new Map([['pair', { type: 'candidate-pair', timestamp, nominated: true, state: 'succeeded', currentRoundTripTime: rtt, availableOutgoingBitrate: bandwidth }]]) as unknown as RTCStatsReport
}

describe('video quality policy', () => {
  it('ignores a brief spike, then steps down before holding video; restores slowly', () => {
    const controller = new VideoQualityController()
    let quality = full
    const poll = (t: number, rtt: number, bandwidth: number) => {
      quality = controller.next(report(t, rtt, bandwidth), quality, { video: true, audio: true })
    }
    poll(2_000, 1.2, 100_000)
    poll(4_000, 0.05, 2_000_000)
    expect(quality).toEqual(full)
    for (let t = 6_000; t <= 28_000; t += 2_000) poll(t, 1.2, 100_000)
    expect(quality).toEqual({ encodingLevel: 0, videoHeld: true })
    for (let t = 30_000; t <= 48_000; t += 2_000) poll(t, 0.05, 2_000_000)
    expect(quality.videoHeld).toBe(true)
    poll(50_000, 0.05, 2_000_000)
    expect(quality).toEqual({ encodingLevel: 0, videoHeld: false })
    for (let t = 52_000; t <= 94_000; t += 2_000) poll(t, 0.05, 2_000_000)
    expect(quality).toEqual(full)
  })

  it('never pauses the only active medium and restores held video when audio is muted', () => {
    const controller = new VideoQualityController()
    let quality: VideoQuality = { encodingLevel: 0, videoHeld: false }
    for (let t = 2_000; t <= 30_000; t += 2_000) {
      quality = controller.next(report(t, 2, 90_000), quality, { video: true, audio: false })
    }
    expect(quality.videoHeld).toBe(false)
    expect(controller.next(report(32_000, 2), { encodingLevel: 0, videoHeld: true }, { video: true, audio: false })).toEqual(quality)
  })

  it('does not treat missing, stale or widely separated measurements as sustained trouble', () => {
    const controller = new VideoQualityController()
    for (const t of [2_000, 2_000, 2_000, 20_000, 40_000]) {
      expect(controller.next(report(t, 2), full, { video: true, audio: true })).toEqual(full)
    }
    expect(controller.next(report(42_000, NaN), full, { video: true, audio: true })).toEqual(full)
  })

  it('resets when camera is turned off and can recover without bandwidth estimates', () => {
    const controller = new VideoQualityController()
    let quality: VideoQuality = { encodingLevel: 0, videoHeld: true }
    for (let t = 2_000; t <= 22_000; t += 2_000) {
      quality = controller.next(report(t, 0.05), quality, { video: true, audio: true })
    }
    expect(quality).toEqual({ encodingLevel: 0, videoHeld: false })
    expect(controller.next(report(24_000, 1), quality, { video: false, audio: true })).toEqual(full)
  })
})
