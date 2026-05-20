/**
 * SFU media-flow tests — three-layer verification.
 *
 * Each scenario represents a real user path. Tests run from the most
 * fundamental (a single user can publish without error) to multi-user
 * interactions including the regression-prone late-joiner replay path.
 *
 * Why the three-layer model? See e2e/TESTING.md. Briefly: previous canvas-only
 * assertions passed for known bugs (frozen frame, stuck decoder, silent audio
 * track) because they only proved "some non-black pixel exists." We now check:
 *   1. Wire — inbound stats are growing (expectInboundMediaFlowing)
 *   2. Content — non-black AND non-frozen frames (expectRemoteVideoLive)
 *   3. Audio — RMS above noise floor (expectRemoteAudioAudible)
 *
 * Why participant-count instead of name-based assertions? createCallContexts()
 * logs both contexts in as the same e2e account, so the auth-derived display
 * name is identical on both peers. The participant count chip in the header
 * is the authoritative user-visible signal that doesn't depend on name.
 */

import { type Page, type BrowserContext } from '@playwright/test'
import { test, expect } from './fixtures'
import { createCallContexts, joinRoom, createRoom, fillName } from './helpers/call'
import {
  expectInboundMediaFlowing,
  expectRemoteVideoLive,
  expectRemoteAudioAudible,
} from './helpers/webrtc'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Enables the camera in the pre-join or in-call screen. */
async function enableCamera(page: Page) {
  const btn = page.getByRole('button', { name: /turn camera on/i })
  if (await btn.isVisible().catch(() => false)) {
    await btn.click()
  }
}

/** Enables the microphone in the in-call screen. */
async function unmuteMic(page: Page) {
  const btn = page.getByRole('button', { name: /unmute/i })
  if (await btn.isVisible().catch(() => false)) {
    await btn.click()
  }
}

/** Joins the room from the pre-join screen *with* camera enabled before clicking Join. */
async function joinWithCamera(page: Page, roomCode: string, name: string) {
  await page.goto(`/room/${roomCode}`, { waitUntil: 'domcontentloaded' })
  // fillName polls until the Join button is enabled, ensuring React has committed
  // the onChange state update before camera enabling triggers re-renders.
  await fillName(page, name)
  await enableCamera(page)
  // Camera button should now show "off" state — camera is on
  await expect(page.getByRole('button', { name: /turn camera off/i })).toBeVisible({ timeout: 5_000 })
  await page.getByRole('button', { name: /join now/i }).click()
  await expect(page.getByRole('button', { name: /leave call/i })).toBeVisible({ timeout: 10_000 })
}

/** Asserts both peers see each other (participant count = 2 on both pages). */
async function expectBothSeeEachOther(a: Page, b: Page, timeout = 15_000) {
  await Promise.all([
    expect(a.getByText('2 participants', { exact: true })).toBeVisible({ timeout }),
    expect(b.getByText('2 participants', { exact: true })).toBeVisible({ timeout }),
  ])
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('SFU track publishing and subscription', () => {
  let ctx1: BrowserContext
  let ctx2: BrowserContext

  test.beforeEach(async ({ browser }) => {
    ;({ ctx1, ctx2 } = await createCallContexts(browser))
  })

  test.afterEach(async () => {
    await ctx1.close().catch(() => {})
    await ctx2.close().catch(() => {})
  })

  // ── Bug 1 regression ──────────────────────────────────────────────────────
  // CF returns 406 "Missing location for track" when `location` is omitted.
  // This test proves publish succeeds end-to-end (no console errors).
  test('publishing local tracks does not throw a CF error', async () => {
    const room = await createRoom()
    const alice = await ctx1.newPage()
    const errors: string[] = []
    alice.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('sfu')) errors.push(msg.text())
    })

    await joinWithCamera(alice, room, 'Alice')
    // Give the SFU publish a moment to complete
    await alice.waitForTimeout(2_000)

    expect(errors).toHaveLength(0)
  })

  // ── Core two-peer scenario: both join with cameras on ────────────────────
  test('both users join with cameras on and see each other', async () => {
    const room = await createRoom()
    const alice = await ctx1.newPage()
    const bob = await ctx2.newPage()

    await joinWithCamera(alice, room, 'Alice')
    await joinWithCamera(bob, room, 'Bob')

    await expectBothSeeEachOther(alice, bob)

    // Both peers must decode real, non-frozen remote video AND have growing
    // inbound stats. Both layers together rule out: black sender, stuck
    // decoder, SFU subscribe returning 200 but pulling nothing.
    await Promise.all([
      expectInboundMediaFlowing(alice, 'video'),
      expectInboundMediaFlowing(bob, 'video'),
      expectRemoteVideoLive(alice),
      expectRemoteVideoLive(bob),
    ])
  })

  // ── Bug 2 regression — THE late-joiner path ───────────────────────────────
  // The user-reported bug: "video streaming to peers joined earlier than you
  // not working". Server replays each existing peer's published SFU tracks to
  // a new joiner in hub.join. The new joiner buffers them until setSfuSession
  // and then subscribes. If any link in that chain breaks, late joiners see
  // nothing.
  test('late joiner receives video from a peer who published before they joined', async () => {
    const room = await createRoom()
    const alice = await ctx1.newPage()
    const bob = await ctx2.newPage()

    // Alice joins and publishes tracks
    await joinWithCamera(alice, room, 'Alice')
    // Wait long enough for publish to complete and broadcast to settle
    await alice.waitForTimeout(3_000)

    // Bob joins after Alice has already published. Bob has no camera on so
    // the only video flow that matters is Alice → Bob via the join replay.
    await joinRoom(bob, room, 'Bob')
    await expectBothSeeEachOther(alice, bob)

    // Bob must receive Alice's already-published video without Alice doing
    // anything. Three-layer verification — stats prove the subscribe actually
    // pulled bytes; pixel content proves the decoder produced live frames.
    await Promise.all([
      expectInboundMediaFlowing(bob, 'video'),
      expectRemoteVideoLive(bob),
    ])
  })

  // ── Idle host → late guest with camera (stale subscribe-session regression) ─
  // User-reported bug after the May 19-20 changes: when the host sits alone in
  // the room for a long time and a guest joins later with their camera on, the
  // host cannot see the guest's video. CF returns 410 "Session appears to be
  // disconnected" on tracks/new because the host's subscribe-side CF session
  // was created upfront, never had a transceiver attached, and got reaped by
  // CF after the idle window.
  //
  // The fix is in sfu-session.ts: the subTracks PartyTracks instance is no
  // longer subscribed to in the constructor. Its session$ stays cold (no
  // /sessions/new POST, no PC) until the first .subscribe() call.
  //
  // This test asserts the lazy-init holds: it makes the host idle for long
  // enough that the OLD eager-init code path would fail, then verifies that
  // host→guest video still works end-to-end.
  test('host alone idle, guest joins later with camera, host sees video', async () => {
    test.setTimeout(90_000)
    const room = await createRoom()
    const host = await ctx1.newPage()
    const guest = await ctx2.newPage()

    // Host joins with no camera or mic — this is the "alone in room" state
    // that previously created a cold subscribe session.
    await joinRoom(host, room, 'Host')
    await expect(host.getByText('1 participant', { exact: true })).toBeVisible({ timeout: 10_000 })

    // Idle window. 15s is long enough to expose the regression without making
    // the suite slow; CF reaps unestablished sessions much faster than that
    // in practice. Reproduces the user's manual scenario where the host opens
    // the room and waits for a guest to arrive.
    await host.waitForTimeout(15_000)

    // Guest joins WITH camera on. Host's subscribe path must now activate
    // for the first time and pull the guest's tracks.
    await joinWithCamera(guest, room, 'Guest')
    await expectBothSeeEachOther(host, guest)

    // The actual assertion that catches the 410: stats must grow + pixels must
    // be live on the host's side. With the old code path, inbound stats stayed
    // at zero because tracks/new returned 410.
    await Promise.all([
      expectInboundMediaFlowing(host, 'video'),
      expectRemoteVideoLive(host),
    ])
  })

  // ── Bug 3a regression: enabling camera after joining ─────────────────────
  // When a user joins with camera off, no video sender is created.
  // Enabling camera later must publish the track to CF (not silently no-op).
  test('enabling camera after joining sends video to the other peer', async () => {
    const room = await createRoom()
    const alice = await ctx1.newPage()
    const bob = await ctx2.newPage()

    // Both join with cameras off
    await joinRoom(alice, room, 'Alice')
    await joinRoom(bob, room, 'Bob')
    await expectBothSeeEachOther(alice, bob)

    // Alice turns camera on during the call
    await enableCamera(alice)
    await expect(alice.getByRole('button', { name: /turn camera off/i })).toBeVisible({ timeout: 5_000 })

    // Bob must now receive Alice's video — three-layer verification.
    await Promise.all([
      expectInboundMediaFlowing(bob, 'video'),
      expectRemoteVideoLive(bob),
    ])
  })

  // ── Bug 3b regression: enabling mic after joining ─────────────────────────
  // Same as 3a but for audio — no audio sender exists when user joins muted.
  // Unmuting must add an audio track to the SFU session, not silently skip.
  test('unmuting after joining with mic off sends audio to the other peer', async () => {
    const room = await createRoom()
    const alice = await ctx1.newPage()
    const bob = await ctx2.newPage()

    await joinRoom(alice, room, 'Alice')
    await joinRoom(bob, room, 'Bob')
    await expectBothSeeEachOther(alice, bob)

    await unmuteMic(alice)

    // Three-layer audio verification: stats growing + audible RMS. The audible
    // check is what catches "track is 'live' but publisher ended it" or
    // track.enabled=false bugs — the previous track-existence check missed both.
    await Promise.all([
      expectInboundMediaFlowing(bob, 'audio'),
      expectRemoteAudioAudible(bob),
    ])
  })

  // ── Mixed join: one peer joins with cam on, other joins with cam off ──────
  test('peer with camera on is visible to peer who joined with camera off', async () => {
    const room = await createRoom()
    const alice = await ctx1.newPage()
    const bob = await ctx2.newPage()

    await joinWithCamera(alice, room, 'Alice')
    await joinRoom(bob, room, 'Bob')         // Bob joins with camera off

    await expectBothSeeEachOther(alice, bob)

    // Bob must see Alice's camera without Bob having a camera
    await Promise.all([
      expectInboundMediaFlowing(bob, 'video'),
      expectRemoteVideoLive(bob),
    ])
  })

  // ── Tracks survive a participant leaving and rejoining ────────────────────
  // Two full page-loads + SFU re-publish + video decode exceeds the 30 s default.
  test('video still flows after the remote peer leaves and rejoins', async () => {
    test.setTimeout(60_000)
    const room = await createRoom()
    const alice = await ctx1.newPage()
    const bob = await ctx2.newPage()

    await joinWithCamera(alice, room, 'Alice')
    await joinWithCamera(bob, room, 'Bob')
    await expectBothSeeEachOther(alice, bob)
    await Promise.all([
      expectInboundMediaFlowing(alice, 'video'),
      expectRemoteVideoLive(alice),
    ])

    // Bob leaves
    await bob.getByRole('button', { name: /leave/i }).click()
    await expect(alice.getByText('1 participant', { exact: true })).toBeVisible({ timeout: 10_000 })

    // Bob rejoins with camera on
    await joinWithCamera(bob, room, 'Bob')
    await expectBothSeeEachOther(alice, bob)

    // Alice must see Bob's video again
    await Promise.all([
      expectInboundMediaFlowing(alice, 'video'),
      expectRemoteVideoLive(alice),
    ])
  })
})
