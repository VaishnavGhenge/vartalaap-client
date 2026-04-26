import { test, expect, type Page, type BrowserContext } from '@playwright/test'

const ROOM = 'test-camera-flip'

async function joinCall(page: Page, name = 'Alice') {
  await page.goto(`/${ROOM}`)
  await page.getByPlaceholder(/your name/i).fill(name)
  await page.getByRole('button', { name: /join now/i }).click()
  await expect(page.getByRole('button', { name: /leave call/i })).toBeVisible({ timeout: 10_000 })
}

// Grant camera permission and stub enumerateDevices to report N cameras
async function contextWithCameras(browser: import('@playwright/test').Browser, count: number) {
  const context = await browser.newContext({
    permissions: ['camera', 'microphone'],
    baseURL: 'http://localhost:3000',
  })
  await context.addInitScript((n: number) => {
    const original = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices)
    Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
      value: async () => {
        const real = await original()
        // Replace video inputs with exactly n fake entries
        const nonVideo = real.filter((d: MediaDeviceInfo) => d.kind !== 'videoinput')
        const fakeVideos = Array.from({ length: n }, (_, i) => ({
          kind: 'videoinput',
          deviceId: `fake-video-${i}`,
          label: `Camera ${i}`,
          groupId: '',
          toJSON: () => ({}),
        }))
        return [...nonVideo, ...fakeVideos]
      },
      writable: true,
    })
  }, count)
  return context
}

test.describe('Flip camera button — join screen', () => {
  test('flip button is hidden when device has only one camera', async ({ browser }) => {
    const ctx = await contextWithCameras(browser, 1)
    const page = await ctx.newPage()

    await page.goto(`/${ROOM}`)

    // Turn camera on in the preview
    const camBtn = page.getByRole('button', { name: /turn camera on/i })
    if (await camBtn.isVisible()) await camBtn.click()

    await expect(page.getByRole('button', { name: /switch camera/i })).not.toBeVisible()
    await ctx.close()
  })

  test('flip button appears when device has two cameras and camera is on', async ({ browser }) => {
    const ctx = await contextWithCameras(browser, 2)
    const page = await ctx.newPage()

    await page.goto(`/${ROOM}`)

    const camBtn = page.getByRole('button', { name: /turn camera on/i })
    if (await camBtn.isVisible()) await camBtn.click()

    await expect(page.getByRole('button', { name: /switch camera/i })).toBeVisible({ timeout: 3_000 })
    await ctx.close()
  })

  test('flip button is hidden when camera is off', async ({ browser }) => {
    const ctx = await contextWithCameras(browser, 2)
    const page = await ctx.newPage()

    await page.goto(`/${ROOM}`)

    // Ensure camera is off (default state)
    await expect(page.getByRole('button', { name: /switch camera/i })).not.toBeVisible()
    await ctx.close()
  })
})

test.describe('Flip camera button — in call', () => {
  test('flip button is hidden when device has only one camera', async ({ browser }) => {
    const ctx = await contextWithCameras(browser, 1)
    const page = await ctx.newPage()
    await joinCall(page)

    // Turn camera on
    const camBtn = page.getByRole('button', { name: /turn camera on/i })
    if (await camBtn.isVisible()) await camBtn.click()

    await expect(page.getByRole('button', { name: /switch camera/i })).not.toBeVisible()
    await ctx.close()
  })

  test('flip button appears when device has two cameras and camera is on', async ({ browser }) => {
    const ctx = await contextWithCameras(browser, 2)
    const page = await ctx.newPage()

    // Navigate directly so initScript is active from the start
    await page.goto(`/${ROOM}`)
    await page.getByPlaceholder(/your name/i).fill('Alice')
    await page.getByRole('button', { name: /join now/i }).click()
    await expect(page.getByRole('button', { name: /leave call/i })).toBeVisible({ timeout: 10_000 })

    const camBtn = page.getByRole('button', { name: /turn camera on/i })
    if (await camBtn.isVisible()) await camBtn.click()

    await expect(page.getByRole('button', { name: /switch camera/i })).toBeVisible({ timeout: 3_000 })
    await ctx.close()
  })

  test('flip button disappears when camera is turned off', async ({ browser }) => {
    const ctx = await contextWithCameras(browser, 2)
    const page = await ctx.newPage()

    await page.goto(`/${ROOM}`)
    await page.getByPlaceholder(/your name/i).fill('Alice')
    await page.getByRole('button', { name: /join now/i }).click()
    await expect(page.getByRole('button', { name: /leave call/i })).toBeVisible({ timeout: 10_000 })

    // Turn camera on
    const camOnBtn = page.getByRole('button', { name: /turn camera on/i })
    if (await camOnBtn.isVisible()) await camOnBtn.click()
    await expect(page.getByRole('button', { name: /switch camera/i })).toBeVisible({ timeout: 3_000 })

    // Turn camera off — flip button must disappear
    await page.getByRole('button', { name: /turn camera off/i }).click()
    await expect(page.getByRole('button', { name: /switch camera/i })).not.toBeVisible()

    await ctx.close()
  })

  test('clicking flip calls getUserMedia with the opposite facingMode', async ({ browser }) => {
    const ctx = await contextWithCameras(browser, 2)
    const page = await ctx.newPage()

    // Intercept getUserMedia calls to capture constraints
    await ctx.addInitScript(() => {
      const calls: MediaStreamConstraints[] = []
      ;(window as unknown as { __gumCalls: MediaStreamConstraints[] }).__gumCalls = calls
      const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: (constraints: MediaStreamConstraints) => {
          calls.push(constraints)
          return orig(constraints)
        },
        writable: true,
      })
    })

    await page.goto(`/${ROOM}`)
    await page.getByPlaceholder(/your name/i).fill('Alice')
    await page.getByRole('button', { name: /join now/i }).click()
    await expect(page.getByRole('button', { name: /leave call/i })).toBeVisible({ timeout: 10_000 })

    const camOnBtn = page.getByRole('button', { name: /turn camera on/i })
    if (await camOnBtn.isVisible()) await camOnBtn.click()

    await expect(page.getByRole('button', { name: /switch camera/i })).toBeVisible({ timeout: 3_000 })
    await page.getByRole('button', { name: /switch camera/i }).click()

    // After flip, getUserMedia should have been called with environment facingMode
    await page.waitForFunction(() => {
      const calls = (window as unknown as { __gumCalls: MediaStreamConstraints[] }).__gumCalls
      return calls.some(c => {
        const v = c.video as MediaTrackConstraints
        return typeof v === 'object' && (v.facingMode as { exact?: string })?.exact === 'environment'
      })
    }, { timeout: 5_000 })

    await ctx.close()
  })
})
