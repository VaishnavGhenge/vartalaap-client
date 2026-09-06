# Staging call lab

The staging API runs in the `sessionly-api` Railway project, in the `staging`
environment, with its own Postgres service and Cloudflare Realtime credentials.

API base URL:

`https://sessionly-api-staging.up.railway.app`

Health check:

`https://sessionly-api-staging.up.railway.app/healthz`

## Vercel Preview configuration

Keep the web application on Vercel. In the Vercel project linked to this
repository, set these variables for the **Preview** environment:

```text
NEXT_PUBLIC_SERVER_DOMAIN=sessionly-api-staging.up.railway.app
NEXT_PUBLIC_SERVER_SECURE=true
```

Redeploy the Preview after changing them. The Railway API's
`ALLOWED_ORIGINS` must include the exact Vercel Preview hostname used for the
test. Do not use `*`: the API uses credentialed cookies.

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
E2E_BASE_URL=https://vartalaap-client-odu10rkpz-vaishnavghenges-projects.vercel.app \
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

The accidental `vartalaap-staging-server` Railway project is not part of this
setup and should be removed after explicit confirmation; this staging API is
inside the existing `sessionly-api` project.
