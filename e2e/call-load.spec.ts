import { type BrowserContext, type Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { createNCallContexts, createRoom, joinRoomWithMedia } from './helpers/call'
import {
  expectInboundMediaFlowing,
  expectRemoteAudioAudible,
  expectRemoteVideoLive,
} from './helpers/webrtc'

async function expectPairMedia(page: Page) {
  await Promise.all([
    expectInboundMediaFlowing(page, 'video', { timeoutMs: 30_000 }),
    expectInboundMediaFlowing(page, 'audio', { timeoutMs: 30_000 }),
    expectRemoteVideoLive(page, undefined, { timeoutMs: 30_000 }),
    expectRemoteAudioAudible(page, undefined, { timeoutMs: 30_000 }),
  ])
}

test('parallel rooms remain isolated through a failure and rejoin', async ({ browser }, testInfo) => {
  test.skip(process.env.E2E_LOAD !== 'true', 'Opt-in multi-room load test')
  test.setTimeout(600_000)
  const roomCount = Number(process.env.E2E_LOAD_ROOMS ?? 3)
  if (!Number.isInteger(roomCount) || roomCount < 2 || roomCount > 5) {
    throw new Error('E2E_LOAD_ROOMS must be an integer from 2 to 5')
  }

  let contexts: BrowserContext[] = []
  const failures: Array<{ participant: number; status: number; path: string }> = []
  const checkpoints: Array<{ name: string; at: string }> = []
  try {
    const rooms = await Promise.all(Array.from({ length: roomCount }, () => createRoom()))
    contexts = await createNCallContexts(browser, roomCount * 2)
    const pages = await Promise.all(contexts.map(context => context.newPage()))
    pages.forEach((page, participant) => page.on('response', response => {
      const path = new URL(response.url()).pathname
      if (response.status() >= 400 && path.startsWith('/sfu/')) {
        failures.push({ participant, status: response.status(), path: path.replace(/[a-f0-9-]{20,}/gi, ':id') })
      }
    }))

    await Promise.all(pages.map((page, participant) =>
      joinRoomWithMedia(page, rooms[Math.floor(participant / 2)], `Load ${participant + 1}`)))
    await Promise.all(pages.map(page =>
      expect(page.getByText('2 participants', { exact: true })).toBeVisible({ timeout: 45_000 })))
    await Promise.all(pages.map(expectPairMedia))
    checkpoints.push({ name: 'all rooms flowing', at: new Date().toISOString() })

    const disrupted = pages[1]
    await disrupted.getByRole('button', { name: /leave call/i }).click()
    await expect(pages[0].getByText('1 participant', { exact: true })).toBeVisible({ timeout: 15_000 })
    await Promise.all(pages.slice(2).map(expectPairMedia))
    checkpoints.push({ name: 'other rooms flowing during room-1 leave', at: new Date().toISOString() })

    await joinRoomWithMedia(disrupted, rooms[0], 'Load 2')
    await Promise.all([
      expect(pages[0].getByText('2 participants', { exact: true })).toBeVisible({ timeout: 30_000 }),
      expect(disrupted.getByText('2 participants', { exact: true })).toBeVisible({ timeout: 30_000 }),
      expectPairMedia(pages[0]),
      expectPairMedia(disrupted),
    ])
    checkpoints.push({ name: 'disrupted room recovered', at: new Date().toISOString() })

    expect(failures).toEqual([])
  } finally {
    await testInfo.attach('multi-room-load-report', {
      body: JSON.stringify({ roomCount, participants: roomCount * 2, checkpoints, sfuHttpFailures: failures }, null, 2),
      contentType: 'application/json',
    })
    await Promise.all(contexts.map(context => context.close().catch(() => {})))
  }
})
