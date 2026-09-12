# Staging call lab

The full gap analysis, failure matrix, required measurements, and production
release gates are in [Real-call reliability and scale gaps](real-call-reliability-gaps.md).

The staging API runs in the `sessionly-api` Railway project, in the `staging`
environment, with its own Postgres service and Cloudflare Realtime credentials.

API base URL:

`https://sessionly-api-staging.up.railway.app`

Stable web URL:

`https://vartalaap-staging.vercel.app`

Health check:

`https://sessionly-api-staging.up.railway.app/healthz`

## Vercel Preview configuration

Keep the web application on Vercel. In the Vercel project linked to this
repository, set these variables for the **Preview** environment:

```text
NEXT_PUBLIC_SERVER_DOMAIN=sessionly-api-staging.up.railway.app
NEXT_PUBLIC_SERVER_SECURE=true
```

Redeploy the Preview after changing them and point the stable
`vartalaap-staging.vercel.app` alias at that deployment. Railway staging uses
that stable hostname for `ALLOWED_ORIGINS` and `PUBLIC_APP_URL`; do not replace
it with each generated preview hostname and do not use `*` because the API uses
credentialed cookies.

## First real-call check

1. Open the same Vercel Preview URL in two separate browser profiles or
   devices.
2. Create one meeting and join as two people, with camera and microphone on.
3. Confirm both sides receive moving video and audible audio for two minutes.
4. Toggle camera and microphone independently, then leave and rejoin.
5. Record the observed join time, freezes, audio gaps, reconnect time, and
   browser/device/network used.

The acceptance questions are intentionally product decisions:

- Does conversation remain understandable when one participant has a weak
  connection?
- Is a reduced or held camera state understandable rather than surprising?
- How long is an acceptable recovery after a short network interruption?
- At eight to ten people, should all videos remain visible or should the UI
  focus on the active speaker?

## Automated baseline

From this directory, the remote staging run is:

```bash
E2E_BASE_URL=https://vartalaap-staging.vercel.app \
NEXT_PUBLIC_SERVER_DOMAIN=sessionly-api-staging.up.railway.app \
NEXT_PUBLIC_SERVER_SECURE=true \
npm run test:e2e -- sfu-tracks.spec.ts
```

Those tests use fake camera/microphone streams and verify RTP growth, decoded
frames, and audible audio. They validate regressions but are not a substitute
for a real-device call.

The remote run currently covers eight SFU scenarios: initial publish, two-way
camera, late join, idle host, camera enable, microphone enable, mixed camera
state, and leave/rejoin. A passing run proves the deployed path works with
Chromium and synthetic media; it does not prove Safari, mobile hardware,
Bluetooth audio, echo cancellation, or poor-network quality.

For the call lab, capture browser metrics without putting room IDs or user IDs
into Prometheus labels. The useful aggregates are connection success, time to
first media, p95/p99 RTT, freeze duration, reconnect success, and browser CPU.

## Practical Call Lab

The Call Lab runs two independent authenticated browser contexts through the
real signaling server and Cloudflare SFU. It verifies RTP byte growth, decoded
frames, changing video pixels, and remote audio energy before and after each
fault. During the soak it fails on the first sampling window where audio bytes,
video bytes, or decoded frames stop advancing. Every scenario attaches a JSON
timeline named `call-lab-report` to the Playwright result.

```bash
CALL_LAB_SOAK_MS=60000 npm run test:call-lab
```

The default profiles are:

- `baseline`: uninterrupted two-person call and continuous media soak.
- `control-delay`: delays the first four SFU HTTP operations by two seconds.
- `network-outage`: takes one browser fully offline for three seconds and
  requires bidirectional media recovery without rejoining.
- `media-controls`: camera off/on, microphone mute/unmute, screen share, screen
  stop, and camera restoration while the other participant verifies live RTP.

Select profiles and tune the observation windows with environment variables:

```bash
CALL_LAB_PROFILES=network-outage,media-controls \
CALL_LAB_SOAK_MS=900000 \
CALL_LAB_SAMPLE_MS=5000 \
npm run test:call-lab
```

Run it against staging by adding the same `E2E_BASE_URL` and
`NEXT_PUBLIC_SERVER_*` variables used by the automated baseline. The JSON
artifact records the test-run ID, profile, impairment timestamps, media deltas,
browser warnings/errors, failed requests, and cleanup outcome.

This harness is intentionally honest about its boundary: Playwright's offline
mode interrupts the entire browser network stack; it does not independently
shape WebRTC UDP loss, jitter, or bandwidth. Those profiles still require a
Linux `tc netem` runner or physical network emulator outside the browser.

## Ten-participant automated test

```bash
E2E_CAPACITY=true \
E2E_BASE_URL=https://vartalaap-staging.vercel.app \
NEXT_PUBLIC_SERVER_DOMAIN=sessionly-api-staging.up.railway.app \
NEXT_PUBLIC_SERVER_SECURE=true \
npm run test:e2e -- call-capacity.spec.ts --reporter=line,html
```

This opt-in test ramps to eight, then ten browser contexts, samples every
expected incoming video and audio stream, sustains ten participants for at
least one minute, and checks leave/rejoin. Video must have growing received
bytes and decoded frames; audio must have growing bytes and audio energy.
The test closes its contexts on success or failure. It creates a staging
meeting and uses the existing E2E account; meeting metadata is not deleted.

Use the HTML reporter to retain the `capacity-report` attachment, including
sample checkpoints, host load averages, free memory, and SFU HTTP failures.
Do not publish reports without reviewing them for staging identifiers.

This is one room, one machine/network, synthetic camera/microphone, and ten
sessions for the same test account. It tests concurrent media routing, not
ten physical devices, distinct-user authorization, mobile/ Safari behavior,
continuous absence of freezes, perceptual audio quality, or WAN impairments.

The three-second sampling windows can miss stalls between checkpoints.

The server's `node deploy/monitoring/verify.mjs --require-media --call-summary`
prints recent Prometheus quality estimates. Its five-minute aggregate window
is not scoped to a room and can contain other staging traffic.

The accidental `vartalaap-staging-server` Railway project is not part of this
setup and should be removed after explicit confirmation; this staging API is
inside the existing `sessionly-api` project.
