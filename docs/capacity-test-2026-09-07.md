# Staging capacity test — 2026-09-07

Result: passed in approximately 2.4 minutes against the existing Vercel staging
preview, Railway staging API, and Cloudflare SFU. No production deploy was made.

| Checkpoint | Participants | Flowing remote video per browser | Flowing remote audio per browser |
|---|---:|---:|---:|
| Initial ramp | 8 | 7 | 7 |
| Two late joiners | 10 | 9 | 9 |
| Three sustained-call checkpoints | 10 | 9 | 9 |
| One participant leaves | 9 | 8 | 8 |
| Participant rejoins | 10 | 9 | 9 |

Every browser passed each checkpoint. Assertions require received-byte growth,
decoded-frame growth for video, and received-audio-energy growth for audio.
The sustained phase lasted at least one minute. All contexts were closed at
the end. TypeScript checking also passed.

Prometheus estimates over the surrounding five-minute window:

| Observation | Value |
|---|---:|
| Peak connected participants | 10 |
| First-media p95 | ~8.9 s |
| Browser RTT p99 | ~47 ms |
| Packet-loss p95 | 0% |
| Jitter p95 | ~396 ms |

The first-media p95 exceeds the repository's 3-second target. The slow-setup
alert was pending. High jitter deserves investigation even though all sampled
streams flowed. Histograms produce bucket-interpolated estimates; this small
run cannot establish a production SLO. First-media currently measures remote
track arrival, not first rendered frame. Jitter uses the maximum RTP jitter
among streams in each stats source; it is not an audio-only measurement.

Ten contexts shared one machine, network, Chromium process, and test account.
CPU scheduling/encoding contention could contribute to jitter and setup time;
this run does not establish the cause. Do not interpret the result as a
distributed capacity benchmark or proof of subscription-quality calls.
The initial run used the list reporter; its JSON attachment was not persisted.
Use the documented HTML-reporter command for subsequent runs to retain host
load and per-checkpoint evidence.

## Controlled comparison

Follow-up runs retained their raw JSON reports and used the same staging web,
API, and SFU:

| Shape | Track correctness | Audio jitter p95 | Video jitter p95 | First-media p95 | Generator CPU busy |
|---|---|---:|---:|---:|---:|
| 2 browsers, one laptop | passed | 3 ms | 5 ms | 7.38 s | 88.2% |
| 10 browsers, one laptop | passed | 8 ms | 307 ms | 7.37 s | 88.6% |
| 10 browsers, split 5 local + 5 Railway | passed | 3 ms local / 3 ms remote | 6 ms local / 5 ms remote | 8.35 s local | 50.5% local |

The distributed run held all ten callers in one shared room for three
checkpoints. Every one of the ten browsers received nine flowing video and nine
flowing audio tracks at every checkpoint. Splitting the callers removed the
large video-jitter spike, so the 307 ms observation was caused by contention on
the single load-generator machine. It is not evidence that the SFU reached its
capacity at ten participants.

First-media remained slow in both the 2- and 10-browser local runs, so it does
not correlate with room size. The SFU HTTP p95 was 1.63 s in the two-browser
run, 1.99 s in the single-host ten-browser run, and 2.15 s on the local half of
the distributed run. The API and Cloudflare control plane are reached over a
long geographic path from the local caller, making setup latency the next
performance target.

The first-media instrumentation also had a correctness defect: when the host
joined an empty room and a guest arrived before the original 10-second timer
expired, the host's measurement included time spent alone. The client now
closes that initial timer on an empty/muted joined snapshot, starts a fresh
window when a publishing peer appears, and emits the matching `first_media`
setup-phase observation. A regression test covers the solo-host timing case.

The corrected client was deployed to the stable staging URL and the
two-browser test passed again in 1.7 minutes. Both directions had live audio
and video through three soak checkpoints and after leave/rejoin. First-media
observations were 4.64 s, 5.27 s, and 3.53 s after rejoin (p95 5.27 s), video
jitter p95 was 2 ms, audio jitter p95 was 1 ms, generator CPU busy was 16%, and
no SFU HTTP request failed. This confirms the false solo-wait inflation is
fixed, while also confirming that real setup latency still misses the 3-second
target and needs phase-level diagnosis.

Next: deploy the corrected instrumentation to staging and rerun a two-party
call from two geographic locations. Then break setup into signaling, ICE,
publish-connect, subscribe-connect, and first-render phases. Add genuine network
impairment at the media transport layer; HTTP throttling alone is not a WebRTC
bandwidth test.
