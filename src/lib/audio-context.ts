// One AudioContext per session, shared across all useAudioLevel instances.
// Must be resumed inside a user-gesture handler (e.g. the Join button) to
// satisfy iOS Safari's autoplay policy. Desktop Chrome/Firefox are lenient,
// but we share anyway to avoid the per-tile overhead.

type AudioContextWithSinkId = AudioContext & { setSinkId: (id: string) => Promise<void> }

let sharedCtx: AudioContext | null = null
// Preserved across context recreations so a new context gets the right output.
let pendingSinkId: string | null = null

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
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new Ctor({ latencyHint: 'interactive', sampleRate: 48000 })
    if (pendingSinkId && 'setSinkId' in sharedCtx) {
      ;(sharedCtx as AudioContextWithSinkId).setSinkId(pendingSinkId).catch(() => {})
    }
  }
  return sharedCtx
}

// Call this synchronously inside a user-gesture handler (Join, unmute, etc.)
// to ensure the context is running before any analyser nodes are attached.
export function resumeSharedAudioContext(): void {
  const ctx = getSharedAudioContext()
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
}

// Routes all AudioContext output to the given device. Chrome 110+ only;
// silently no-ops on unsupported browsers.
export async function setAudioOutputDevice(deviceId: string): Promise<void> {
  pendingSinkId = deviceId
  const ctx = getSharedAudioContext()
  if (!ctx || !('setSinkId' in ctx)) return
  try {
    await (ctx as AudioContextWithSinkId).setSinkId(deviceId)
  } catch (e) {
    console.warn('[AudioContext] setSinkId failed', e)
  }
}

// True only on Chrome 110+ and other browsers that implement AudioContext.setSinkId.
export function supportsAudioOutputSelection(): boolean {
  return typeof window !== 'undefined' && 'setSinkId' in AudioContext.prototype
}
