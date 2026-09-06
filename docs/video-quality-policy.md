# Video quality policy

This is an initial, testable product policy, not evidence that call quality is
subscription-ready. It supplements the browser's congestion control; it does
not replace it or change the SFU architecture.

## Current behavior

The publisher starts with a 900 kbps / 24 fps video ceiling. Sustained uplink
pressure reduces it to 500 kbps / 20 fps and then 200 kbps / 15 fps, scaling
capture dimensions by 1.5 and 2 respectively. These are ceilings, not guaranteed
delivered quality. Parameters use the [WebRTC sender API](https://www.w3.org/TR/webrtc/).

Each reduction requires six seconds of consecutive valid observations: RTT at
least 500 ms or estimated bandwidth below 80% of the current video budget plus
an 80 kbps allowance. At the lowest level, six seconds of severe pressure
(RTT at least one second or bandwidth below 150 kbps) pauses video only if the
microphone is enabled. Muting the microphone restores video at the lowest level.
This checks user intent, not whether the remote listener actually receives audio.

Twenty seconds of healthy observations restores one step at a time. Healthy
means RTT below 250 ms and sufficient estimated bandwidth for the next level;
when bandwidth estimates are unavailable, recovery uses RTT alone. Missing,
stale, or widely spaced samples break consecutive observation runs.

The UI reports reduced or paused video, and peers receive the held state so
they show an avatar instead of a frozen frame. Failed parameter changes retain
the last applied state, report to Sentry, and retry with backoff. Intentional
holds must not trigger the stalled-media repair path.

## Decisions you can own

- Decide whether automatic audio-first mode suits your customers, especially
  screen sharing. The current policy also affects the published screen track.
- Tune profiles and timing in `src/services/webrtc/video-quality.ts`, adding
  examples to its controller tests before changing behavior.
- Define an acceptable call: join-time target, freeze duration, recovery time,
  and smallest useful screen-share text. Measure before promising an SLA.

## Verification and remaining evidence

Unit tests exercise sustained pressure, recovery, missing measurements,
parameter rejection, and intentional holds. Run `npm test`.
`node scripts/test-video-encoding.cjs` uses a local Chromium peer pair to verify
actual frame delivery, resolution limits, and continuing audio through holds.
It does not exercise Cloudflare, the entire application, real network shaping,
Safari, or Firefox.

Next measurement work should distinguish signaling/server metrics (Prometheus
and Grafana) from browser media quality. Use bounded metric labels, never room
IDs or participant IDs. Load-test signaling separately from real browser calls;
HTTP throughput alone cannot validate media quality. Decide room-size and
concurrency targets before evaluating architecture changes.
