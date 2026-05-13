# Vartalaap — Known Problems

Problems holding us back from being best-in-class. Ordered by impact on the core experience.

---

## P0 — Directly hurts call quality

### ~~1. Browser-native noise/echo suppression is mediocre~~ ✅ Resolved
RNNoise AI noise suppression shipped via `NoiseSuppressor` (`src/lib/noise-suppression.ts`). AudioWorklet pipeline: `getUserMedia` → RNNoise WASM worklet → `MediaStreamAudioDestinationNode`. Toggle in Settings panel, persisted to `localStorage`. Applied automatically on `enableMic` and device switch when active.

### ~~3. No pre-call device preview~~ ✅ Resolved
### ~~4. No device picker (mic/camera/speaker selection)~~ ✅ Resolved
Device selectors (mic, camera, speaker) now live below the camera preview on the join screen via `DeviceSelect` component. Mic level meter (`MicLevelMeter`) shows live audio activity when mic is on. `useAudioLevel` extended to return `{ speaking, level }` for both boolean indicator and continuous meter use.

---

## P1 — Missing features that define "best in class"

### 6. No in-call text chat
For couples/small groups, a chat panel for sharing links, quick messages when audio is bad, or silent communication is a high-value feature that most platforms do poorly (buried, laggy, separate window). A clean side drawer with WebSocket message relaying through the signaling server would cover this.

### ~~7. No speaking indicator on the join screen~~ ✅ Resolved
`MicLevelMeter` renders animated bars above the controls when mic is on. Shares the `level` value from `useAudioLevel`.

---

## P2 — Architecture ceiling (higher effort, high payoff)

### 8. P2P session model is not SFU-ready
The old `simple-peer` dependency has been replaced with a raw `RTCPeerConnection` wrapper, but the app still creates one `WebRTCSession` per remote peer and couples call orchestration to offer/answer relay. That model makes SFU migration harder because `use-call.ts`, `peer.ts`, and `use-peer-stats.ts` all assume peer-to-peer sessions.

**Fix:** Introduce an SFU-ready session boundary before the Cloudflare Realtime SFU cut-over. `use-call.ts` should talk to a transport interface, while `peer.ts` owns local media tracks and `use-peer-stats.ts` consumes transport stats without assuming one connection per remote peer.

### 9. P2P mesh degrades fast with 3+ participants
Each participant opens N-1 peer connections and encodes N-1 independent video streams. At 4 participants that is 6 connections and 3× encode CPU per device. Mobile devices start dropping frames at 3 people.

**Fix:** Selective Forwarding Unit (SFU). [Pion](https://github.com/pion/webrtc) in Go (already the server language) makes this feasible without managed infrastructure. A basic SFU — receive one upload per participant, forward to others — is ~600 lines of Go. Managed services (Livekit, which is built on Pion) are also an option if operational cost is acceptable.

### 11. No low-light video enhancement
In low-light conditions (evening calls, dim rooms) video degrades severely. No post-processing is applied.

**Fix:** Canvas-based brightness/contrast boost via `ImageBitmap` + `OffscreenCanvas`, or MediaPipe when already integrated for blur. Alternatively, expose the `torch` constraint on mobile for devices that support it.

---

## P3 — Reliability and observability gaps

### 12. Single signaling server, no redundancy
One Go signaling server. If it goes down, all active calls drop. No graceful reconnect with state recovery (the `ConnectionBanner` exists but reconnect re-joins as a new participant, not a seamless resume).

### 14. No adaptive jitter buffer tuning
Inbound jitter is tracked in `use-peer-stats` but not used to tune playout delay. At high jitter the browser's default buffer adds latency perceptible as a sluggish, unnatural conversation rhythm.

---

## Quick-win backlog (small effort, real improvement)

| # | What | Where | Effort |
|---|------|--------|--------|
| B | Mic level meter on join screen | `JoinMeet.tsx` | ~30 lines |
| C | Speaker output selector via `setSinkId` | settings panel | ~50 lines |

---

## Resolved

| # | Problem | Resolution |
|---|---------|------------|
| P0-1 | Browser-native noise/echo suppression is mediocre | RNNoise AI noise suppression via `NoiseSuppressor` class + AudioWorklet. Toggle in Settings, persisted, applied on enableMic and device switch. |
| P0-2 | No background blur | Full background effects system shipped: blur-subtle / blur-medium / blur-strong / custom image upload, canvas compositing via `BackgroundBlurProcessor`, persisted preference, applied on camera enable and camera switch. |
| P1-5 | Screen share disabled | Screen share fully enabled — button, state management, auto-stop on `track.ended`, and peer `replaceTrack` all live. |
| P2-10 | ICE server fetch happens after join | `fetchIceServers()` now called on mount in `JoinMeet` so credentials are ready before the user hits Join. |
| P3-13 / A | Audio latency constraint missing | `latency: { ideal: 0 }` added to `enableMic` audio constraints in `peer.ts`. |
| — | Camera crashes on old Android | `NotFoundError` (exact `facingMode` → switched to `ideal`) and `NotReadableError` (hardware busy) both handled with progressive constraint fallback in `getUserMediaWithFallback`. |
