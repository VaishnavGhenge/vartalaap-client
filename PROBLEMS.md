# Vartalaap — Known Problems

Problems holding us back from being best-in-class. Ordered by impact on the core experience.

---

## P0 — Directly hurts call quality

### 1. Browser-native noise/echo suppression is mediocre
`getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true } })` delegates to the OS/browser pipeline (WebRTC AEC3 + NS). It handles simple cases but fails on mechanical keyboard noise, background TV, fan noise, and double-talk. Users in noisy environments will sound bad.

**Fix:** Integrate [RNNoise](https://jmvalin.ca/demo/rnnoise/) via WebAssembly as a Web Audio processing node. Runs in-browser, no server, ~40 KB WASM binary. Apply it as an AudioWorkletProcessor between `getUserMedia` and the peer sender. This is what Krisp/NVIDIA RTX Voice do at the model level.

### 2. No background blur
Camera users are at the mercy of whatever is behind them — messy room, family walking by. Background blur is now table-stakes in video calling.

**Quick fix (done):** Chrome 94+ native `applyConstraints({ advanced: [{ backgroundBlur: true }] })`. Zero CPU overhead, no JS library. Implemented as a toggle button in the control bar, re-applied on camera enable and camera switch.

**Proper fix:** [MediaPipe Selfie Segmentation](https://developers.google.com/mediapipe/solutions/vision/image_segmenter) + canvas compositing for cross-browser support and virtual backgrounds.

### 3. No pre-call device preview
Users currently join the call before knowing if their mic or camera is working, which mic/camera is selected, or what they look/sound like. This is a top-3 friction point in all video calling research. A bad setup ruins the first impression.

**Fix:** Extend the join screen with a live camera preview tile, mic level meter (already exists in `use-audio-level`), and device selectors for microphone, camera, and speaker output (`enumerateDevices`).

### 4. No device picker (mic/camera/speaker selection)
No way to choose between multiple microphones or cameras beyond the front/back flip on mobile. On desktop, if the wrong mic is selected by the browser default, there is no recovery without leaving the browser settings.

**Fix:** Add a settings panel (gear icon in control bar) with `MediaDevices.enumerateDevices()` dropdowns for audio input, video input, and audio output. Persist selection to `localStorage`. Apply immediately via `replaceTrack`.

---

## P1 — Missing features that define "best in class"

### 5. Screen share is disabled
`SCREEN_SHARE_ENABLED = false` in `MeetCall.tsx`. The code is complete — `startScreenShare`, `stopScreenShare`, the overlay UI, the auto-stop on `track.ended` are all implemented. This is blocked by an unresolved issue (unknown). Needs investigation and re-enabling.

### 6. No in-call text chat
For couples/small groups, a chat panel for sharing links, quick messages when audio is bad, or silent communication is a high-value feature that most platforms do poorly (buried, laggy, separate window). A clean side drawer with WebSocket message relaying through the signaling server would cover this.

### 7. No speaking indicator on the join screen
Users can't verify their mic is working before joining. The `use-audio-level` hook already exists — it just needs to be shown in the join screen as a visual meter.

---

## P2 — Architecture ceiling (higher effort, high payoff)

### 8. `simple-peer` abstraction blocks quality control
`simple-peer` wraps `RTCPeerConnection` and hides TWCC (Transport-Wide Congestion Control) events, raw RTCP feedback, and fine-grained `getStats()` access. The current code already reaches through `_pc` (a private field) to call `getSenders()` and `applyConstraints`. This is fragile and will break on simple-peer upgrades.

Migrating to raw `RTCPeerConnection` unlocks: reading TWCC deltas directly, custom congestion response, better ICE restart control, and no dependency on an unmaintained library.

### 9. P2P mesh degrades fast with 3+ participants
Each participant opens N-1 peer connections and encodes N-1 independent video streams. At 4 participants that is 6 connections and 3× encode CPU per device. Mobile devices start dropping frames at 3 people.

**Fix:** Selective Forwarding Unit (SFU). [Pion](https://github.com/pion/webrtc) in Go (already the server language) makes this feasible without managed infrastructure. A basic SFU — receive one upload per participant, forward to others — is ~600 lines of Go. Managed services (Livekit, which is built on Pion) are also an option if operational cost is acceptable.

### 10. ICE server fetch happens after join
`fetchIceServers()` is called inside `useCall` after the signaling connection is established. If the TURN credential fetch is slow, early ICE candidates are gathered without TURN and relayed candidates arrive late or not at all, causing connection failures on symmetric NAT.

**Fix:** Pre-fetch ICE servers on the join screen before the user clicks "Join", so credentials are ready when `createPeer` is called.

### 11. No low-light video enhancement
In low-light conditions (evening calls, dim rooms) video degrades severely. No post-processing is applied.

**Fix:** Canvas-based brightness/contrast boost via `ImageBitmap` + `OffscreenCanvas`, or MediaPipe when already integrated for blur. Alternatively, expose the `torch` constraint on mobile for devices that support it.

---

## P3 — Reliability and observability gaps

### 12. Single signaling server, no redundancy
One Go signaling server. If it goes down, all active calls drop. No graceful reconnect with state recovery (the `ConnectionBanner` exists but reconnect re-joins as a new participant, not a seamless resume).

### 13. Audio latency constraint missing
`getUserMedia` audio does not set `latency: { ideal: 0 }`. On some browsers/OS combinations this results in 20-40 ms of extra buffering in the audio pipeline before WebRTC even sees the samples.

**Fix:** Add `latency: { ideal: 0 }` to the audio constraints in `enableMic`. One line. Done.

### 14. No adaptive jitter buffer tuning
Inbound jitter is tracked in `use-peer-stats` but not used to tune playout delay. At high jitter the browser's default buffer adds latency perceptible as a sluggish, unnatural conversation rhythm.

---

## Quick-win backlog (small effort, real improvement)

| # | What | Where | Effort |
|---|------|--------|--------|
| A | Add `latency: { ideal: 0 }` to audio constraints | `peer.ts:232` | 1 line |
| B | Re-enable screen share after root cause investigation | `MeetCall.tsx:3` | investigation |
| C | Mic level meter on join screen | `JoinMeet.tsx` | ~30 lines |
| D | Speaker output selector via `setSinkId` | settings panel | ~50 lines |
