import { expect, request, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from '@playwright/test'
import { E2E_EMAIL, E2E_PASSWORD } from '../global-setup'

const SERVER = `http://${process.env.NEXT_PUBLIC_SERVER_DOMAIN ?? 'localhost:8080'}`

const CONTEXT_BASE = {
  permissions: ['camera', 'microphone'] as string[],
  baseURL: 'http://localhost:3000',
}

// Shared context options for tests that only use a single browser context.
// The single auth-state file is consumed once per test run of the full suite —
// only use this for single-context tests.
export const CALL_CONTEXT_OPTIONS = {
  ...CONTEXT_BASE,
}

// Login once via the API and return a Playwright storageState suitable for a
// new browser context.  Each call creates an independent server session so
// concurrent contexts each get their own single-use rt token.
async function freshAuthState(): Promise<BrowserContextOptions['storageState']> {
  const reqCtx = await request.newContext({ baseURL: SERVER })
  const res = await reqCtx.post('/auth/login', {
    data: { email: E2E_EMAIL, password: E2E_PASSWORD },
  })
  if (!res.ok()) throw new Error(`freshAuthState: login failed ${res.status()}`)
  const state = await reqCtx.storageState()
  await reqCtx.dispose()
  return state
}

// Create two authenticated browser contexts for a single test.
// Each context gets its own fresh rt token so both can call /auth/refresh
// independently without invalidating each other.
export async function createCallContexts(browser: Browser): Promise<{ ctx1: BrowserContext; ctx2: BrowserContext }> {
  const [state1, state2] = await Promise.all([freshAuthState(), freshAuthState()])
  const ctx1 = await browser.newContext({ ...CONTEXT_BASE, storageState: state1 })
  const ctx2 = await browser.newContext({ ...CONTEXT_BASE, storageState: state2 })
  return { ctx1, ctx2 }
}

/** Creates a real meet code via the server API using the e2e test account. */
export async function createRoom(): Promise<string> {
  // Login to get a fresh access token (Node-side, not browser).
  const loginRes = await fetch(`${SERVER}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
  })
  if (!loginRes.ok) throw new Error(`createRoom: login failed ${loginRes.status}`)
  const { accessToken } = await loginRes.json() as { accessToken: string }

  const res = await fetch(`${SERVER}/meets/new`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`/meets/new failed: ${res.status}`)
  const data = await res.json() as { meetCode: string }
  return data.meetCode
}

export async function gotoRoom(page: Page, roomCode: string) {
  await page.goto(`/room/${roomCode}`, { waitUntil: 'domcontentloaded' })
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
