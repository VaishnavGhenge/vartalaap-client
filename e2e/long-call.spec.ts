import { test, expect } from './fixtures'
import { createCallContexts, createRoom, fillName } from './helpers/call'
import { expectInboundMediaFlowing, expectRemoteVideoLive, expectRemoteAudioAudible } from './helpers/webrtc'

test('call survives refresh, a transient refresh failure, and new media after expiry', async ({ browser }, testInfo) => {
  test.skip(process.env.E2E_LONG_CALL !== 'true', 'Opt-in 16-minute staging call')
  test.setTimeout(21 * 60_000)
  expect(process.env.E2E_COOKIE_AUTH).toBe('true')
  const { ctx1, ctx2 } = await createCallContexts(browser)
  const refreshes: Array<{ caller: number; status: number; at: string }> = []
  const checkpoints: string[] = []
  try {
    const room = await createRoom()
    const pages = await Promise.all([ctx1.newPage(), ctx2.newPage()])
    for (const [caller, page] of pages.entries()) {
      page.on('response', response => {
        if (new URL(response.url()).pathname === '/auth/refresh') {
          refreshes.push({ caller, status: response.status(), at: new Date().toISOString() })
        }
      })
      await page.goto(`/room/${room}`)
      await fillName(page, 'Call reliability test')
      const camera = page.getByRole('button', { name: /turn camera on/i })
      if (await camera.isVisible()) await camera.click()
      await page.getByRole('button', { name: /join now/i }).click()
      await expect(page.getByRole('button', { name: /leave call/i })).toBeVisible()
      const mic = page.getByRole('button', { name: /^unmute/i })
      if (await mic.isVisible()) await mic.click()
    }
    // Auth was restored from HttpOnly cookies, never a seeded access token.
    expect(refreshes.filter(item => item.status === 200)).toHaveLength(2)
    const initialTokens = await Promise.all(pages.map(page => page.evaluate(() => localStorage.getItem('sessionly_access_token'))))
    let injected = false
    await pages[0].route('**/auth/refresh', async route => {
      if (!injected) {
        injected = true
        await route.fulfill({ status: 503, body: 'temporary test outage' })
      } else await route.continue()
    })
    const start = Date.now()
    for (let minute = 0; minute <= 16; minute++) {
      const wait = start + minute * 60_000 - Date.now()
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
      await Promise.all(pages.map(async page => {
        await expectInboundMediaFlowing(page, 'video')
        await expectInboundMediaFlowing(page, 'audio')
        await expectRemoteVideoLive(page)
        await expectRemoteAudioAudible(page)
      }))
      checkpoints.push(`minute ${minute}: video and audio flowing`)
      console.log(checkpoints.at(-1))
    }
    expect(injected).toBe(true)
    expect(refreshes.some(item => item.status === 401)).toBe(false)
    for (const [caller, page] of pages.entries()) {
      expect(await page.evaluate(() => localStorage.getItem('sessionly_access_token'))).not.toBe(initialTokens[caller])
      expect(refreshes.filter(item => item.caller === caller && item.status === 200).length).toBeGreaterThanOrEqual(2)
    }
    // A late join forces fresh authenticated SFU calls after the original JWT
    // expired. Existing RTP alone would miss broken auth and failed repair.
    await pages[1].getByRole('button', { name: /leave call/i }).click()
    await pages[1].goto(`/room/${room}`)
    await fillName(pages[1], 'Rejoined')
    const camera = pages[1].getByRole('button', { name: /turn camera on/i })
    if (await camera.isVisible()) await camera.click()
    await pages[1].getByRole('button', { name: /join now/i }).click()
    const mic = pages[1].getByRole('button', { name: /^unmute/i })
    await expect(pages[1].getByRole('button', { name: /leave call/i })).toBeVisible()
    if (await mic.isVisible()) await mic.click()
    await Promise.all(pages.map(async page => {
      await expectInboundMediaFlowing(page, 'video', { timeoutMs: 30_000 })
      await expectInboundMediaFlowing(page, 'audio', { timeoutMs: 30_000 })
      await expectRemoteVideoLive(page)
    }))
    checkpoints.push('post-expiry rejoin: media flowing')
  } finally {
    await testInfo.attach('long-call-report', { body: JSON.stringify({ refreshes, checkpoints }, null, 2), contentType: 'application/json' })
    await Promise.all([ctx1.close(), ctx2.close()])
  }
})
