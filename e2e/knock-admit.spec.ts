/**
 * Knock/admit flow E2E tests.
 *
 * These tests simulate the real guest path: a user with NO auth token joins a
 * room, triggers the knock-admit flow, and is admitted by the host.
 *
 * Why a separate file: all other specs use createCallContexts() which does a
 * fresh login per context. The guest here must be unauthenticated so the knock
 * path is exercised. Mixing auth/no-auth in one context is not possible.
 *
 * Media verification uses the three-layer trust model (see e2e/TESTING.md):
 * wire-level inbound stats, content-level pixel sampling, and audio RMS.
 */

import { type Page, type Browser, type BrowserContext } from '@playwright/test'
import { test, expect } from './fixtures'
import { createRoom, freshAuthState, fillName, joinRoom } from './helpers/call'
import {
  installPeerConnectionTracker,
  expectInboundMediaFlowing,
  expectRemoteVideoLive,
} from './helpers/webrtc'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates an authenticated host context with PC tracking installed. */
async function createHostContext(browser: Browser): Promise<BrowserContext> {
  const state = await freshAuthState()
  const ctx = await browser.newContext({
    permissions: ['camera', 'microphone'],
    baseURL: 'http://localhost:3000',
    storageState: state,
  })
  await ctx.addInitScript(installPeerConnectionTracker)
  return ctx
}

/** Creates an unauthenticated guest context — no cookies, no token. */
async function createGuestContext(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    permissions: ['camera', 'microphone'],
    baseURL: 'http://localhost:3000',
    // No storageState → no auth → will trigger knock flow
  })
  await ctx.addInitScript(installPeerConnectionTracker)
  return ctx
}

/** Navigate to the room as a guest and click Join (no auth). */
async function guestNavigate(page: Page, roomCode: string, name: string) {
  await page.goto(`/room/${roomCode}`, { waitUntil: 'domcontentloaded' })
  await fillName(page, name)
  await page.getByRole('button', { name: /join now/i }).click()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Knock/admit flow', () => {
  test('guest sees waiting overlay and host sees admit banner', async ({ browser }) => {
    const roomCode = await createRoom()
    const hostCtx = await createHostContext(browser)
    const guestCtx = await createGuestContext(browser)
    const hostPage = await hostCtx.newPage()
    const guestPage = await guestCtx.newPage()

    try {
      await joinRoom(hostPage, roomCode, 'Host')
      await guestNavigate(guestPage, roomCode, 'Guest')

      // Guest should see the waiting overlay
      await expect(guestPage.getByText(/waiting to be let in/i)).toBeVisible({ timeout: 10_000 })

      // Host should see the admit banner (not the guest tile)
      await expect(hostPage.getByText(/wants to join/i)).toBeVisible({ timeout: 10_000 })
      await expect(hostPage.getByRole('button', { name: /admit/i })).toBeVisible()

      // Host's participant count must still be 1 — the guest is in the knock
      // banner but NOT in the tile grid. Asserting on the participant chip
      // avoids false matches on the banner text (which contains the guest name).
      await expect(hostPage.getByText('1 participant', { exact: true })).toBeVisible()
    } finally {
      await hostCtx.close().catch(() => {})
      await guestCtx.close().catch(() => {})
    }
  })

  test('guest appears in host call after admission', async ({ browser }) => {
    const roomCode = await createRoom()
    const hostCtx = await createHostContext(browser)
    const guestCtx = await createGuestContext(browser)
    const hostPage = await hostCtx.newPage()
    const guestPage = await guestCtx.newPage()

    try {
      await joinRoom(hostPage, roomCode, 'Host')
      await guestNavigate(guestPage, roomCode, 'Guest')

      await expect(hostPage.getByText(/wants to join/i)).toBeVisible({ timeout: 10_000 })
      await hostPage.getByRole('button', { name: /admit/i }).click()

      // Guest overlay clears and guest enters the call
      await expect(guestPage.getByText(/waiting to be let in/i)).not.toBeVisible({ timeout: 10_000 })

      // Both pages must now show 2 participants. Asserts that peer-joined fired
      // (the post-admit broadcast) on both sides without depending on the host's
      // display name, which comes from the auth account, not the test fixture.
      await Promise.all([
        expect(guestPage.getByText('2 participants', { exact: true })).toBeVisible({ timeout: 15_000 }),
        expect(hostPage.getByText('2 participants', { exact: true })).toBeVisible({ timeout: 15_000 }),
      ])
    } finally {
      await hostCtx.close().catch(() => {})
      await guestCtx.close().catch(() => {})
    }
  })

  test('host camera before guest joins reaches guest after admission', async ({ browser }) => {
    test.setTimeout(60_000)
    const roomCode = await createRoom()
    const hostCtx = await createHostContext(browser)
    const guestCtx = await createGuestContext(browser)
    const hostPage = await hostCtx.newPage()
    const guestPage = await guestCtx.newPage()

    try {
      // Host joins with camera on
      await joinRoom(hostPage, roomCode, 'Host')
      await hostPage.getByRole('button', { name: /turn camera on/i }).click()
      await expect(hostPage.getByRole('button', { name: /turn camera off/i })).toBeVisible({ timeout: 5_000 })

      // Guest knocks
      await guestNavigate(guestPage, roomCode, 'Guest')
      await expect(guestPage.getByText(/waiting to be let in/i)).toBeVisible({ timeout: 10_000 })

      // Host admits
      await expect(hostPage.getByText(/wants to join/i)).toBeVisible({ timeout: 10_000 })
      await hostPage.getByRole('button', { name: /admit/i }).click()
      await expect(guestPage.getByText(/waiting to be let in/i)).not.toBeVisible({ timeout: 10_000 })

      // Guest must see Host's camera feed that was published before guest joined.
      // Video-only assertion — the host joins with mic off (the default per
      // callDefaults.getMicOn). The audio publish path is exercised by the
      // `unmuting after joining` test in sfu-tracks.spec.ts.
      await Promise.all([
        expectInboundMediaFlowing(guestPage, 'video'),
        expectRemoteVideoLive(guestPage),
      ])
    } finally {
      await hostCtx.close().catch(() => {})
      await guestCtx.close().catch(() => {})
    }
  })

  test('guest camera after admission reaches host', async ({ browser }) => {
    test.setTimeout(60_000)
    const roomCode = await createRoom()
    const hostCtx = await createHostContext(browser)
    const guestCtx = await createGuestContext(browser)
    const hostPage = await hostCtx.newPage()
    const guestPage = await guestCtx.newPage()

    try {
      await joinRoom(hostPage, roomCode, 'Host')
      await guestNavigate(guestPage, roomCode, 'Guest')

      await expect(hostPage.getByText(/wants to join/i)).toBeVisible({ timeout: 10_000 })
      await hostPage.getByRole('button', { name: /admit/i }).click()
      await expect(guestPage.getByText(/waiting to be let in/i)).not.toBeVisible({ timeout: 10_000 })
      await expect(guestPage.getByText('2 participants', { exact: true })).toBeVisible({ timeout: 15_000 })

      // Guest enables camera after being admitted — this is the regression scenario
      await guestPage.getByRole('button', { name: /turn camera on/i }).click()
      await expect(guestPage.getByRole('button', { name: /turn camera off/i })).toBeVisible({ timeout: 5_000 })

      // Host must see guest's camera. Three-layer verification — stats deltas
      // catch a stuck SFU subscribe, pixel content catches a frozen frame.
      await Promise.all([
        expectInboundMediaFlowing(hostPage, 'video'),
        expectRemoteVideoLive(hostPage),
      ])
    } finally {
      await hostCtx.close().catch(() => {})
      await guestCtx.close().catch(() => {})
    }
  })

  test('deny button dismisses knock banner without admitting', async ({ browser }) => {
    const roomCode = await createRoom()
    const hostCtx = await createHostContext(browser)
    const guestCtx = await createGuestContext(browser)
    const hostPage = await hostCtx.newPage()
    const guestPage = await guestCtx.newPage()

    try {
      await joinRoom(hostPage, roomCode, 'Host')
      await guestNavigate(guestPage, roomCode, 'Guest')

      await expect(hostPage.getByText(/wants to join/i)).toBeVisible({ timeout: 10_000 })
      await hostPage.getByRole('button', { name: /deny/i }).click()

      // Banner disappears
      await expect(hostPage.getByText(/wants to join/i)).not.toBeVisible()
      // Guest is still waiting (host did not admit)
      await expect(guestPage.getByText(/waiting to be let in/i)).toBeVisible()
    } finally {
      await hostCtx.close().catch(() => {})
      await guestCtx.close().catch(() => {})
    }
  })

  test('knock banner clears when guest disconnects before admission', async ({ browser }) => {
    const roomCode = await createRoom()
    const hostCtx = await createHostContext(browser)
    const guestCtx = await createGuestContext(browser)
    const hostPage = await hostCtx.newPage()
    const guestPage = await guestCtx.newPage()

    try {
      await joinRoom(hostPage, roomCode, 'Host')
      await guestNavigate(guestPage, roomCode, 'Guest')

      await expect(hostPage.getByText(/wants to join/i)).toBeVisible({ timeout: 10_000 })

      // Guest closes the tab (disconnects)
      await guestPage.close()

      // Host's banner should disappear
      await expect(hostPage.getByText(/wants to join/i)).not.toBeVisible({ timeout: 10_000 })
    } finally {
      await hostCtx.close().catch(() => {})
      await guestCtx.close().catch(() => {})
    }
  })
})
