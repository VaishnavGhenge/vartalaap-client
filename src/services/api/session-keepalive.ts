/**
 * Proactive access-token refresh for long-lived call sessions.
 *
 * apiFetch heals expired tokens reactively (401 → refresh → retry), but the
 * SFU layer (partytracks) does its own fetches and cannot run that flow. With
 * a 15-minute access TTL, any call longer than that would start failing SFU
 * requests. Instead of intercepting those requests, we keep the token fresh
 * the whole time a call is active: decode the JWT's exp and refresh shortly
 * before it, so the live Authorization header SfuSession maintains is always
 * valid and the user never sees auth at all.
 *
 * Room-scoped guest tokens use their own authenticated renewal endpoint.
 */

import { getAccessToken, getRoomToken, subscribeTokenChange } from './token'
import { refreshSession } from './auth'
import { refreshGuestSession } from './guest-refresh'

// Refresh this long before the token's exp. Generous enough to absorb a slow
// /auth/refresh round-trip; far smaller than the 15-minute TTL.
const REFRESH_LEAD_MS = 60_000

// Decodes the exp claim (ms epoch) from a JWT without verifying it — the
// server remains the authority; this is only used for scheduling.
export function jwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const exp = (JSON.parse(json) as { exp?: number }).exp
    return typeof exp === 'number' ? exp * 1000 : null
  } catch {
    return null
  }
}

export interface SessionKeepaliveOptions {
  // The refresh cookie is dead — the session cannot be renewed. Fired at most
  // once per keepalive. The call keeps running (media and signaling don't
  // need the token); the caller decides how to surface it.
  onSessionDead: () => void
}

export function startSessionKeepalive(opts: SessionKeepaliveOptions): () => void {
  let stopped = false
  let deadNotified = false
  let failures = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const clear = () => {
    if (timer) { clearTimeout(timer); timer = null }
  }

  const schedule = () => {
    clear()
    if (stopped) return
    const accessToken = getAccessToken()
    const roomToken = getRoomToken()
    const token = accessToken ?? roomToken
    if (!token) return
    const expMs = jwtExpiryMs(token)
    if (expMs === null) return
    const delay = Math.max(0, expMs - Date.now() - REFRESH_LEAD_MS)
    timer = setTimeout(() => {
      void (async () => {
        let resp
        try {
          resp = accessToken ? await refreshSession() : await refreshGuestSession()
          failures = 0
        } catch {
          if (!stopped) {
            const delay = Math.min(30_000, 1_000 * 2 ** Math.min(failures++, 5)) * (0.5 + Math.random() * 0.5)
            clear()
            timer = setTimeout(schedule, delay)
          }
          return
        }
        if (stopped) return
        if (!resp && !deadNotified) {
          deadNotified = true
          opts.onSessionDead()
        }
        // On success, setAccessToken fires the token-change listener below,
        // which reschedules against the new exp.
      })()
    }, delay)
  }

  // Any token change (our refresh, an apiFetch-triggered refresh elsewhere,
  // re-login) re-anchors the schedule to the current token.
  const unsubscribe = subscribeTokenChange(schedule)
  schedule()

  return () => {
    stopped = true
    clear()
    unsubscribe()
  }
}
