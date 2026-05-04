# Vartalaap Client

[![Tests](https://github.com/VaishnavGhenge/vartalaap-client/actions/workflows/test.yml/badge.svg)](https://github.com/VaishnavGhenge/vartalaap-client/actions/workflows/test.yml)

High-quality P2P video calling for couples and small groups. Built with Next.js, WebRTC via simple-peer, Zustand, and Tailwind.

## Test coverage

Coverage is measured on every push and pull request. Current baseline from `main`:

| Metric | Coverage |
|--------|----------|
| Statements | 33% |
| Branches | 25% |
| Functions | 28% |
| Lines | 34% |

The detailed HTML report is uploaded as a CI artifact (`coverage-report`) on each run.

### What is tested

| Area | Files | Notes |
|------|-------|-------|
| Signaling client | `services/signaling/client.ts` | Connection, reconnection, heartbeat, message dispatch |
| `useCall` hook | `hooks/use-call.ts` | Join, peer creation/removal, ICE restart, cleanup |
| Peer store — mic | `stores/peer.ts` | enableMic / disableMic, replaceTrack, getUserMedia error |
| Peer store — camera | `stores/peer.ts` | switchCamera, enableCamera / disableCamera, screen share |
| `useHasMultipleCameras` | `hooks/use-has-multiple-cameras.ts` | Device enumeration edge cases |
| Stats parsing | `hooks/use-peer-stats.ts` | Quality classification, bitrate, relay detection |
| Adaptive encoding | `hooks/use-peer-stats.ts` | Step-down / step-up logic, floor/ceiling guards |
| Background blur | `lib/background-blur.ts` | Start/stop lifecycle, idempotent cleanup |
| ICE API | `services/api/ice.ts` | Success, HTTP error, network failure |
| ConnectionBanner | `components/ui/ConnectionBanner.tsx` | Reconnecting countdown, recovery |
| VideoTile | `components/ui/VideoTile.tsx` | Avatar, speaking ring, name pill |

### Running tests locally

```bash
# Unit tests (fast)
npm test

# Unit tests in watch mode
npm run test:watch

# Unit tests + coverage report
npm run test:coverage
# → opens coverage/index.html for the full HTML report

# End-to-end tests (requires a running dev server)
npm run test:e2e
```

## Development

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # production build
npm run lint      # ESLint
npx tsc --noEmit  # type check
```

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) |
| WebRTC | simple-peer + raw RTCPeerConnection |
| State | Zustand |
| Styling | Tailwind CSS |
| Error tracking | Sentry |
| Unit tests | Vitest + Testing Library |
| E2E tests | Playwright |
