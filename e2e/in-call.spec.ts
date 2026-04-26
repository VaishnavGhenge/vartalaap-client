import { test, expect, type Page } from '@playwright/test'

const ROOM = 'test-room-call'

async function joinCall(page: Page, name = 'Alice') {
  await page.goto(`/${ROOM}`)
  await page.getByPlaceholder(/your name/i).fill(name)
  await page.getByRole('button', { name: /join now/i }).click()
  await expect(page.getByRole('button', { name: /leave call/i })).toBeVisible({ timeout: 10_000 })
}

test.describe('In-call UI', () => {
  test('"Leave call" returns to the join screen for the same room', async ({ page }) => {
    await joinCall(page)
    await page.getByRole('button', { name: /leave call/i }).click()

    // Should stay on the same room URL and show the join screen
    await expect(page.getByRole('button', { name: /join now/i })).toBeVisible({ timeout: 5_000 })
    await expect(page).toHaveURL(new RegExp(ROOM))
  })

  test('can rejoin the same room after leaving', async ({ page }) => {
    await joinCall(page)
    await page.getByRole('button', { name: /leave call/i }).click()

    // Should be back on join screen
    await expect(page.getByRole('button', { name: /join now/i })).toBeVisible({ timeout: 5_000 })

    // Rejoin
    await page.getByPlaceholder(/your name/i).fill('Alice')
    await page.getByRole('button', { name: /join now/i }).click()
    await expect(page.getByRole('button', { name: /leave call/i })).toBeVisible({ timeout: 10_000 })
  })
})
