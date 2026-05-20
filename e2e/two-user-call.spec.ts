/**
 * Two-user call scenarios — three-layer media verification.
 *
 * Covers the simplest baseline (two peers see each other, one turns camera on,
 * one leaves, one rejoins). For the more SFU-specific paths (publish error
 * surface, late-joiner replay, mid-call camera/mic enable) see sfu-tracks.spec.ts.
 *
 * Presence is asserted via the participant-count chip rather than peer names —
 * createCallContexts() logs both peers in as the same auth account, so
 * name-based assertions can't distinguish them.
 */

import { test, expect } from './fixtures'
import { createCallContexts, fillName, joinRoom, createRoom } from './helpers/call'
import {
  expectInboundMediaFlowing,
  expectRemoteVideoLive,
} from './helpers/webrtc'

test.describe('Two-user call', () => {
  test('remote participant receives camera video after peer turns camera on', async ({ browser }) => {
    const roomCode = await createRoom()

    const { ctx1, ctx2 } = await createCallContexts(browser)
    const alice = await ctx1.newPage()
    const bob = await ctx2.newPage()

    await test.step('both users join with cameras off', async () => {
      await joinRoom(alice, roomCode, 'Alice')
      await joinRoom(bob, roomCode, 'Bob')
      await expect(alice.getByText('2 participants', { exact: true })).toBeVisible({ timeout: 15_000 })
      await expect(bob.getByText('2 participants', { exact: true })).toBeVisible({ timeout: 15_000 })
      await expect(alice.getByText(/invite someone/i)).not.toBeVisible()
      await expect(bob.getByText(/invite someone/i)).not.toBeVisible()
    })

    await test.step('Alice turns camera on', async () => {
      await alice.getByRole('button', { name: /turn camera on/i }).click()
    })

    await test.step('Bob receives decoded remote video frames', async () => {
      // Three-layer: stats prove subscribe pulled bytes; pixel content proves
      // the decoder produced live, non-frozen frames.
      await Promise.all([
        expectInboundMediaFlowing(bob, 'video'),
        expectRemoteVideoLive(bob),
      ])
    })

    await ctx1.close()
    await ctx2.close()
  })

  test('a user who leaves is removed from the other user\'s view', async ({ browser }) => {
    const roomCode = await createRoom()

    const { ctx1, ctx2 } = await createCallContexts(browser)
    const page1 = await ctx1.newPage()
    const page2 = await ctx2.newPage()

    await test.step('both users join', async () => {
      await joinRoom(page1, roomCode, 'Alice')
      await joinRoom(page2, roomCode, 'Bob')
      await expect(page1.getByText('2 participants', { exact: true })).toBeVisible({ timeout: 15_000 })
    })

    await test.step('Bob leaves the call', async () => {
      await page2.getByRole('button', { name: /leave call/i }).click()
    })

    await test.step('Alice is back to 1 participant', async () => {
      await expect(page1.getByText('1 participant', { exact: true })).toBeVisible({ timeout: 10_000 })
    })

    await ctx1.close()
    await ctx2.close()
  })

  test('rejoining the same room after leaving works', async ({ browser }) => {
    const roomCode = await createRoom()

    const { ctx1, ctx2 } = await createCallContexts(browser)
    const page1 = await ctx1.newPage()
    const page2 = await ctx2.newPage()

    await test.step('Alice joins', async () => {
      await joinRoom(page1, roomCode, 'Alice')
    })

    await test.step('Alice leaves and rejoins', async () => {
      await page1.getByRole('button', { name: /leave call/i }).click()
      await expect(page1.getByRole('button', { name: /join now/i })).toBeVisible({ timeout: 5_000 })

      await fillName(page1, 'Alice')
      await page1.getByRole('button', { name: /join now/i }).click()
      await expect(page1.getByRole('button', { name: /leave call/i })).toBeVisible({ timeout: 10_000 })
    })

    await test.step('Bob joins and both see each other', async () => {
      await joinRoom(page2, roomCode, 'Bob')
      await expect(page1.getByText('2 participants', { exact: true })).toBeVisible({ timeout: 15_000 })
      await expect(page2.getByText('2 participants', { exact: true })).toBeVisible({ timeout: 15_000 })
    })

    await ctx1.close()
    await ctx2.close()
  })
})
