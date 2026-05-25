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

// ── Cross-tab deduplication ───────────────────────────────────────────────────
//
// When two browser tabs are in the same room (e.g. for local testing), both
// tabs respond to the same events and would play the same sound within
// milliseconds of each other. We use localStorage as a shared clock: the first
// tab to call a sound writes the current timestamp; any other tab that checks
// the same key within DEDUP_MS skips playback.
//
// This is intentionally best-effort (no locks) — a tiny race is harmless for
// audio UX. The window is long enough to absorb the cross-tab scheduling
// latency (~50-150 ms) but short enough to allow the same sound to repeat
// normally in rapid-succession scenarios.

const DEDUP_MS = 600
const STORAGE_PREFIX = 'vartalaap:sfx:'

function guardPlay(key: string, fn: () => void): void {
  if (typeof localStorage === 'undefined') { fn(); return }
  const now = Date.now()
  const prev = Number(localStorage.getItem(STORAGE_PREFIX + key) ?? 0)
  if (now - prev < DEDUP_MS) return
  localStorage.setItem(STORAGE_PREFIX + key, String(now))
  fn()
}

// ── Sound effects ─────────────────────────────────────────────────────────────

// Single brief ascending blip — someone entered the room.
// Shares the 'peer-presence' dedup key with playJoinCall so both tabs in a
// same-browser test don't fire simultaneously (one plays, the other skips).
export function playPeerJoined(): void {
  guardPlay('peer-presence', () => {
    const c = ac(); if (!c) return
    tone(c, 440, 0.14, 0.12, 0)
    tone(c, 554, 0.12, 0.14, 0.10)
  })
}

// Single brief descending blip — someone left.
export function playPeerLeft(): void {
  guardPlay('peer-left', () => {
    const c = ac(); if (!c) return
    tone(c, 554, 0.10, 0.10, 0)
    tone(c, 370, 0.08, 0.12, 0.09)
  })
}

// Two quick ascending tones — you joined.
// Shares the 'peer-presence' dedup key with playPeerJoined so in a two-tab
// same-browser test, the joiner's self-sound and the existing peer's sound
// don't both play.
export function playJoinCall(): void {
  guardPlay('peer-presence', () => {
    const c = ac(); if (!c) return
    tone(c, 392, 0.14, 0.12, 0)
    tone(c, 523, 0.14, 0.16, 0.11)
  })
}

// Single short descending tone — call ended.
export function playLeaveCall(): void {
  guardPlay('leave-call', () => {
    const c = ac(); if (!c) return
    tone(c, 370, 0.14, 0.18)
  })
}

// Ascending triad — screen sharing started (local or remote).
export function playScreenShareStart(): void {
  guardPlay('screen-share-start', () => {
    const c = ac(); if (!c) return
    tone(c, 392, 0.10, 0.10, 0)
    tone(c, 494, 0.10, 0.12, 0.09)
    tone(c, 587, 0.09, 0.14, 0.18)
  })
}

// Three short pulses — someone is knocking and waiting to be admitted.
export function playKnockRequest(): void {
  guardPlay('knock-request', () => {
    const c = ac(); if (!c) return
    tone(c, 440, 0.12, 0.07, 0)
    tone(c, 440, 0.12, 0.07, 0.14)
    tone(c, 440, 0.10, 0.09, 0.28)
  })
}

// Soft single descending tone — screen sharing stopped (local or remote).
export function playScreenShareStop(): void {
  guardPlay('screen-share-stop', () => {
    const c = ac(); if (!c) return
    tone(c, 494, 0.10, 0.10, 0)
    tone(c, 392, 0.08, 0.14, 0.09)
  })
}
