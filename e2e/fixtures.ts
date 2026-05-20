/**
 * Extended Playwright test fixture.
 *
 * Specs that need WebRTC media assertions should import `test` and `expect`
 * from this file instead of '@playwright/test'. The context fixture installs
 * the PC tracker init script before any app code runs, so helpers in
 * ./helpers/webrtc.ts can read getStats() from every active RTCPeerConnection
 * without app-side changes.
 *
 * See e2e/TESTING.md for the rationale.
 */

import { test as base, expect } from '@playwright/test'
import { installPeerConnectionTracker } from './helpers/webrtc'

export const test = base.extend({
  context: async ({ context }, use) => {
    // addInitScript runs before any document script in the page — including
    // partytracks — so RTCPeerConnection is wrapped before the first
    // construction.
    await context.addInitScript(installPeerConnectionTracker)
    await use(context)
  },
})

export { expect }
