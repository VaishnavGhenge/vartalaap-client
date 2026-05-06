# Vartalaap — Known Problems

Problems holding us back from being best-in-class. Ordered by impact on the core experience.

---

## P0 — Directly hurts call quality

### ~~1. Browser-native noise/echo suppression is mediocre~~ ✅ Resolved
RNNoise AI noise suppression shipped via `NoiseSuppressor` (`src/lib/noise-suppression.ts`). AudioWorklet pipeline: `getUserMedia` → RNNoise WASM worklet → `MediaStreamAudioDestinationNode`. Toggle in Settings panel, persisted to `localStorage`. Applied automatically on `enableMic` and device switch when active.

### 3. No pre-call device preview
Users currently join the call before knowing if their mic or camera is working, which mic/camera is selected, or what they look/sound like. This is a top-3 friction point in all video calling research. A bad setup ruins the first impression.

**Fix:** Extend the join screen with device selectors for microphone, camera, and speaker output (`enumerateDevices`). Camera preview and mic level meter are already live on the join screen.

### 4. No device picker (mic/camera/speaker selection)
No way to choose between multiple microphones or cameras beyond the front/back flip on mobile. On desktop, if the wrong mic is selected by the browser default, there is no recovery without leaving the browser settings.

**Fix:** Add device dropdowns (`MediaDevices.enumerateDevices()`) for audio input, video input, and audio output to the Settings panel. Persist selection to `localStorage`. Apply immediately via `replaceTrack`.

---

## P1 — Missing features that define "best in class"

### 6. No in-call text chat
For couples/small groups, a chat panel for sharing links, quick messages when audio is bad, or silent communication is a high-value feature that most platforms do poorly (buried, laggy, separate window). A clean side drawer with WebSocket message relaying through the signaling server would cover this.

### 7. No speaking indicator on the join screen
Users can't verify their mic is working before joining. The `use-audio-level` hook already exists — it just needs to be shown in the join screen as a visual meter.

---

## P2 — Architecture ceiling (higher effort, high payoff)

### 8. `simple-peer` abstraction blocks quality control
`simple-peer` wraps `RTCPeerConnection` and hides TWCC (Transport-Wide Congestion Control) events, raw RTCP feedback, fine-grained `getStats()`, sender lifecycle, and renegotiation details. The current code already reaches through `_pc` (a private field) to call `getSenders()`, `replaceTrack()`, and `restartIce()`. This is fragile and will break on simple-peer upgrades.

**Fix:** Replace `simple-peer` with raw `RTCPeerConnection` and explicit audio/video transceivers. Pre-create senders with `sendrecv` transceivers, handle offer/answer glare intentionally, and make `replaceTrack()` the normal path for mic/camera/screen changes. This removes private `_pc` access and makes audio publish, renegotiation, ICE restart, and stats collection reliable by design.

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
