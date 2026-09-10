# Real-call reliability and scale gaps

Unit tests establish that individual state transitions behave as written. They
do not establish that a deployed call survives real scheduling delays, browser
behavior, network changes, device changes, concurrent user actions, or many
participants. This document defines the missing evidence between the current
test suite and a Meet-like reliability claim.

Use the existing staging call lab for deployed URLs and baseline commands. Run
browser-local delay and offline tests against the current local worktree or
staging. Run shared infrastructure fault injection only against staging, and
use isolated Cloudflare credentials and test accounts.

## Product invariant

From clicking Join until explicitly leaving, the call must keep converging on
the latest user intent:

- A slow valid result may complete the current operation.
- A result from an obsolete operation must not change current state.
- A temporary failure may reduce quality or show recovery state, but must not
  silently end the call.
- Working audio should survive a video-only failure whenever the browser and
  transport allow it.
- Leaving is the cancellation boundary. No delayed work may recreate media,
  devices, signaling, or UI state after leave.

## Current evidence

The repository currently has unit coverage for signaling reconciliation, SFU
publication and subscription repair, stale-session withdrawal, join/reconnect
sequencing, media-flow detection, and cleanup. The staging browser suite checks
RTP byte growth, decoded video frames, audio energy, late join, toggles, and
leave/rejoin with synthetic media.

That evidence does not cover real devices, impaired WAN media, browser process
pauses, overlapping controls, reordered control responses, long calls, or
distributed load. Passing it means the known code paths work under the modeled
conditions; it is not a production reliability or capacity result.

## Missing reliability scenarios

| Scenario | Injection | Required assertions |
| --- | --- | --- |
| Slow initial setup | Delay session creation, publish, and pull responses independently by 0.5s, 2s, 5s, and 15s | UI remains responsive; one current session wins; both directions eventually show growing RTP, decoded frames, and audio energy; no duplicate tracks |
| Response arrives after replacement | Hold an old publish or pull response until a newer operation completes | Old response causes no state change; current session remains announced and subscribed |
| Signaling loss during join | Close WebSocket after `join` and before `joined` | Reconnect rejoins; startup finishes once; no duplicate participant; media arrives |
| Signaling loss during a healthy call | Interrupt WebSocket for 2s, 10s, and 30s while media transport remains available | Existing media continues; room state reconciles after reconnect; toggles made during recovery converge to final intent |
| Media-path blackout | Block media UDP briefly while keeping HTTPS and WebSocket alive | Call enters degraded state; short outage does not rebuild a connected session; sustained outage repairs; audio and video resume without rejoining |
| Network handoff | Move a mobile device between Wi-Fi and cellular, in both directions | Audio interruption and recovery time are recorded; media resumes or a clear recovery action appears; participant identity is unchanged |
| Overlapping controls | Rapid camera on/off/on, mic mute/unmute, and screen start/stop while negotiation is delayed | Final state equals the last user action; at most one camera and one screen track are published; no obsolete callback reverses intent |
| Leave during negotiation | Leave while join, publish, pull, reconnect, or device acquisition is pending | Devices stop; sessions close; timers and requests lose ownership; no late callback recreates call state |
| Device disruption | Unplug camera, revoke permission, switch microphone, connect/disconnect Bluetooth | Audio continues where possible; the UI explains the lost device; selecting a valid replacement recovers without rejoining |
| Browser lifecycle | Background and foreground mobile Chrome/Safari; lock and unlock device; suspend laptop | State reconciles after resume; stale sessions are withdrawn; media either resumes or presents a usable recovery path |
| Long call | Maintain a two-person call for 2 hours with token refresh and periodic toggles | No auth expiry breaks later SFU operations; memory/session counts remain bounded; media still flows at the end |

## Missing scale scenarios

Scale results must use distributed generators. Ten browser contexts on one
laptop primarily measure that laptop's encoder, scheduler, and network.

| Shape | Purpose | Minimum evidence |
| --- | --- | --- |
| 2 real devices, 2 networks | User-path baseline | Bidirectional moving video and audible audio; TTFM phases; 15-minute soak; toggle and reconnect recovery |
| 4 real devices, mixed desktop/mobile | Small-group behavior | Every expected subscription flows; active controls remain responsive; one weak participant does not destabilize others |
| 8 and 10 distributed browsers | Current product capacity | Every participant receives every expected track at repeated checkpoints; CPU and memory remain below saturation; leave/rejoin succeeds |
| Multiple rooms in parallel | Control-plane isolation | A failure or repair burst in one room does not increase error rate or recovery time in another |
| Join burst | Connection-attempt capacity | Connection success stays at least 99.5%; TTFM p95 stays at or below 3s and p99 at or below 6s; no retry synchronization spike |
| Partial regional outage | Dependency recovery | Existing calls degrade predictably; new calls fail clearly or route successfully; recovery does not require users to refresh |

Start with the product's real target—couples and small groups. Larger tests are
useful for finding saturation boundaries, but they must not replace deep
two-person failure testing.

## Required measurements

Each run must retain per-participant timestamps for join sent, joined received,
ICE connected, publish acknowledged, remote announcement received, pull issued,
first RTP bytes, first decoded frame, and first non-zero audio energy. Also
retain:

- RTP bytes and packets over time, decoded frames, audio energy, freezes, packet
  loss, jitter, RTT, selected candidate type, and connection-state changes.
- Current signaling generation, publish generation, remote session ID, desired
  media state, and applied media state around every failure.
- API response status and duration by SFU operation, WebSocket reconnect count,
  repair attempts, repair success, and session count.
- Browser, operating system, device, network type, geography, test build, and
  exact impairment profile.

Logs and reports must use a generated test-run ID. Do not put room IDs, user IDs,
or participant names into metric labels.

## Harness still needed

1. A controllable staging fault proxy for SFU HTTP and signaling that can delay,
   fail, hold, duplicate, and release selected operations by test-run ID.
2. Media-path impairment outside the page process using Linux traffic control,
   a network emulator, or a dedicated device/router. Browser HTTP throttling is
   not a WebRTC media impairment test.
3. A distributed runner with one browser process per host or device, synchronized
   checkpoints, and host resource capture.
4. Per-participant identifiable video and audio fixtures so content assertions
   prove that every expected sender is routed to the correct receiver. The
   current checks establish received decoded frames, changing pixels, and audio
   energy, but they do not identify each remote source in a larger room.
5. A retained artifact containing the event timeline, impairment schedule,
   assertions, metrics, browser logs, server correlation, and cleanup result.

## Executable tests added

The first automated slice now covers delayed device ownership in unit tests and
real SFU call behavior in Playwright:

- Camera and microphone acquisition completing after off/mute or call cleanup
  cannot publish, and the acquired track is stopped.
- Two overlapping camera requests may finish out of order; only the newest one
  can update the stream or SFU sender.
- A screen-selection result arriving after stop-share cannot publish.
- `call-reliability.spec.ts` delays SFU session/track control requests by five
  seconds, exercises a camera off/on cycle, and verifies bidirectional RTP,
  decoded video, changing pixels, and audible audio. It also verifies recovery
  after a three-second browser-network interruption.
- `call-capacity.spec.ts` now samples throughout the soak and fails when a
  participant exceeds the allowed consecutive audio or video gap. The default
  sample window is three seconds and the default allowed gap is six seconds.
- `call-load.spec.ts` creates parallel two-person rooms, verifies live media in
  every room, removes one participant, proves the other rooms remain healthy,
  and verifies the disrupted room after rejoin.

Run the reliability scenarios against staging:

```bash
E2E_RELIABILITY=true \
E2E_BASE_URL=https://vartalaap-staging.vercel.app \
NEXT_PUBLIC_SERVER_DOMAIN=sessionly-api-staging.up.railway.app \
NEXT_PUBLIC_SERVER_SECURE=true \
npm run test:e2e -- call-reliability.spec.ts --reporter=line,html
```

Run three parallel two-person rooms:

```bash
E2E_LOAD=true \
E2E_LOAD_ROOMS=3 \
E2E_BASE_URL=https://vartalaap-staging.vercel.app \
NEXT_PUBLIC_SERVER_DOMAIN=sessionly-api-staging.up.railway.app \
NEXT_PUBLIC_SERVER_SECURE=true \
npm run test:e2e -- call-load.spec.ts --reporter=line,html
```

Run the continuous capacity soak:

```bash
E2E_CAPACITY=true \
E2E_PARTICIPANTS=10 \
E2E_SOAK_MS=60000 \
E2E_FLOW_SAMPLE_MS=3000 \
E2E_MAX_MEDIA_GAP_MS=6000 \
E2E_BASE_URL=https://vartalaap-staging.vercel.app \
NEXT_PUBLIC_SERVER_DOMAIN=sessionly-api-staging.up.railway.app \
NEXT_PUBLIC_SERVER_SECURE=true \
npm run test:e2e -- call-capacity.spec.ts --reporter=line,html
```

The parallel-room test still runs its browsers on one generator. It establishes
room isolation and application behavior, not geographically distributed
capacity. Use the existing shared-room mode on separate hosts for distributed
evidence.

## Local validation — September 10, 2026

The current worktree was exercised through the local Next.js and Go services,
local Postgres, and real Cloudflare SFU control/media paths:

| Run | Result | Evidence |
| --- | --- | --- |
| Reliability suite | 2/2 passed in 58.9s | Five-second SFU control delays preserved bidirectional media and a camera off/on cycle; a three-second network interruption recovered without rejoining |
| Parallel-room load | Passed in 25.2s | Two rooms and four participants had live RTP, decoded/changing video, and audible audio; the unaffected room stayed healthy during leave/rejoin in the other room |
| Continuous capacity smoke | Passed in 35.8s | Two participants; 12-second continuous soak sampled every three seconds with a six-second maximum-gap gate; media passed before soak and after leave/rejoin |

These are functional smoke results from one machine and network with synthetic
camera/microphone input. They do not close the real-device, WAN impairment,
geographic distribution, or 8/10-participant gaps above.

## Release gates

A call-stack change is ready for production only after:

1. Unit and browser regression suites pass.
2. The two-device baseline passes on separate networks.
3. The failure scenario affected by the change passes three consecutive runs.
4. A 15-minute recovery soak passes with no stale session, duplicate track,
   permanent freeze, or post-leave resurrection.
5. The distributed 8- and 10-participant checks pass when the change affects
   shared room, signaling, subscription, or resource behavior.
6. Connection success and TTFM remain within the repository SLOs, or the release
   is explicitly classified as a measured reliability improvement with a known
   latency regression.
7. Every created browser, SFU session, test meeting, process, and temporary
   infrastructure resource is cleaned up and verified.

## Recommended implementation order

1. Build deterministic delay/reordering hooks for SFU control operations and
   WebSocket events in staging.
2. Automate the four highest-risk lifecycle tests: reconnect-before-joined,
   delayed old response, overlapping camera/share intent, and leave while work
   is pending.
3. Add a two-device Wi-Fi/cellular handoff run with retained WebRTC statistics.
4. Add media-level loss, jitter, latency, and blackout profiles.
5. Run distributed small-group and concurrent-room tests after the lifecycle
   suite is trustworthy.
6. Use production observations to add a regression scenario for every confirmed
   incident before tuning thresholds or regions.
