export type EncodingLevel = 0 | 1 | 2
export interface VideoQuality { encodingLevel: EncodingLevel; videoHeld: boolean }
export interface MediaIntent { video: boolean; audio: boolean }

export const VIDEO_ENCODINGS = [
  { maxBitrate: 200_000, scaleResolutionDownBy: 2, maxFramerate: 15 },
  { maxBitrate: 500_000, scaleResolutionDownBy: 1.5, maxFramerate: 20 },
  { maxBitrate: 900_000, scaleResolutionDownBy: 1, maxFramerate: 24 },
] as const

export function videoEncoding(quality: VideoQuality): RTCRtpEncodingParameters {
  return { ...VIDEO_ENCODINGS[quality.encodingLevel], active: !quality.videoHeld }
}

// These are initial product thresholds, not claims about measured call quality.
// Hysteresis gives the browser's congestion controller time to respond and
// prevents a single delayed packet from switching the user's camera off.
export class VideoQualityController {
  private badSince: number | null = null
  private goodSince: number | null = null
  private lastSampleAt = 0

  next(report: RTCStatsReport, current: VideoQuality, intent: MediaIntent): VideoQuality {
    if (!intent.video) {
      this.reset()
      return { encodingLevel: 2, videoHeld: false }
    }
    if (current.videoHeld && !intent.audio) {
      this.reset()
      return { encodingLevel: 0, videoHeld: false }
    }
    let pair: RTCIceCandidatePairStats | undefined
    report.forEach((entry) => {
      if (entry.type === 'transport' && entry.selectedCandidatePairId) {
        pair = report.get(entry.selectedCandidatePairId)
      }
    })
    if (!pair) report.forEach((entry) => {
      if (entry.type === 'candidate-pair' && entry.nominated && entry.state === 'succeeded') pair = entry
    })
    const at = pair?.timestamp ?? 0
    const rtt = pair?.currentRoundTripTime
    if (!pair || pair.state !== 'succeeded' || !Number.isFinite(rtt) || at <= this.lastSampleAt) {
      this.resetRuns()
      return current
    }
    if (at - this.lastSampleAt > 5_000) this.resetRuns()
    this.lastSampleAt = at
    const bitrate = pair.availableOutgoingBitrate
    const hasBandwidth = typeof bitrate === 'number' && Number.isFinite(bitrate) && bitrate >= 0
    const budget = VIDEO_ENCODINGS[current.encodingLevel].maxBitrate + 80_000
    const bad = rtt! >= 0.5 || (hasBandwidth && bitrate < budget * 0.8)
    const severe = rtt! >= 1 || (hasBandwidth && bitrate < 150_000)
    const nextLevel = Math.min(2, current.encodingLevel + 1) as EncodingLevel
    const recoveryBudget = current.videoHeld ? 350_000 : (VIDEO_ENCODINGS[nextLevel].maxBitrate + 80_000) * 1.2
    const good = rtt! >= 0 && rtt! < 0.25 && (!hasBandwidth || bitrate >= recoveryBudget)

    if (bad && !current.videoHeld && (current.encodingLevel > 0 || (severe && intent.audio))) {
      this.goodSince = null
      this.badSince ??= at
      if (at - this.badSince >= 6_000) {
        this.resetRuns()
        return current.encodingLevel > 0
          ? { encodingLevel: (current.encodingLevel - 1) as EncodingLevel, videoHeld: false }
          : { encodingLevel: 0, videoHeld: true }
      }
    } else if (good) {
      this.badSince = null
      this.goodSince ??= at
      if (at - this.goodSince >= 20_000) {
        this.resetRuns()
        return { encodingLevel: current.videoHeld ? 0 : nextLevel, videoHeld: false }
      }
    } else this.resetRuns()
    return current
  }

  reset(): void { this.resetRuns(); this.lastSampleAt = 0 }
  private resetRuns(): void { this.badSince = null; this.goodSince = null }
}
