import { useEffect, useState } from 'react'
import { getSharedAudioContext } from '@/src/lib/audio-context'

const DEFAULT_THRESHOLD = 0.035
const HOLD_MS = 280

export interface AudioLevel {
  speaking: boolean
  level: number // 0–1 RMS, smoothed
}

export function useAudioLevel(
  stream: MediaStream | null,
  active: boolean,
  threshold = DEFAULT_THRESHOLD,
): AudioLevel {
  const [speaking, setSpeaking] = useState(false)
  const [level, setLevel] = useState(0)

  useEffect(() => {
    if (!stream || !active) {
      setSpeaking(false)
      setLevel(0)
      return
    }

    // Build analyser from the stream's current audio track.
    // Returns a teardown fn, or null if no audio track is present yet.
    const attach = (): (() => void) | null => {
      const track = stream.getAudioTracks()[0]
      if (!track) return null

      const ctx = getSharedAudioContext()
      if (!ctx) return null

      // Ensure the shared context is running (no-op on desktop, needed on iOS).
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})

      // Clone the stream before routing through Web Audio. Chromium may disable
      // hardware AEC on a getUserMedia track when it is connected to an
      // AudioContext source node. The clone keeps the original track's AEC
      // pipeline intact while the copy is used only for level analysis.
      const analysisStream = stream.clone()
      const source = ctx.createMediaStreamSource(analysisStream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.6
      source.connect(analyser)

      const data = new Uint8Array(analyser.frequencyBinCount)
      let timer = 0
      let lastOnAt = 0
      let current = false

      const loop = () => {
        analyser.getByteTimeDomainData(data)
        let sumSq = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sumSq += v * v
        }
        const rms = Math.sqrt(sumSq / data.length)
        // Clamp to a useful visual range (threshold..0.3) then normalise to 0–1.
        const normalized = Math.min(1, Math.max(0, (rms - threshold) / (0.3 - threshold)))
        setLevel(normalized)
        const now = performance.now()
        if (rms > threshold) {
          lastOnAt = now
          if (!current) { current = true; setSpeaking(true) }
        } else if (current && now - lastOnAt > HOLD_MS) {
          current = false
          setSpeaking(false)
        }
      }
      // setInterval keeps running in background tabs; rAF is paused when
      // the tab loses focus, which would stop speaking detection mid-call.
      timer = window.setInterval(loop, 30) as unknown as number

      return () => {
        clearInterval(timer)
        try { source.disconnect() } catch { /* noop */ }
        analysisStream.getTracks().forEach(t => t.stop())
        // Do NOT close the shared context here.
      }
    }

    let teardown = attach()

    // Re-attach when audio tracks are added to the stream later
    // (e.g. remote peer enables mic after joining with camera only).
    const onAddTrack = (e: MediaStreamTrackEvent) => {
      if (e.track.kind !== 'audio') return
      teardown?.()
      teardown = attach()
    }

    stream.addEventListener('addtrack', onAddTrack)

    return () => {
      stream.removeEventListener('addtrack', onAddTrack)
      teardown?.()
      setSpeaking(false)
      setLevel(0)
    }
  }, [stream, active, threshold])

  return { speaking, level }
}
