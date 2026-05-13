# vartalaap-client — Frontend Rules

Next.js + TypeScript + Tailwind + Zustand. WebRTC uses a raw RTCPeerConnection wrapper in `src/services/webrtc/session.ts`.

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
- Keep direct `RTCPeerConnection` access inside `WebRTCSession`; expose focused methods instead of reaching into transport internals from stores or components
- Noise suppression and background blur are media transforms — new effects follow the same start/stop pattern as `NoiseSuppressor` and `BackgroundBlurProcessor`

## Failure paths to always handle

- `getUserMedia` → `NotAllowedError`, `NotFoundError`, `NotReadableError`
- ICE connection → `disconnected`, `failed` states (surface to user, offer restart)
- Signaling WebSocket → unexpected close (show `ConnectionBanner`, attempt reconnect with backoff)
- AudioWorklet / WASM load failure → fall back to raw track, never crash the call
