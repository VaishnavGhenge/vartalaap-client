// One AudioContext per session, shared across all useAudioLevel instances.
// Must be resumed inside a user-gesture handler (e.g. the Join button) to
// satisfy iOS Safari's autoplay policy. Desktop Chrome/Firefox are lenient,
// but we share anyway to avoid the per-tile overhead.

let sharedCtx: AudioContext | null = null

function getAudioCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  )
}

export function getSharedAudioContext(): AudioContext | null {
  const Ctor = getAudioCtor()
  if (!Ctor) return null
  if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new Ctor()
  return sharedCtx
}

// Call this synchronously inside a user-gesture handler (Join, unmute, etc.)
// to ensure the context is running before any analyser nodes are attached.
export function resumeSharedAudioContext(): void {
  const ctx = getSharedAudioContext()
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
}
