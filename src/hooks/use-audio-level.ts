import { useEffect, useState } from 'react'

const DEFAULT_THRESHOLD = 0.035
const HOLD_MS = 280

export function useAudioLevel(stream: MediaStream | null, active: boolean, threshold = DEFAULT_THRESHOLD): boolean {
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => {
    if (!stream || !active) {
      setSpeaking(false)
      return
    }
    const track = stream.getAudioTracks()[0]
    if (!track) {
      setSpeaking(false)
      return
    }

    const AudioCtor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    if (!AudioCtor) return

    const ctx = new AudioCtor()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.6
    source.connect(analyser)

    const data = new Uint8Array(analyser.frequencyBinCount)
    let raf = 0
    let lastOnAt = 0
    let lastOffAt = 0
    let current = false

    const loop = () => {
      analyser.getByteTimeDomainData(data)
      let sumSq = 0
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128
        sumSq += v * v
      }
      const rms = Math.sqrt(sumSq / data.length)
      const now = performance.now()
      const isLoud = rms > threshold
      if (isLoud) {
        lastOnAt = now
        if (!current) {
          current = true
          setSpeaking(true)
        }
      } else {
        lastOffAt = now
        if (current && now - lastOnAt > HOLD_MS) {
          current = false
          setSpeaking(false)
        }
      }
      // Satisfy lint: reference lastOffAt so unused-var check passes (also useful for debugging).
      void lastOffAt
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      try { source.disconnect() } catch { /* noop */ }
      void ctx.close()
    }
  }, [stream, active, threshold])

  return speaking
}
