# E2E testing — strategy and patterns

A practical guide to writing video-calling tests that actually catch regressions, instead of giving a green check while remote video silently breaks.

---

## The problem these tests have to solve

Every previous regression in this app — peer-joined-before-admit, the SFU race after `setIsKnocking(false)`, the late-joiner sfu-tracks bug — passed the existing test suite. The tests asserted that the UI rendered, not that media flowed. We need tests that fail when a real user would see a black tile, hear silence, or see the wrong person's video.

The three classes of bug we keep shipping:

1. **Streaming silently breaks** — UI renders, `srcObject` is set, but no decoded frames arrive.
2. **Negotiation flaps** — ICE reconnects mid-toggle, briefly drops media. Stats look fine afterwards.
3. **Mis-routing** — Alice's track gets attached to Bob's tile. Both tiles show *something*, both tests pass.

A passing test must prove **all three** layers are healthy.

---

## The three-layer trust model

| Layer | What it proves | What it catches |
|---|---|---|
| **Wire** — `RTCPeerConnection.getStats()` delta over ~2s: `bytesReceived`, `packetsReceived`, `framesDecoded` all *growing* | The decoder is actively producing frames, not just receiving keepalive bytes | SFU subscribe returned 200 but no actual pull matched; codec mismatch; SRTP key error; encoder silently muted by browser |
| **Content** — canvas mean + variance on the `<video>` element | Pixels are not black AND not solid-coloured | `replaceTrack(null)` left a black sender; stats grow but decoder stuck; frozen frame (mean passes but variance flat) |
| **Audio** — `AudioContext` + `AnalyserNode` RMS on the remote stream | Audible energy above noise floor | Track is "live" but publisher ended it; SFU forwards silence; track.enabled = false slipped through |

**`iceConnectionState === 'connected'` and even non-zero `bytesReceived` can look healthy while the picture is black or audio is silent.** Wire-level signal without content-level sampling is a false positive.

---

## Using the helpers

The three helpers live in `e2e/helpers/webrtc.ts`. Each one polls until the condition holds or throws on timeout — they're meant to be called after the UI says "connected".

```ts
import { test } from './fixtures'           // <-- not from '@playwright/test'
import { expectInboundMediaFlowing,
         expectRemoteVideoLive,
         expectRemoteAudioAudible } from './helpers/webrtc'

test('two-user call: media actually flows', async ({ browser }) => {
  // ... join two pages ...
  await expect(alice.getByText('Bob')).toBeVisible()
  await expect(bob.getByText('Alice')).toBeVisible()

  // All three layers, on both sides.
  await Promise.all([
    expectInboundMediaFlowing(alice, 'video'),
    expectInboundMediaFlowing(alice, 'audio'),
    expectRemoteVideoLive(alice),
    expectRemoteAudioAudible(alice),
    expectInboundMediaFlowing(bob, 'video'),
    expectInboundMediaFlowing(bob, 'audio'),
    expectRemoteVideoLive(bob),
    expectRemoteAudioAudible(bob),
  ])
})
```

### Why `import { test } from './fixtures'`

`fixtures.ts` extends Playwright's base `test` with a context-level `addInitScript` that wires `window.__pcs = Set<RTCPeerConnection>` into every page. The helpers read from `window.__pcs` to call `getStats()` across every active peer connection — no app changes required.

Specs that don't need the helpers can keep importing from `@playwright/test`, but new specs and any spec asserting media should use `./fixtures`.

### When each helper is enough on its own

- Pure UI nav (join screen, button enabled/disabled): no helper needed.
- Local camera/mic state (button toggles): no helper needed.
- "Did media reach the other peer?": **all three** helpers, on the receiving side.
- "Did camera toggle without dropping the call?": the helpers + flap-counter init script (TODO, see roadmap).

---

## Common pitfalls

**Calling helpers too early.** Stats only grow once the SFU subscription has pulled the first packet. Always `await expect(remoteTile).toBeVisible()` first, then call the helpers.

**Asserting absolute byte counts.** Don't. Bytes can be non-zero from a single keepalive frame. The helpers assert *delta over time*, which is what proves the stream is alive *now*.

**Treating canvas pixel checks as proof of liveness.** A frozen frame passes a "non-black" check. `expectRemoteVideoLive` additionally requires variance > threshold to rule out a single solid colour.

**Forgetting audio.** A test that only checks video misses half the bugs. Every spec that lands a peer in a call should assert audio flow too, even if the test is "about" video.

---

## The roadmap

Landed in this PR (step 1):
- `e2e/helpers/webrtc.ts` — three helpers + `exposePeerConnections` init script
- `e2e/fixtures.ts` — extended `test` that auto-installs the init script
- `knock-admit.spec.ts` and `sfu-tracks.spec.ts` migrated to the helpers

Next, in order of leverage:

1. **Per-participant Y4M fixtures** — different fake-camera content per browser launch (Alice=red, Bob=blue) so mis-routing fails the colour assertion. Requires switching multi-peer specs from `browser.newContext()` to `chromium.launch()` per participant — launch args are browser-process scoped, not context-scoped.
2. **Audio frequency assertion** — replace fake audio with distinct sine waves (Alice=440 Hz, Bob=880 Hz). Assert the dominant frequency at the receiver matches expected. Catches audio mis-routing.
3. **Migrate `call-features.spec.ts`** (screen share) — today asserts only button text. Replace with `expectRemoteVideoLive` on the screen-share tile + inbound resolution assertion (frameWidth > 1024).
4. **Migrate `camera-flip.spec.ts`** — today verifies constraints reached a stub. Replace with `expectRemoteVideoLive` + colour assertion (front camera → red Y4M, back camera → green Y4M).
5. **Toggle stability spec** — wrap camera/mic toggles in an ICE/connection flap counter (init script). Assert zero flaps across the toggle AND media still flowing after. This is the class of bug that has burned us most.
6. **3-peer mesh spec** — exercise the `remoteSessionToPeer` routing map under N > 2. Without this, any routing bug for N=3 ships.
7. **Noise suppression / blur** — currently zero E2E coverage. Add specs that toggle the processor and assert audio RMS / video variance reflect the change.
8. **CDP network throttling** — exercise SLO ceilings (TTFM p95 ≤ 3s under 5% loss, 200ms RTT). Note: Chromium's `Network.emulateNetworkConditions` historically did not affect UDP; use WebRTC-aware CDP params.

---

## References

- [discuss-webrtc: best way to determine WebRTC media is flowing](https://groups.google.com/g/discuss-webrtc/c/6I-F-qSVIeU)
- [BlogGeek.me: Making sense of getStats in WebRTC](https://bloggeek.me/getstats/)
- [MDN: RTCInboundRtpStreamStats](https://developer.mozilla.org/en-US/docs/Web/API/RTCInboundRtpStreamStats)
- [w3c/webrtc-pc #957: silent/black frames on muted track](https://github.com/w3c/webrtc-pc/issues/957)
- [Chromium 552399: CDP throttling vs WebRTC](https://bugs.chromium.org/p/chromium/issues/detail?id=552399)
