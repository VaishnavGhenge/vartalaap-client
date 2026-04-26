import { test, expect, chromium } from '@playwright/test'

const randomRoom = () => Math.random().toString(36).slice(2, 8)

// chromium.launch() bypasses playwright.config launchOptions, so pass args explicitly
const LAUNCH_ARGS = {
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
}
const CTX_OPTS = {
  permissions: ['camera', 'microphone'] as const,
  baseURL: 'http://localhost:3000',
}

test.describe('Two-user call', () => {
  test('both users can see each other after joining the same room', async () => {
    const browser = await chromium.launch(LAUNCH_ARGS)
    const roomCode = randomRoom()

    const ctx1 = await browser.newContext(CTX_OPTS)
    const ctx2 = await browser.newContext(CTX_OPTS)
    const page1 = await ctx1.newPage()
    const page2 = await ctx2.newPage()

    await test.step('Alice navigates to the room', async () => {
      await page1.goto(`/${roomCode}`)
      await expect(page1.getByText(roomCode)).toBeVisible()
    })

    await test.step('Alice joins the call', async () => {
      await page1.getByPlaceholder(/your name/i).fill('Alice')
      await page1.getByRole('button', { name: /join now/i }).click()
      await expect(page1.getByRole('button', { name: /leave call/i })).toBeVisible({ timeout: 10_000 })
    })

    await test.step('Bob navigates to the same room', async () => {
      await page2.goto(`/${roomCode}`)
      await expect(page2.getByText(roomCode)).toBeVisible()
    })

    await test.step('Bob joins the call', async () => {
      await page2.getByPlaceholder(/your name/i).fill('Bob')
      await page2.getByRole('button', { name: /join now/i }).click()
      await expect(page2.getByRole('button', { name: /leave call/i })).toBeVisible({ timeout: 10_000 })
    })

    await test.step('Alice can see Bob\'s tile', async () => {
      await expect(page1.getByText('Bob')).toBeVisible({ timeout: 15_000 })
    })

    await test.step('Bob can see Alice\'s tile', async () => {
      await expect(page2.getByText('Alice')).toBeVisible({ timeout: 15_000 })
    })

    await test.step('both show 2 participants', async () => {
      await expect(page1.getByText(/2 participants/i)).toBeVisible()
      await expect(page2.getByText(/2 participants/i)).toBeVisible()
    })

    await test.step('"invite someone" hint disappears once both are in', async () => {
      await expect(page1.getByText(/invite someone/i)).not.toBeVisible()
      await expect(page2.getByText(/invite someone/i)).not.toBeVisible()
    })

    await browser.close()
  })

  test('a user who leaves is removed from the other user\'s view', async () => {
    const browser = await chromium.launch(LAUNCH_ARGS)
    const roomCode = randomRoom()

    const ctx1 = await browser.newContext(CTX_OPTS)
    const ctx2 = await browser.newContext(CTX_OPTS)
    const page1 = await ctx1.newPage()
    const page2 = await ctx2.newPage()

    await test.step('both users join', async () => {
      await page1.goto(`/${roomCode}`)
      await page1.getByPlaceholder(/your name/i).fill('Alice')
      await page1.getByRole('button', { name: /join now/i }).click()
      await expect(page1.getByRole('button', { name: /leave call/i })).toBeVisible({ timeout: 10_000 })

      await page2.goto(`/${roomCode}`)
      await page2.getByPlaceholder(/your name/i).fill('Bob')
      await page2.getByRole('button', { name: /join now/i }).click()
      await expect(page2.getByRole('button', { name: /leave call/i })).toBeVisible({ timeout: 10_000 })

      await expect(page1.getByText('Bob')).toBeVisible({ timeout: 15_000 })
    })

    await test.step('Bob leaves the call', async () => {
      await page2.getByRole('button', { name: /leave call/i }).click()
    })

    await test.step('Alice no longer sees Bob\'s tile', async () => {
      await expect(page1.getByText('Bob')).not.toBeVisible({ timeout: 10_000 })
    })

    await test.step('Alice is back to 1 participant', async () => {
      await expect(page1.getByText(/1 participant/i)).toBeVisible()
    })

    await browser.close()
  })

  test('rejoining the same room after leaving works', async () => {
    const browser = await chromium.launch(LAUNCH_ARGS)
    const roomCode = randomRoom()

    const ctx1 = await browser.newContext(CTX_OPTS)
    const ctx2 = await browser.newContext(CTX_OPTS)
    const page1 = await ctx1.newPage()
    const page2 = await ctx2.newPage()

    await test.step('Alice joins', async () => {
      await page1.goto(`/${roomCode}`)
      await page1.getByPlaceholder(/your name/i).fill('Alice')
      await page1.getByRole('button', { name: /join now/i }).click()
      await expect(page1.getByRole('button', { name: /leave call/i })).toBeVisible({ timeout: 10_000 })
    })

    await test.step('Alice leaves and rejoins', async () => {
      await page1.getByRole('button', { name: /leave call/i }).click()
      // Back on join screen
      await expect(page1.getByRole('button', { name: /join now/i })).toBeVisible({ timeout: 5_000 })

      await page1.getByPlaceholder(/your name/i).fill('Alice')
      await page1.getByRole('button', { name: /join now/i }).click()
      await expect(page1.getByRole('button', { name: /leave call/i })).toBeVisible({ timeout: 10_000 })
    })

    await test.step('Bob joins and can see Alice', async () => {
      await page2.goto(`/${roomCode}`)
      await page2.getByPlaceholder(/your name/i).fill('Bob')
      await page2.getByRole('button', { name: /join now/i }).click()
      await expect(page2.getByRole('button', { name: /leave call/i })).toBeVisible({ timeout: 10_000 })

      await expect(page2.getByText('Alice')).toBeVisible({ timeout: 15_000 })
      await expect(page1.getByText('Bob')).toBeVisible({ timeout: 15_000 })
    })

    await browser.close()
  })
})
