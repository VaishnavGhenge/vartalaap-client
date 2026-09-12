import { type BrowserContext, type Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { createCallContexts, createRoom, joinRoomWithMedia } from './helpers/call'
import { expectInboundMediaFlowing, expectRemoteAudioAudible, expectRemoteVideoLive } from './helpers/webrtc'

type Profile = 'baseline' | 'control-delay' | 'network-outage' | 'media-controls'
type LabEvent = { atMs: number; participant?: string; event: string; data?: unknown }

const selectedProfiles = (process.env.CALL_LAB_PROFILES ?? 'baseline,control-delay,network-outage,media-controls')
  .split(',').map((value) => value.trim()).filter(Boolean) as Profile[]
const soakMs = Number(process.env.CALL_LAB_SOAK_MS ?? 60_000)
const sampleMs = Number(process.env.CALL_LAB_SAMPLE_MS ?? 5_000)

async function expectMedia(page: Page, timeoutMs = 40_000) {
  await Promise.all([
    expectInboundMediaFlowing(page, 'video', { timeoutMs }),
    expectInboundMediaFlowing(page, 'audio', { timeoutMs }),
    expectRemoteVideoLive(page, undefined, { timeoutMs }),
    expectRemoteAudioAudible(page, undefined, { timeoutMs }),
  ])
}

async function mediaCounters(page: Page) {
  return page.evaluate(async () => {
    const pcs = (window as unknown as { __pcs?: Set<RTCPeerConnection> }).__pcs ?? new Set()
    const totals = { audioBytes: 0, videoBytes: 0, decodedFrames: 0, pcs: pcs.size }
    for (const pc of pcs) {
      const stats = await pc.getStats()
      stats.forEach((entry) => {
        if (entry.type !== 'inbound-rtp') return
        if (entry.kind === 'audio') totals.audioBytes += entry.bytesReceived ?? 0
        if (entry.kind === 'video') {
          totals.videoBytes += entry.bytesReceived ?? 0
          totals.decodedFrames += entry.framesDecoded ?? 0
        }
      })
    }
    return totals
  })
}

async function installScreenFixture(context: BrowserContext) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async () => {
        const canvas = document.createElement('canvas')
        canvas.width = 320
        canvas.height = 180
        const ctx = canvas.getContext('2d')!
        let frame = 0
        const draw = () => {
          ctx.fillStyle = frame++ % 2 ? '#ffffff' : '#0f766e'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.fillStyle = frame % 2 ? '#0f766e' : '#ffffff'
          ctx.fillRect(0, 0, 100, 100)
          requestAnimationFrame(draw)
        }
        draw()
        return canvas.captureStream(10)
      },
    })
  })
}

for (const profile of selectedProfiles) {
  test(`call lab: ${profile}`, async ({ browser }, testInfo) => {
    test.skip(process.env.CALL_LAB !== 'true', 'Opt-in practical call lab')
    test.setTimeout(Math.max(180_000, soakMs + 120_000))
    const startedAt = Date.now()
    const events: LabEvent[] = []
    const mark = (event: string, participant?: string, data?: unknown) => {
      events.push({ atMs: Date.now() - startedAt, participant, event, data })
    }
    const { ctx1, ctx2 } = await createCallContexts(browser)
    await installScreenFixture(ctx2)
    const alice = await ctx1.newPage()
    const bob = await ctx2.newPage()
    for (const [name, page] of [['alice', alice], ['bob', bob]] as const) {
      page.on('console', (message) => {
        if (message.type() === 'error' || message.type() === 'warning') mark(`console:${message.type()}`, name, message.text())
      })
      page.on('pageerror', (error) => mark('pageerror', name, error.message))
      page.on('requestfailed', (request) => mark('requestfailed', name, request.url().replace(/[?#].*$/, '')))
    }

    try {
      if (profile === 'control-delay') {
        let delayed = 0
        await bob.route(/\/sfu\/sessions\//, async (route) => {
          if (delayed++ < 4) await new Promise((resolve) => setTimeout(resolve, 2_000))
          await route.continue()
        })
      }
      const room = await createRoom()
      mark('join-start')
      await joinRoomWithMedia(alice, room, 'Alice')
      await joinRoomWithMedia(bob, room, 'Bob')
      await Promise.all([expectMedia(alice), expectMedia(bob)])
      mark('initial-media-flowing')

      if (profile === 'network-outage') {
        mark('network-offline', 'bob')
        await ctx2.setOffline(true)
        await bob.waitForTimeout(3_000)
        await ctx2.setOffline(false)
        mark('network-online', 'bob')
        await Promise.all([expectMedia(alice, 60_000), expectMedia(bob, 60_000)])
        mark('network-recovered')
      }

      if (profile === 'media-controls') {
        await bob.getByRole('button', { name: /turn camera off/i }).click()
        await bob.getByRole('button', { name: /turn camera on/i }).click()
        await bob.getByRole('button', { name: /^mute/i }).click()
        await bob.getByRole('button', { name: /^unmute/i }).click()
        await bob.getByRole('button', { name: /^share screen$/i }).click()
        await expect(alice.getByText(/• Screen$/)).toBeVisible({ timeout: 15_000 })
        await expectInboundMediaFlowing(alice, 'video', { timeoutMs: 30_000 })
        await bob.getByRole('button', { name: /stop sharing screen/i }).click()
        await Promise.all([expectMedia(alice), expectMedia(bob)])
        mark('media-controls-recovered')
      }

      const deadline = Date.now() + soakMs
      let previous = { alice: await mediaCounters(alice), bob: await mediaCounters(bob) }
      while (Date.now() < deadline) {
        await alice.waitForTimeout(Math.min(sampleMs, Math.max(0, deadline - Date.now())))
        const current = { alice: await mediaCounters(alice), bob: await mediaCounters(bob) }
        for (const participant of ['alice', 'bob'] as const) {
          const before = previous[participant]
          const after = current[participant]
          const delta = {
            audioBytes: after.audioBytes - before.audioBytes,
            videoBytes: after.videoBytes - before.videoBytes,
            decodedFrames: after.decodedFrames - before.decodedFrames,
            pcs: after.pcs,
          }
          mark('media-sample', participant, delta)
          expect(delta.audioBytes, `${participant} audio stopped`).toBeGreaterThan(0)
          expect(delta.videoBytes, `${participant} video stopped`).toBeGreaterThan(0)
          expect(delta.decodedFrames, `${participant} decoder froze`).toBeGreaterThan(0)
        }
        previous = current
      }
      await Promise.all([expectMedia(alice), expectMedia(bob)])
      mark('final-media-flowing')
    } finally {
      const cleanup = await Promise.allSettled([ctx1.close(), ctx2.close()])
      mark('cleanup-complete', undefined, cleanup.map((result) => result.status))
      await testInfo.attach('call-lab-report', {
        body: Buffer.from(JSON.stringify({
          runId: `${startedAt}-${profile}-${testInfo.workerIndex}`,
          profile,
          soakMs,
          sampleMs,
          baseURL: testInfo.project.use.baseURL,
          events,
        }, null, 2)),
        contentType: 'application/json',
      })
      expect(cleanup.every((result) => result.status === 'fulfilled'), 'browser contexts did not clean up').toBe(true)
    }
  })
}
