import { test, expect, type Page } from '@playwright/test'

const randomRoom = () => Math.random().toString(36).slice(2, 8)

const CTX_OPTS = {
  permissions: ['camera', 'microphone'] as string[],
  baseURL: 'http://localhost:3000',
}

async function gotoRoom(page: Page, roomCode: string) {
  await page.goto(`/${roomCode}`, { waitUntil: 'domcontentloaded' })
}

async function fillName(page: Page, name: string) {
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

async function joinRoom(page: Page, roomCode: string, name: string) {
  await gotoRoom(page, roomCode)
  await fillName(page, name)
  await page.getByRole('button', { name: /join now/i }).click()
  await expect(page.getByRole('button', { name: /leave call/i })).toBeVisible({ timeout: 10_000 })
}

test.describe('Two-user call', () => {
  test('both users can see each other after joining the same room', async ({ browser }) => {
    const roomCode = randomRoom()

    const ctx1 = await browser.newContext(CTX_OPTS)
    const ctx2 = await browser.newContext(CTX_OPTS)
    const page1 = await ctx1.newPage()
    const page2 = await ctx2.newPage()

    await test.step('Alice joins the room', async () => {
      await joinRoom(page1, roomCode, 'Alice')
      await expect(page1.getByText(roomCode)).toBeVisible()
    })

    await test.step('Bob joins the same room', async () => {
      await joinRoom(page2, roomCode, 'Bob')
      await expect(page2.getByText(roomCode)).toBeVisible()
    })

    await test.step('both users can see each other', async () => {
      await expect(page1.getByText('Bob')).toBeVisible({ timeout: 15_000 })
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

    await ctx1.close()
    await ctx2.close()
  })

  test('a user who leaves is removed from the other user\'s view', async ({ browser }) => {
    const roomCode = randomRoom()

    const ctx1 = await browser.newContext(CTX_OPTS)
    const ctx2 = await browser.newContext(CTX_OPTS)
    const page1 = await ctx1.newPage()
    const page2 = await ctx2.newPage()

    await test.step('both users join', async () => {
      await joinRoom(page1, roomCode, 'Alice')
      await joinRoom(page2, roomCode, 'Bob')
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

    await ctx1.close()
    await ctx2.close()
  })

  test('rejoining the same room after leaving works', async ({ browser }) => {
    const roomCode = randomRoom()

    const ctx1 = await browser.newContext(CTX_OPTS)
    const ctx2 = await browser.newContext(CTX_OPTS)
    const page1 = await ctx1.newPage()
    const page2 = await ctx2.newPage()

    await test.step('Alice joins', async () => {
      await joinRoom(page1, roomCode, 'Alice')
    })

    await test.step('Alice leaves and rejoins', async () => {
      await page1.getByRole('button', { name: /leave call/i }).click()
      await expect(page1.getByRole('button', { name: /join now/i })).toBeVisible({ timeout: 5_000 })

      await fillName(page1, 'Alice')
      await page1.getByRole('button', { name: /join now/i }).click()
      await expect(page1.getByRole('button', { name: /leave call/i })).toBeVisible({ timeout: 10_000 })
    })

    await test.step('Bob joins and can see Alice', async () => {
      await joinRoom(page2, roomCode, 'Bob')
      await expect(page2.getByText('Alice')).toBeVisible({ timeout: 15_000 })
      await expect(page1.getByText('Bob')).toBeVisible({ timeout: 15_000 })
    })

    await ctx1.close()
    await ctx2.close()
  })
})
