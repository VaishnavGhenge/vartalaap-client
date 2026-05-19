import { expect, test, type Browser } from '@playwright/test'
import { createCallContexts, joinRoom, createRoom, type InitScriptTarget } from './helpers/call'

async function installScreenShareStub(target: InitScriptTarget, options: { reject?: boolean } = {}) {
  await target.addInitScript(({ reject }) => {
    const state = {
      requestCount: 0,
      stopCount: 0,
      lastConstraints: null as unknown,
    }

    ;(window as unknown as { __screenShareState: typeof state }).__screenShareState = state

    const mediaDevices = navigator.mediaDevices ?? {}
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: mediaDevices,
    })

    Object.defineProperty(mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async (constraints?: DisplayMediaStreamOptions) => {
        state.requestCount++
        state.lastConstraints = constraints ?? null

        if (reject) {
          throw Object.assign(new Error('denied'), { name: 'NotAllowedError' })
        }

        const canvas = document.createElement('canvas')
        canvas.width = 320
        canvas.height = 180
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.fillStyle = '#0f766e'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        }

        const stream = canvas.captureStream(5)
        const track = stream.getVideoTracks()[0]
        const stop = track.stop.bind(track)
        track.stop = () => {
          state.stopCount++
          stop()
        }
        return stream
      },
    })
  }, options)
}

test.describe('In-call feature controls', () => {
  test('screen sharing shows presenting state and can be stopped', async ({ page }) => {
    await installScreenShareStub(page)
    await joinRoom(page, await createRoom(), 'Alice')

    await page.getByRole('button', { name: /share screen/i }).click()

    await page.waitForFunction(() => {
      return (window as unknown as { __screenShareState: { requestCount: number } }).__screenShareState.requestCount === 1
    })
    await expect(page.getByText(/presenting/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /stop sharing screen/i })).toBeVisible()

    await expect.poll(async () => {
      return page.evaluate(() => {
        return (window as unknown as {
          __screenShareState: { lastConstraints: DisplayMediaStreamOptions | null }
        }).__screenShareState.lastConstraints
      })
    }).toMatchObject({ video: true, audio: false, selfBrowserSurface: 'exclude' })

    await page.getByRole('button', { name: /stop sharing screen/i }).click()

    await expect(page.getByText(/presenting/i)).not.toBeVisible()
    await expect(page.getByRole('button', { name: /^share screen$/i })).toBeVisible()
    await expect.poll(async () => {
      return page.evaluate(() => {
        return (window as unknown as { __screenShareState: { stopCount: number } }).__screenShareState.stopCount
      })
    }).toBeGreaterThanOrEqual(1)
  })

  test('screen-share cancellation leaves the call in normal state', async ({ page }) => {
    await installScreenShareStub(page, { reject: true })
    await joinRoom(page, await createRoom(), 'Alice')

    await page.getByRole('button', { name: /share screen/i }).click()

    await page.waitForFunction(() => {
      return (window as unknown as { __screenShareState: { requestCount: number } }).__screenShareState.requestCount === 1
    })
    await expect(page.getByText(/presenting/i)).not.toBeVisible()
    await expect(page.getByRole('button', { name: /^share screen$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /leave call/i })).toBeVisible()
  })

  test('remote participant sees when a peer starts screen sharing', async ({ browser }: { browser: Browser }) => {
    const roomCode = await createRoom()
    const { ctx1: aliceContext, ctx2: bobContext } = await createCallContexts(browser)
    await installScreenShareStub(aliceContext)

    const alice = await aliceContext.newPage()
    const bob = await bobContext.newPage()

    await joinRoom(alice, roomCode, 'Alice')
    await joinRoom(bob, roomCode, 'Bob')
    await expect(alice.getByText('Bob')).toBeVisible({ timeout: 15_000 })

    await alice.getByRole('button', { name: /share screen/i }).click()

    await expect(bob.getByText(/Alice.*Screen/i)).toBeVisible({ timeout: 15_000 })

    await aliceContext.close()
    await bobContext.close()
  })
})
