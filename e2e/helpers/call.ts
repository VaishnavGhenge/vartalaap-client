import { expect, type BrowserContext, type Page } from '@playwright/test'

export const CALL_CONTEXT_OPTIONS = {
  permissions: ['camera', 'microphone'] as string[],
  baseURL: 'http://localhost:3000',
}

export const randomRoom = () => Math.random().toString(36).slice(2, 8)

export async function gotoRoom(page: Page, roomCode: string) {
  await page.goto(`/${roomCode}`, { waitUntil: 'domcontentloaded' })
}

export async function fillName(page: Page, name: string) {
  const input = page.getByPlaceholder(/your name/i)
  const joinButton = page.getByRole('button', { name: /join now/i })
  await expect(input).toBeVisible()

  for (let attempt = 0; attempt < 20; attempt++) {
    await input.fill(name)
    if (await joinButton.isEnabled()) return
    await page.waitForTimeout(100)
  }

  await expect(input).toHaveValue(name)
  await expect(joinButton).toBeEnabled()
}

export async function joinRoom(page: Page, roomCode: string, name: string) {
  await gotoRoom(page, roomCode)
  await fillName(page, name)
  await page.getByRole('button', { name: /join now/i }).click()
  await expect(page.getByRole('button', { name: /leave call/i })).toBeVisible({ timeout: 10_000 })
}

export type InitScriptTarget = Page | BrowserContext
