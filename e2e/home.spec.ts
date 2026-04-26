import { test, expect } from '@playwright/test'

const MEET_CODE_RE = /^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/

test.describe('Home page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('"New meeting" navigates to a valid meet-code URL', async ({ page }) => {
    await page.getByRole('button', { name: /new meeting/i }).click()
    await expect(page).toHaveURL(/\/[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/, { timeout: 5_000 })
    expect(page.url().split('/').pop()!).toMatch(MEET_CODE_RE)
  })

  test('two clicks generate different codes', async ({ page }) => {
    await page.getByRole('button', { name: /new meeting/i }).click()
    await expect(page).toHaveURL(/\/[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/, { timeout: 5_000 })
    const code1 = page.url().split('/').pop()!

    await page.goto('/')
    await page.getByRole('button', { name: /new meeting/i }).click()
    await expect(page).toHaveURL(/\/[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/, { timeout: 5_000 })
    expect(page.url().split('/').pop()!).not.toBe(code1)
  })

  test('joining by code navigates to that room', async ({ page }) => {
    await page.getByPlaceholder(/code or link/i).fill('abc-defg-hij')
    await page.getByRole('button', { name: /^join$/i }).click()
    await expect(page).toHaveURL(/\/abc-defg-hij$/, { timeout: 5_000 })
  })

  test('pasting a full URL extracts just the path', async ({ page }) => {
    await page.getByPlaceholder(/code or link/i).fill('http://localhost:3000/abc-defg-hij')
    await page.getByRole('button', { name: /^join$/i }).click()
    await expect(page).toHaveURL(/\/abc-defg-hij$/, { timeout: 5_000 })
  })

  test('Join is disabled when input is empty, enabled after typing', async ({ page }) => {
    const joinBtn = page.getByRole('button', { name: /^join$/i })
    await expect(joinBtn).toBeDisabled()
    await page.getByPlaceholder(/code or link/i).fill('x')
    await expect(joinBtn).toBeEnabled()
  })
})
