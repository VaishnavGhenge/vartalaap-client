# Sessionly Client

[![Tests](https://github.com/VaishnavGhenge/vartalaap-client/actions/workflows/test.yml/badge.svg)](https://github.com/VaishnavGhenge/vartalaap-client/actions/workflows/test.yml)

The Sessionly web client is a Next.js application for scheduling sessions and joining reliable browser video calls. It combines the booking experience with Cloudflare Realtime SFU media, authenticated access, call recovery, and responsive call controls.

## Architecture

- **Framework:** Next.js App Router, TypeScript, and Tailwind CSS
- **Booking UI:** public scheduling pages, booking confirmation, cancellation, rescheduling, dashboard, reminders, and calendar-aware status
- **Media:** Cloudflare Realtime SFU through `PartyTracks`, wrapped by `SfuSession` in `src/services/webrtc/sfu-session.ts`
- **Signaling:** the Go server owns rooms and participant state and broadcasts published `sfu-tracks`
- **State:** Zustand in `src/stores/peer.ts`
- **Observability:** Sentry and browser-side call quality/media metrics

There is no peer-to-peer media path in the current client. Each participant publishes through one SFU session and subscribes to remote participant tracks through managed SFU sessions.

## Requirements

- Node.js 22 or newer
- npm
- A running Vartalaap signaling server for local calls

Install dependencies and start the development server:

```bash
npm install
npm run dev                 # http://localhost:3000
```

The client defaults to `localhost:8080` for the API server. Common local variables are:

```bash
NEXT_PUBLIC_SERVER_DOMAIN=localhost:8080
NEXT_PUBLIC_SERVER_SECURE=false
NEXT_PUBLIC_AUTH_SAME_ORIGIN=false
NEXT_PUBLIC_BOOKING_HOST=getsessionly.com
NEXT_PUBLIC_SENTRY_DSN=      # optional
```

Set these in `.env.local`; do not commit credentials or tokens.

## Scripts

```bash
npm run dev              # Start Next.js development mode
npm run build            # Build the production application
npm run start            # Serve a production build
npm run lint             # ESLint; warnings do not fail the command
npx tsc --noEmit         # Type check
npm test                 # Run unit tests once
npm run test:watch       # Run unit tests in watch mode
npm run test:coverage    # Run tests and generate coverage/
npm run test:e2e         # Run Playwright end-to-end tests
npm run test:call-lab   # Run opt-in call reliability lab scenarios
```

The CI workflow runs linting, TypeScript checks, unit tests, and coverage on every push. Coverage is uploaded as a `coverage-report` artifact for pushes to `main`.

## End-to-end testing

Most Playwright tests expect the client and server to be available locally:

```bash
NEXT_PUBLIC_SERVER_DOMAIN=localhost:8080 \\
NEXT_PUBLIC_SERVER_SECURE=false \\
npm run test:e2e
```

For a deployed environment, set `E2E_BASE_URL` to the client URL and configure the server variables for the matching API. Opt-in suites are disabled unless their flag is set:

```bash
E2E_RELIABILITY=true npm run test:e2e -- call-reliability.spec.ts
CALL_LAB=true npm run test:call-lab
E2E_LONG_CALL=true npm run test:e2e -- long-call.spec.ts
E2E_CAPACITY=true npm run test:e2e -- call-capacity.spec.ts
```

The media-flow suites validate more than DOM state: they check growing RTP stats, decoded video frames, and remote audio energy. A green local or synthetic run is not a substitute for real-device, WAN, multi-participant, or long-call acceptance.

## Project layout

| Path | Responsibility |
|------|----------------|
| `app/` | Next.js routes, booking pages, authentication, room pages, metadata, sitemap, and robots configuration |
| `src/components/` | Shared UI, booking, dashboard, and call components |
| `src/stores/peer.ts` | Local media intent, tracks, processors, and participant state |
| `src/services/webrtc/` | SFU session, track reconciliation, repair loops, and media stats |
| `src/services/signaling/` | WebSocket protocol and room-state client |
| `src/services/api/` | API clients for auth, bookings, ICE, SFU sessions, and tokens |
| `e2e/` | Playwright call, booking, reliability, and media-flow tests |
| `scripts/` | Browser and experience verification helpers |

## Development expectations

Media changes should preserve graceful degradation: full video, reduced media, audio-only, reconnect prompt, and clean disconnect. Every new browser media path should handle permission, device, signaling, SFU, and cleanup failures.
