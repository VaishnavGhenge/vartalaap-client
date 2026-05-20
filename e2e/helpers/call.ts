import { expect, request, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from '@playwright/test'
import { E2E_EMAIL, E2E_PASSWORD } from '../global-setup'
import { installPeerConnectionTracker } from './webrtc'

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
// Server-side /auth/login is rate-limited at 10/min (see auth_handler.go).
// An E2E run does 2–3 logins per test × ~16 tests = ~50 logins in 2 minutes,
// which trips the limiter. To stay under it without artificially slowing the
// suite, freshAuthState caches a single login result per worker and only
// re-logs in if the rate limit is hit. This is safe because the access token
// returned by /auth/login is long-lived and tests don't trigger /auth/refresh.
// Server-side /auth/login is rate-limited at 10/min (auth_handler.go).
// Retries with linear backoff so back-to-back tests don't fail spuriously.
async function loginOnce(): Promise<{ state: BrowserContextOptions['storageState']; accessToken: string }> {
  const reqCtx = await request.newContext({ baseURL: SERVER })
  try {
    let lastStatus = 0
    for (let attempt = 0; attempt < 8; attempt++) {
      const res = await reqCtx.post('/auth/login', {
        data: { email: E2E_EMAIL, password: E2E_PASSWORD },
      })
      if (res.ok()) {
        const body = await res.json() as { accessToken: string }
        const state = await reqCtx.storageState()
        return { state, accessToken: body.accessToken }
      }
      lastStatus = res.status()
      if (lastStatus !== 429) break
      await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)))
    }
    throw new Error(`login failed ${lastStatus}`)
  } finally {
    await reqCtx.dispose()
  }
}

// freshAuthState returns a fresh login result every call. Each context gets
// its own rt cookie so /auth/refresh rotation across the two contexts in a
// test doesn't invalidate the other. This is the model the comment on
// createCallContexts depends on.
export async function freshAuthState(): Promise<BrowserContextOptions['storageState']> {
  return (await loginOnce()).state
}

// Worker-cached access token for fire-and-forget server-side actions like
// createRoom. Reusing avoids burning the /auth/login rate limit on every test.
// Safe because the access token is multi-use and long-lived; createRoom never
// needs a fresh rt cookie.
let cachedAccessToken: string | null = null
let cachedAccessAt = 0
const ACCESS_TOKEN_TTL_MS = 5 * 60_000

async function getCachedAccessToken(): Promise<string> {
  const now = Date.now()
  if (cachedAccessToken && now - cachedAccessAt < ACCESS_TOKEN_TTL_MS) {
    return cachedAccessToken
  }
  const { accessToken } = await loginOnce()
  cachedAccessToken = accessToken
  cachedAccessAt = now
  return cachedAccessToken
}

// Create two authenticated browser contexts for a single test. Each context
// gets its own fresh rt cookie so /auth/refresh in one doesn't invalidate
// the other (refresh tokens are single-use). Two logins per test × N tests
// can trip the /auth/login rate limit (10/min); loginOnce retries 429.
export async function createCallContexts(browser: Browser): Promise<{ ctx1: BrowserContext; ctx2: BrowserContext }> {
  const [state1, state2] = await Promise.all([freshAuthState(), freshAuthState()])
  const ctx1 = await browser.newContext({ ...CONTEXT_BASE, storageState: state1 })
  const ctx2 = await browser.newContext({ ...CONTEXT_BASE, storageState: state2 })
  // Install the PC tracker init script so the three-layer helpers in
  // helpers/webrtc.ts can read getStats() from these contexts. The base test
  // fixture only covers the default context — contexts created via
  // browser.newContext() must be wired explicitly.
  await Promise.all([
    ctx1.addInitScript(installPeerConnectionTracker),
    ctx2.addInitScript(installPeerConnectionTracker),
  ])
  return { ctx1, ctx2 }
}

/** Creates a real meet code via the server API using the e2e test account. */
export async function createRoom(): Promise<string> {
  const accessToken = await getCachedAccessToken()
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
  // When the user is authenticated (via freshAuthState), the pre-join screen
  // shows a profile card instead of a name input and the Join button is
  // already enabled with their account name. Skip filling in that branch.
  const joinButton = page.getByRole('button', { name: /join now/i })
  await expect(joinButton).toBeVisible({ timeout: 5_000 })

  const input = page.getByPlaceholder(/your name/i)
  const hasNameInput = await input.isVisible().catch(() => false)
  if (!hasNameInput) {
    await expect(joinButton).toBeEnabled()
    return
  }

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
