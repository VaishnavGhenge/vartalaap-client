import { test, expect } from '@playwright/test'

test.describe('Join-meet screen', () => {
  const ROOM = 'test-room-abc'

  test.beforeEach(async ({ page }) => {
    await page.goto(`/${ROOM}`)
  })

  test('"Join now" is disabled until a non-whitespace name is entered', async ({ page }) => {
    const btn = page.getByRole('button', { name: /join now/i })
    await expect(btn).toBeDisabled()

    await page.getByPlaceholder(/your name/i).fill('   ')
    await expect(btn).toBeDisabled()

    await page.getByPlaceholder(/your name/i).fill('Alice')
    await expect(btn).toBeEnabled()
  })

  test('entering a name and clicking "Join now" enters the call', async ({ page }) => {
    await page.getByPlaceholder(/your name/i).fill('Alice')
    await page.getByRole('button', { name: /join now/i }).click()

    await expect(page.getByRole('button', { name: /leave call/i })).toBeVisible({ timeout: 10_000 })
  })

  test('pressing Enter in the name field also joins', async ({ page }) => {
    await page.getByPlaceholder(/your name/i).fill('Alice')
    await page.keyboard.press('Enter')

    await expect(page.getByRole('button', { name: /leave call/i })).toBeVisible({ timeout: 10_000 })
  })
})
