// Chromium detection: `window.chrome` is reliably present in Chrome, Edge, Brave
// and other Chromium-based browsers, but absent in Firefox and Safari.
function isChromium(): boolean {
  return typeof window !== 'undefined' && 'chrome' in window
}

const BASE = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  // 48 kHz is the WebRTC standard — resampling to/from 48kHz adds latency and
  // degrades AEC performance, so request it directly.
  sampleRate: { ideal: 48000 },
  // Mono is sufficient for voice and halves the data the AEC must process.
  channelCount: { ideal: 1 },
  // Lowest capture latency gives the AEC the tightest reference alignment
  // between playback and the captured signal. TypeScript's lib.dom.d.ts omits
  // `latency` from MediaTrackConstraints despite it being in the spec.
  latency: { ideal: 0 },
} satisfies Record<string, unknown>

// Safe Chrome/Chromium hints — applied on all Chromium browsers.
// These reinforce the standard W3C constraints with Chrome's internal names
// and are well-tested across devices.
const CHROMIUM_SAFE: Record<string, unknown> = {
  googEchoCancellation: true,
  googNoiseSuppression: true,
  googHighpassFilter: true,   // 80 Hz high-pass removes HVAC / low-frequency room rumble
  googAudioMirroring: false,  // prevent mic audio routing back to output device
}

// Experimental Chrome hints — only applied when the user opts in via the
// "Enhanced Echo Cancellation" toggle.
//
// googExperimentalEchoCancellation — AEC3, Chrome's 3rd-generation echo
//   canceller (delay-agnostic, handles non-linear echo better than AEC2).
// googExperimentalNoiseSuppression — neural-net noise suppressor. Can
//   over-suppress and produce silence in some acoustic environments; keep
//   behind a flag until behaviour is validated across devices.
// googTypingNoiseDetection — keystroke-burst suppressor; can misfire on
//   non-typing sounds in some environments.
// googEchoCancellationMobileMode: false — forces the desktop AEC pipeline on
//   mobile Chrome. Significantly higher CPU cost; can stall audio processing
//   on weaker devices, resulting in silence at the remote end.
const CHROMIUM_EXPERIMENTAL: Record<string, unknown> = {
  googExperimentalEchoCancellation: true,
  googExperimentalNoiseSuppression: true,
  googTypingNoiseDetection: true,
  googAutoGainControl: true,
  googEchoCancellationMobileMode: false,
}

/**
 * Returns microphone constraints for the current browser.
 *
 * Pass `experimental = true` to additionally enable Chrome's AEC3, neural
 * noise suppressor, and typing-noise detector (the "Enhanced Echo
 * Cancellation" opt-in). Those hints are safe on most desktop hardware but
 * can suppress audio entirely on mobile or in unusual acoustic environments,
 * so they are off by default.
 */
export function getMicConstraints(experimental = false): MediaTrackConstraints {
  return {
    ...BASE,
    ...(isChromium() ? CHROMIUM_SAFE : {}),
    ...(isChromium() && experimental ? CHROMIUM_EXPERIMENTAL : {}),
  } as MediaTrackConstraints
}
