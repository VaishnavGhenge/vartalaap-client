/**
 * Multi-peer call scenarios — N > 2 participants, three-layer media verification.
 *
 * This file covers item 6 in the e2e/TESTING.md roadmap: "3-peer mesh spec —
 * exercise the remoteSessionToPeer routing map under N > 2. Without this, any
 * routing bug for N=3 ships."
 *
 * Critical regression captured here: when a third peer joins a call, video
 * stops flowing for ALL participants — not just the newcomer. The SFU subscribe
 * session can silently reset or fail to pull additional tracks when a new pull
 * is added to the same subTracks instance. These tests FAIL until that is fixed.
 *
 * Tests are ordered from most regression-prone (two-peer video breaks when
 * third joins) through to sequential four-peer joins.
 */

import { type BrowserContext, type Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { createNCallContexts, createRoom, fillName, joinRoom } from './helpers/call'
import {
  expectInboundMediaFlowing,
  expectRemoteVideoLive,
} from './helpers/webrtc'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function enableCamera(page: Page) {
  const btn = page.getByRole('button', { name: /turn camera on/i })
  if (await btn.isVisible().catch(() => false)) await btn.click()
}

async function joinWithCamera(page: Page, roomCode: string, name: string) {
  await page.goto(`/room/${roomCode}`, { waitUntil: 'domcontentloaded' })
  await fillName(page, name)
  await enableCamera(page)
  await expect(page.getByRole('button', { name: /turn camera off/i })).toBeVisible({ timeout: 5_000 })
  await page.getByRole('button', { name: /join now/i }).click()
  await expect(page.getByRole('button', { name: /leave call/i })).toBeVisible({ timeout: 10_000 })
}

async function expectParticipantCount(pages: Page[], count: number, timeout = 15_000) {
  const label = count === 1 ? '1 participant' : `${count} participants`
  await Promise.all(pages.map((p) => expect(p.getByText(label, { exact: true })).toBeVisible({ timeout })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Multi-peer call — 3+ participants', () => {
  // ── Primary regression: existing two-peer video breaks when third joins ────
  // User-reported bug: "when third peer joins the video again doesn't work."
  // Alice and Bob have a healthy two-peer call; Carol joins. With the bug,
  // inbound video stats stop growing on all three pages — not just Carol's.
  // Three-layer verification proves the streams are alive after the join.
  test('existing two-peer video stays live after third peer joins', async ({ browser }) => {
    test.setTimeout(90_000)
    const [ctx1, ctx2, ctx3] = await createNCallContexts(browser, 3)
    const room = await createRoom()
    const alice = await ctx1.newPage()
    const bob = await ctx2.newPage()
    const carol = await ctx3.newPage()

    try {
      await test.step('Alice and Bob join with cameras on', async () => {
        await joinWithCamera(alice, room, 'Alice')
        await joinWithCamera(bob, room, 'Bob')
        await expectParticipantCount([alice, bob], 2)
      })

      await test.step('two-peer video is confirmed flowing before third joins', async () => {
        // Verify both peers have healthy inbound stats — a baseline that proves
        // the two-peer path works. If this step fails, the test environment is
        // broken, not the three-peer path.
        await Promise.all([
          expectInboundMediaFlowing(alice, 'video'),
          expectInboundMediaFlowing(bob, 'video'),
        ])
      })

      await test.step('Carol joins with camera on', async () => {
        await joinWithCamera(carol, room, 'Carol')
        await expectParticipantCount([alice, bob, carol], 3)
      })

      await test.step('all three participants have live inbound video after Carol joins', async () => {
        // Alice and Bob must STILL have growing inbound stats — the regression
        // is that their existing pulls silently fail when Carol's new pull is
        // added to the shared subTracks PartyTracks instance.
        // Carol must also receive video from both Alice and Bob.
        await Promise.all([
          expectInboundMediaFlowing(alice, 'video', { timeoutMs: 20_000 }),
          expectInboundMediaFlowing(bob, 'video', { timeoutMs: 20_000 }),
          expectInboundMediaFlowing(carol, 'video', { timeoutMs: 20_000 }),
        ])
        await Promise.all([
          expectRemoteVideoLive(alice),
          expectRemoteVideoLive(bob),
          expectRemoteVideoLive(carol),
        ])
      })
    } finally {
      await Promise.all([ctx1, ctx2, ctx3].map((c) => c.close().catch(() => {})))
    }
  })

  // ── Late-join path for third peer ─────────────────────────────────────────
  // Alice and Bob publish for several seconds before Carol arrives. The server
  // replays both peers' sfu-tracks to Carol during her join. Carol must
  // subscribe to BOTH existing sessions — not just the most recently published.
  test('third peer joining late receives video from two already-publishing peers', async ({ browser }) => {
    test.setTimeout(90_000)
    const [ctx1, ctx2, ctx3] = await createNCallContexts(browser, 3)
    const room = await createRoom()
    const alice = await ctx1.newPage()
    const bob = await ctx2.newPage()
    const carol = await ctx3.newPage()

    try {
      await test.step('Alice and Bob join with cameras and let publish settle', async () => {
        await joinWithCamera(alice, room, 'Alice')
        await joinWithCamera(bob, room, 'Bob')
        await expectParticipantCount([alice, bob], 2)
        // Let both peers' tracks reach the SFU and be broadcast before Carol arrives.
        await alice.waitForTimeout(3_000)
      })

      await test.step('Carol joins late', async () => {
        // Carol joins without a camera — the only inbound video that matters is
        // what she receives from Alice and Bob via the join-replay path.
        await joinRoom(carol, room, 'Carol')
        await expectParticipantCount([alice, bob, carol], 3)
      })

      await test.step('Carol receives inbound video from both already-publishing peers', async () => {
        // Three-layer: stats must grow (proving the SFU pull subscribed and is
        // receiving bytes) AND pixels must be non-black/non-frozen (proving the
        // decoder is outputting live frames). Checking only one or the other
        // is a false positive.
        await Promise.all([
          expectInboundMediaFlowing(carol, 'video', { timeoutMs: 20_000 }),
          expectRemoteVideoLive(carol),
        ])
      })
    } finally {
      await Promise.all([ctx1, ctx2, ctx3].map((c) => c.close().catch(() => {})))
    }
  })

  // ── Sequential four-peer join ──────────────────────────────────────────────
  // Stresses the subscribe session across the widest N tested. Each peer joins
  // one after the other so every subsequent joiner hits the late-join replay
  // path for an increasing number of existing peers.
  // Asserts that the first joiner (Alice) and last joiner (Dave) both have
  // growing inbound video — catching both "original peer degraded" and
  // "last joiner saw nothing" failure modes.
  test('four peers join sequentially — first and last both receive inbound video', async ({ browser }) => {
    test.setTimeout(120_000)
    const [ctx1, ctx2, ctx3, ctx4] = await createNCallContexts(browser, 4)
    const room = await createRoom()
    const alice = await ctx1.newPage()
    const bob = await ctx2.newPage()
    const carol = await ctx3.newPage()
    const dave = await ctx4.newPage()

    try {
      await test.step('four peers join one after another with cameras on', async () => {
        await joinWithCamera(alice, room, 'Alice')
        await joinWithCamera(bob, room, 'Bob')
        await expectParticipantCount([alice], 2)

        await joinWithCamera(carol, room, 'Carol')
        await expectParticipantCount([alice], 3)

        await joinWithCamera(dave, room, 'Dave')
        await expectParticipantCount([alice, dave], 4)
      })

      await test.step('first and last joiners both have live inbound video', async () => {
        await Promise.all([
          expectInboundMediaFlowing(alice, 'video', { timeoutMs: 25_000 }),
          expectInboundMediaFlowing(dave, 'video', { timeoutMs: 25_000 }),
          expectRemoteVideoLive(alice),
          expectRemoteVideoLive(dave),
        ])
      })
    } finally {
      await Promise.all([ctx1, ctx2, ctx3, ctx4].map((c) => c.close().catch(() => {})))
    }
  })
})
