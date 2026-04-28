import { getSharedAudioContext } from './audio-context'

function ac(): AudioContext | null {
  const c = getSharedAudioContext()
  return c?.state === 'running' ? c : null
}

// Pure sine, linear decay — short and functional, no harmonic warmth.
function tone(
  ctx: AudioContext,
  freq: number,
  gainPeak: number,
  duration: number,
  startOffset = 0,
) {
  const t = ctx.currentTime + startOffset
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  osc.connect(env)
  env.connect(ctx.destination)
  env.gain.setValueAtTime(gainPeak, t)
  env.gain.linearRampToValueAtTime(0, t + duration)
  osc.start(t)
  osc.stop(t + duration + 0.01)
}

// Single brief ascending blip — someone entered the room.
export function playPeerJoined(): void {
  const c = ac(); if (!c) return
  tone(c, 440, 0.14, 0.12, 0)
  tone(c, 554, 0.12, 0.14, 0.10)
}

// Single brief descending blip — someone left.
export function playPeerLeft(): void {
  const c = ac(); if (!c) return
  tone(c, 554, 0.10, 0.10, 0)
  tone(c, 370, 0.08, 0.12, 0.09)
}

// Two quick ascending tones — you joined.
export function playJoinCall(): void {
  const c = ac(); if (!c) return
  tone(c, 392, 0.14, 0.12, 0)
  tone(c, 523, 0.14, 0.16, 0.11)
}

// Single short descending tone — call ended.
export function playLeaveCall(): void {
  const c = ac(); if (!c) return
  tone(c, 370, 0.14, 0.18)
}
