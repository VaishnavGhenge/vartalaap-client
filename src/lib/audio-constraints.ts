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

// Chrome/Chromium proprietary constraint hints — silently ignored by Firefox
// and Safari, so spreading them unconditionally on Chromium is safe.
//
// googExperimentalEchoCancellation — activates AEC3, Chrome's 3rd-generation
//   echo canceller (delay-agnostic, suppresses non-linear echo, handles
//   near-end noise better than AEC2).
// googExperimentalNoiseSuppression — neural-net noise suppressor (RNNoise-based)
//   vs the older spectral-subtraction suppressor.
// googHighpassFilter — 80 Hz high-pass removes HVAC / low-frequency room rumble
//   before the AEC reference signal is computed.
// googTypingNoiseDetection — classifier that suppresses keystroke bursts.
// googAudioMirroring: false — prevents the capture pipeline from routing mic
//   audio back to the output device (would create an acoustic echo path).
// googEchoCancellationMobileMode: false — forces the desktop-quality AEC pipeline
//   even on mobile Chrome (more CPU, but significantly cleaner suppression).
const CHROMIUM_HINTS: Record<string, unknown> = {
  googEchoCancellation: true,
  googExperimentalEchoCancellation: true,
  googNoiseSuppression: true,
  googExperimentalNoiseSuppression: true,
  googHighpassFilter: true,
  googTypingNoiseDetection: true,
  googAutoGainControl: true,
  googAudioMirroring: false,
  googEchoCancellationMobileMode: false,
}

/**
 * Returns the best available microphone constraints for the current browser.
 *
 * On Chromium browsers, activates AEC3 and the experimental neural noise
 * suppressor via Chrome's proprietary constraint hints. On all browsers,
 * requests 48 kHz mono with the lowest possible capture latency.
 */
export function getMicConstraints(): MediaTrackConstraints {
  return {
    ...BASE,
    ...(isChromium() ? CHROMIUM_HINTS : {}),
  } as MediaTrackConstraints
}
