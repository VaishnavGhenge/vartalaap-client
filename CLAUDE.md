# vartalaap-client — Frontend Rules

Next.js + TypeScript + Tailwind + Zustand. WebRTC media is routed through Cloudflare Realtime SFU — each peer has two `PartyTracks` instances (publish-only + subscribe-only) wrapped in `SfuSession` (`src/services/webrtc/sfu-session.ts`). The signaling server is the source of truth for room/peer state and broadcasts `sfu-tracks` after each publish so others can pull. There is no peer-to-peer `RTCPeerConnection`.

---

## UI components

Check `src/components/ui/` before writing any UI. If a primitive (Toggle, Modal, Badge, Tooltip, etc.) doesn't exist, create it there first — never inline it. Components must:
- Accept the full likely prop surface (`disabled`, `className`, `id`, `description`, etc.)
- Use CSS variables exclusively (`hsl(var(--primary))`, `hsl(var(--border))`, `hsl(var(--muted-foreground))`, etc.) — never hardcode colors
- Follow the pattern established by `button.tsx` and `Toggle.tsx`

## State

All media and peer state lives in `src/stores/peer.ts` (Zustand). Before adding state, read the whole file — the patterns for local tracks, processors, and peer replacement are established and must be followed exactly.

## WebRTC rules

- Every `getUserMedia` call needs a fallback path (see `getUserMediaWithFallback` in peer.ts)
- Every `replaceTrack` call must handle `OperationError` silently — it fires when the sender is gone
- Keep direct `RTCPeerConnection` access inside `SfuSession`; the store and components should only call its focused methods (`publish`, `replaceTrack`, `subscribe`, `unsubscribePeer`, `close`)
- When attaching a freshly-arrived remote track, allocate a NEW `MediaStream` instead of mutating an existing one — programmatic `stream.addTrack()` does not fire the `addtrack` event, so the `VideoStream` component will not re-sync `srcObject` and the user will see a frozen/black frame
- Noise suppression and background blur are media transforms — new effects follow the same start/stop pattern as `NoiseSuppressor` and `BackgroundBlurProcessor`

## Failure paths to always handle

- `getUserMedia` → `NotAllowedError`, `NotFoundError`, `NotReadableError`
- ICE connection → `disconnected`, `failed` states (surface to user, offer restart)
- Signaling WebSocket → unexpected close (show `ConnectionBanner`, attempt reconnect with backoff)
- AudioWorklet / WASM load failure → fall back to raw track, never crash the call
