/**
 * SFU media-flow tests — written TDD before the fixes land.
 *
 * Each scenario represents a real user path. Tests are ordered from the most
 * fundamental (can a single user publish at all?) to multi-user interactions.
 *
 * All tests intentionally avoid mocking the SFU — they hit the real Go server
 * and Cloudflare Realtime endpoint so regressions in the signaling path are
 * caught too.
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { createCallContexts, joinRoom, createRoom, fillName } from './helpers/call'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true once at least one non-black remote video frame is decoded. */
async function waitForRemoteVideo(page: Page, timeoutMs = 20_000) {
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('video')).some((video) => {
        if (
          video.muted ||
          video.paused ||
          video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
          video.videoWidth < 16 ||
          video.videoHeight < 16
        )
          return false
        const canvas = document.createElement('canvas')
        canvas.width = 8
        canvas.height = 8
        const ctx = canvas.getContext('2d')
        if (!ctx) return false
        ctx.drawImage(video, 0, 0, 8, 8)
        const d = ctx.getImageData(0, 0, 8, 8).data
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] > 8 || d[i + 1] > 8 || d[i + 2] > 8) return true
        }
        return false
      }),
    { timeout: timeoutMs },
  )
}

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
  await page.goto(`/${roomCode}`, { waitUntil: 'domcontentloaded' })
  // fillName polls until the Join button is enabled, ensuring React has committed
  // the onChange state update before camera enabling triggers re-renders.
  await fillName(page, name)
  await enableCamera(page)
  // Camera button should now show "off" state — camera is on
  await expect(page.getByRole('button', { name: /turn camera off/i })).toBeVisible({ timeout: 5_000 })
  await page.getByRole('button', { name: /join now/i }).click()
  await expect(page.getByRole('button', { name: /leave call/i })).toBeVisible({ timeout: 10_000 })
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

    await expect(alice.getByText('Bob')).toBeVisible({ timeout: 15_000 })
    await expect(bob.getByText('Alice')).toBeVisible({ timeout: 15_000 })

    // Both must decode real remote video from the other
    await Promise.all([waitForRemoteVideo(alice), waitForRemoteVideo(bob)])
  })

  // ── Bug 2 regression ──────────────────────────────────────────────────────
  // Late-joining peer never received an sfu-tracks broadcast because the server
  // only broadcasts on publish — never replays for new joiners.
  test('late joiner receives video from a peer who published before they joined', async () => {
    const room = await createRoom()
    const alice = await ctx1.newPage()
    const bob = await ctx2.newPage()

    // Alice joins and publishes tracks
    await joinWithCamera(alice, room, 'Alice')
    // Wait long enough for publish to complete and broadcast to settle
    await alice.waitForTimeout(3_000)

    // Bob joins after Alice has already published
    await joinRoom(bob, room, 'Bob')
    await expect(bob.getByText('Alice')).toBeVisible({ timeout: 15_000 })

    // Bob must receive Alice's already-published video without Alice doing anything
    await waitForRemoteVideo(bob)
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
    await expect(alice.getByText('Bob')).toBeVisible({ timeout: 15_000 })
    await expect(bob.getByText('Alice')).toBeVisible({ timeout: 15_000 })

    // Alice turns camera on during the call
    await enableCamera(alice)
    await expect(alice.getByRole('button', { name: /turn camera off/i })).toBeVisible({ timeout: 5_000 })

    // Bob must now receive Alice's video
    await waitForRemoteVideo(bob)
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
    await expect(alice.getByText('Bob')).toBeVisible({ timeout: 15_000 })

    await unmuteMic(alice)

    // Verify no SFU errors were logged (audio publish succeeded)
    const errors: string[] = []
    alice.on('console', (msg) => {
      if (msg.type() === 'error' && (msg.text().includes('sfu') || msg.text().includes('SFU')))
        errors.push(msg.text())
    })
    await alice.waitForTimeout(2_000)
    expect(errors).toHaveLength(0)

    // Bob's audio element should have a srcObject with audio tracks
    const hasAudio = await bob.evaluate(() => {
      const audios = Array.from(document.querySelectorAll('audio'))
      return audios.some((a) => {
        const tracks = (a.srcObject as MediaStream | null)?.getAudioTracks() ?? []
        return tracks.length > 0 && tracks[0].readyState === 'live'
      })
    })
    expect(hasAudio).toBe(true)
  })

  // ── Mixed join: one peer joins with cam on, other joins with cam off ──────
  test('peer with camera on is visible to peer who joined with camera off', async () => {
    const room = await createRoom()
    const alice = await ctx1.newPage()
    const bob = await ctx2.newPage()

    await joinWithCamera(alice, room, 'Alice')
    await joinRoom(bob, room, 'Bob')         // Bob joins with camera off

    await expect(bob.getByText('Alice')).toBeVisible({ timeout: 15_000 })

    // Bob must see Alice's camera without Bob having a camera
    await waitForRemoteVideo(bob)
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
    await expect(alice.getByText('Bob')).toBeVisible({ timeout: 15_000 })
    await waitForRemoteVideo(alice)

    // Bob leaves
    await bob.getByRole('button', { name: /leave/i }).click()
    await expect(alice.getByText('Bob')).not.toBeVisible({ timeout: 10_000 })

    // Bob rejoins with camera on
    await joinWithCamera(bob, room, 'Bob')
    await expect(alice.getByText('Bob')).toBeVisible({ timeout: 15_000 })

    // Alice must see Bob's video again
    await waitForRemoteVideo(alice)
  })
})
