import { request } from '@playwright/test'

const SERVER = `http://${process.env.NEXT_PUBLIC_SERVER_DOMAIN ?? 'localhost:8080'}`
export const E2E_EMAIL = 'e2e@sessionly.test'
export const E2E_PASSWORD = 'e2e-password-123!'
export const AUTH_STATE_PATH = 'e2e/.auth-state.json'

export default async function globalSetup() {
    const ctx = await request.newContext({ baseURL: SERVER })

    // Register — 409 means the account already exists, which is fine.
    await ctx.post('/auth/register', {
        data: { email: E2E_EMAIL, password: E2E_PASSWORD, name: 'E2E Tester' },
    })

    // Login — the server sets the HttpOnly 'rt' refresh cookie on the context.
    const res = await ctx.post('/auth/login', {
        data: { email: E2E_EMAIL, password: E2E_PASSWORD },
    })
    if (!res.ok()) throw new Error(`E2E login failed: ${res.status()} ${await res.text()}`)

    // Persist the cookie jar so single-context tests start pre-authenticated.
    // Multi-context tests call createCallContexts() which does a fresh login per
    // context, avoiding the single-use rt token conflict.
    await ctx.storageState({ path: AUTH_STATE_PATH })
    await ctx.dispose()
}
