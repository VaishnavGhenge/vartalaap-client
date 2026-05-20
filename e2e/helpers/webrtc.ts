/**
 * WebRTC test helpers — the three-layer trust model.
 *
 * Every "is media working" assertion in the suite should pass all three layers:
 *   1. Wire: getStats() inbound deltas grow over time
 *   2. Content (video): canvas mean > 10 AND variance > 100
 *   3. Content (audio): AudioContext RMS > noise floor
 *
 * See e2e/TESTING.md for the rationale and roadmap.
 */

import { expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Init script — exposes every RTCPeerConnection on window.__pcs
// ---------------------------------------------------------------------------

/**
 * Installed by the fixture in e2e/fixtures.ts at context creation time, before
 * any app script runs. Wraps the RTCPeerConnection constructor so every PC
 * instance is reachable from tests via window.__pcs.
 *
 * The wrap is transparent: prototype chain is preserved (so `instanceof` works
 * for app code), and static methods (`generateCertificate`) are inherited.
 */
export function installPeerConnectionTracker(): void {
  // The init script is serialized to a string and re-evaluated in the page
  // context. Types here are deliberately loose because window/RTC* are global
  // in the browser, not imported.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const w = window as any
  if (w.__pcs) return // idempotent — Next.js Fast Refresh can re-run init scripts
  w.__pcs = new Set()
  const Orig = w.RTCPeerConnection
  if (!Orig) return // jsdom or no RTC support
  function Wrapped(this: unknown, ...args: unknown[]) {
    const pc = new Orig(...args)
    w.__pcs.add(pc)
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'closed') w.__pcs.delete(pc)
    })
    return pc
  }
  Wrapped.prototype = Orig.prototype
  // Preserve static methods (e.g. generateCertificate).
  Object.setPrototypeOf(Wrapped, Orig)
  w.RTCPeerConnection = Wrapped
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

// ---------------------------------------------------------------------------
// Layer 1 — wire-level: inbound stats deltas
// ---------------------------------------------------------------------------

type MediaKind = 'video' | 'audio'

interface InboundSample {
  bytes: number
  packets: number
  frames: number
}

async function sampleInbound(page: Page, kind: MediaKind): Promise<InboundSample> {
  return page.evaluate(async (k) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const pcs: Set<RTCPeerConnection> = (window as any).__pcs ?? new Set()
    const out: InboundSample = { bytes: 0, packets: 0, frames: 0 }
    for (const pc of pcs) {
      const stats: RTCStatsReport = await pc.getStats()
      stats.forEach((r: any) => {
        if (r.type === 'inbound-rtp' && r.kind === k) {
          out.bytes += r.bytesReceived ?? 0
          out.packets += r.packetsReceived ?? 0
          out.frames += r.framesDecoded ?? 0
        }
      })
    }
    return out
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }, kind) as Promise<InboundSample>
}

/**
 * Asserts that inbound RTP stats are growing for `kind` over a sample window.
 *
 * Polls in `sampleMs`-wide windows until growth is detected or `timeoutMs`
 * elapses. Deltas — not absolute values — are what proves the stream is alive
 * NOW. A non-zero absolute count can be a single old keepalive frame.
 *
 * For video, framesDecoded must also be growing — bytesReceived growing
 * without framesDecoded catches a stuck decoder (codec mismatch, SRTP key
 * error, etc.) that would otherwise pass.
 */
export async function expectInboundMediaFlowing(
  page: Page,
  kind: MediaKind,
  opts: { sampleMs?: number; timeoutMs?: number } = {},
): Promise<void> {
  const sampleMs = opts.sampleMs ?? 2_000
  const timeoutMs = opts.timeoutMs ?? 15_000
  const deadline = Date.now() + timeoutMs
  let last: InboundSample = { bytes: 0, packets: 0, frames: 0 }

  while (Date.now() < deadline) {
    const before = await sampleInbound(page, kind)
    await page.waitForTimeout(sampleMs)
    const after = await sampleInbound(page, kind)
    last = {
      bytes: after.bytes - before.bytes,
      packets: after.packets - before.packets,
      frames: after.frames - before.frames,
    }
    const ok =
      last.bytes > 0 &&
      last.packets > 0 &&
      (kind !== 'video' || last.frames > 0)
    if (ok) return
  }

  throw new Error(
    `expectInboundMediaFlowing(${kind}) timed out after ${timeoutMs}ms. ` +
      `Last ${sampleMs}ms delta: bytes=${last.bytes} packets=${last.packets}` +
      (kind === 'video' ? ` frames=${last.frames}` : '') +
      `. Either the SFU never delivered the stream, the decoder is stuck, ` +
      `or no RTCPeerConnection is registered (check fixture wiring).`,
  )
}

// ---------------------------------------------------------------------------
// Layer 2 — content-level: video pixel sampling
// ---------------------------------------------------------------------------

/**
 * Asserts that at least one non-local <video> element is decoding a live,
 * non-frozen frame.
 *
 * Mean > 10 rules out pure black. Variance > 100 rules out a solid colour
 * frozen frame — a common failure mode where stats look healthy but the
 * decoder has locked onto a single keyframe.
 *
 * Default selector skips muted videos so the local self-preview is excluded.
 * Pass a more specific selector to target a particular peer's tile.
 */
export async function expectRemoteVideoLive(
  page: Page,
  selector = 'video:not([muted])',
  opts: { timeoutMs?: number; meanMin?: number; varianceMin?: number } = {},
): Promise<void> {
  // The default is generous because the SFU's subscribe-side session is
  // created lazily (first .subscribe() triggers /sessions/new + ICE), and
  // the canvas-sampling loop only catches a frame on the next animation
  // frame after the decoder produces one. 25s comfortably covers both
  // hops plus a noisy CI host.
  const timeoutMs = opts.timeoutMs ?? 25_000
  const meanMin = opts.meanMin ?? 10
  const varianceMin = opts.varianceMin ?? 100

  // page.waitForFunction polls every animation frame; condition runs in browser.
  await page
    .waitForFunction(
      ({ selector, meanMin, varianceMin }) => {
        const videos = Array.from(document.querySelectorAll<HTMLVideoElement>(selector))
        for (const v of videos) {
          if (v.muted) continue // belt-and-braces: also skip muted at runtime
          if (v.paused) continue
          if (v.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) continue
          if (v.videoWidth < 16 || v.videoHeight < 16) continue
          const c = document.createElement('canvas')
          c.width = 64
          c.height = 36
          const ctx = c.getContext('2d')
          if (!ctx) continue
          ctx.drawImage(v, 0, 0, 64, 36)
          const data = ctx.getImageData(0, 0, 64, 36).data
          let sum = 0
          const lums: number[] = []
          for (let i = 0; i < data.length; i += 4) {
            const lum = (data[i] + data[i + 1] + data[i + 2]) / 3
            lums.push(lum)
            sum += lum
          }
          const mean = sum / lums.length
          let varAcc = 0
          for (const l of lums) varAcc += (l - mean) * (l - mean)
          const variance = varAcc / lums.length
          if (mean > meanMin && variance > varianceMin) return true
        }
        return false
      },
      { selector, meanMin, varianceMin },
      { timeout: timeoutMs },
    )
    .catch(() => {
      throw new Error(
        `expectRemoteVideoLive timed out after ${timeoutMs}ms for selector "${selector}". ` +
          `No matching <video> has both mean > ${meanMin} (non-black) and ` +
          `variance > ${varianceMin} (non-frozen). Tile may be showing a stale ` +
          `keyframe or replaceTrack(null) left the sender black.`,
      )
    })
}

// ---------------------------------------------------------------------------
// Layer 3 — content-level: audio RMS
// ---------------------------------------------------------------------------

/**
 * Asserts that at least one <audio> element's srcObject is producing audible
 * energy above the noise floor.
 *
 * Taps the MediaStream via AudioContext + AnalyserNode and reads
 * float-time-domain data. RMS > rmsMin proves audio is flowing — a "live"
 * MediaStreamTrack with no actual samples will read zero.
 *
 * Polls because the AudioContext needs a brief warmup after creation; the
 * first sample is often zero even when audio is live.
 */
export async function expectRemoteAudioAudible(
  page: Page,
  selector = 'audio',
  opts: { timeoutMs?: number; rmsMin?: number } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 15_000
  const rmsMin = opts.rmsMin ?? 0.001
  const deadline = Date.now() + timeoutMs
  let lastRms = 0

  while (Date.now() < deadline) {
    lastRms = await page.evaluate(
      async ({ selector }) => {
        const els = Array.from(document.querySelectorAll<HTMLAudioElement>(selector))
        let peak = 0
        for (const el of els) {
          const stream = el.srcObject as MediaStream | null
          if (!stream) continue
          const audioTracks = stream.getAudioTracks()
          if (audioTracks.length === 0) continue
          if (audioTracks[0].readyState !== 'live') continue
          // Each call creates and disposes its own AudioContext to avoid
          // leaking contexts across poll iterations.
          const Ctx = window.AudioContext
          if (!Ctx) continue
          const ctx = new Ctx()
          try {
            // Resume in case the autoplay policy left the context suspended —
            // a suspended AudioContext returns zeros from getFloatTimeDomainData
            // even when the underlying MediaStream has live audio samples.
            if (ctx.state === 'suspended') {
              await ctx.resume().catch(() => {})
            }
            const src = ctx.createMediaStreamSource(stream)
            const analyser = ctx.createAnalyser()
            analyser.fftSize = 2048
            src.connect(analyser)
            // Brief warmup — the first ~50ms after connect can read zero.
            await new Promise<void>((resolve) => setTimeout(resolve, 400))
            const buf = new Float32Array(analyser.fftSize)
            analyser.getFloatTimeDomainData(buf)
            let sumSq = 0
            for (const v of buf) sumSq += v * v
            const rms = Math.sqrt(sumSq / buf.length)
            if (rms > peak) peak = rms
          } finally {
            await ctx.close().catch(() => {})
          }
        }
        return peak
      },
      { selector },
    )
    if (lastRms > rmsMin) return
    await page.waitForTimeout(500)
  }

  throw new Error(
    `expectRemoteAudioAudible timed out after ${timeoutMs}ms for selector "${selector}". ` +
      `Peak RMS ${lastRms.toFixed(5)} < ${rmsMin}. The audio track may exist and be ` +
      `"live" but the publisher is sending silence (track.enabled=false or ended).`,
  )
}
