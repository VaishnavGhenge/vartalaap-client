import { type BrowserContext, type Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { createCallContexts, createRoom, joinRoomWithMedia } from './helpers/call'
import {
  expectInboundMediaFlowing,
  expectRemoteAudioAudible,
  expectRemoteVideoLive,
} from './helpers/webrtc'

async function expectMedia(page: Page, timeoutMs = 35_000) {
  await Promise.all([
    expectInboundMediaFlowing(page, 'video', { timeoutMs }),
    expectInboundMediaFlowing(page, 'audio', { timeoutMs }),
    expectRemoteVideoLive(page, undefined, { timeoutMs }),
    expectRemoteAudioAudible(page, undefined, { timeoutMs }),
  ])
}

test.describe('real call recovery', () => {
  let ctx1: BrowserContext
  let ctx2: BrowserContext

  test.beforeEach(async ({ browser }) => {
    test.skip(process.env.E2E_RELIABILITY !== 'true', 'Opt-in deployed reliability tests')
    ;({ ctx1, ctx2 } = await createCallContexts(browser))
  })

  test.afterEach(async () => {
    await ctx1?.close().catch(() => {})
    await ctx2?.close().catch(() => {})
  })

  test('slow SFU control responses do not corrupt setup or later toggles', async () => {
    test.setTimeout(150_000)
    const room = await createRoom()
    const alice = await ctx1.newPage()
    const bob = await ctx2.newPage()
    let delayedRequests = 0

    await bob.route(/\/sfu\/sessions\/(new|[^/]+\/tracks\/new)/, async (route) => {
      if (delayedRequests < 3) {
        delayedRequests++
        await new Promise(resolve => setTimeout(resolve, 5_000))
      }
      await route.continue()
    })

    await joinRoomWithMedia(alice, room, 'Alice')
    await joinRoomWithMedia(bob, room, 'Bob')
    await Promise.all([
      expect(alice.getByText('2 participants', { exact: true })).toBeVisible({ timeout: 20_000 }),
      expect(bob.getByText('2 participants', { exact: true })).toBeVisible({ timeout: 20_000 }),
    ])
    await Promise.all([expectMedia(alice), expectMedia(bob)])

    await bob.getByRole('button', { name: /turn camera off/i }).click()
    await expect(bob.getByRole('button', { name: /turn camera on/i })).toBeVisible()
    await bob.getByRole('button', { name: /turn camera on/i }).click()
    await expect(bob.getByRole('button', { name: /turn camera off/i })).toBeVisible()

    await expectMedia(alice)
    expect(delayedRequests).toBeGreaterThan(0)
  })

  test('a short network interruption recovers without rejoining the room', async () => {
    test.setTimeout(150_000)
    const room = await createRoom()
    const alice = await ctx1.newPage()
    const bob = await ctx2.newPage()

    await joinRoomWithMedia(alice, room, 'Alice')
    await joinRoomWithMedia(bob, room, 'Bob')
    await Promise.all([expectMedia(alice), expectMedia(bob)])

    await ctx2.setOffline(true)
    await bob.waitForTimeout(3_000)
    await ctx2.setOffline(false)

    await expect(bob.getByRole('button', { name: /leave call/i })).toBeVisible()
    await expect(bob.getByText('2 participants', { exact: true })).toBeVisible({ timeout: 30_000 })
    await Promise.all([expectMedia(alice, 45_000), expectMedia(bob, 45_000)])
  })
})
