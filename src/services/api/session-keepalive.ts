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
 * Guests hold only a room token (no refresh path) — for them this is a no-op.
 */

import { getAccessToken, subscribeTokenChange } from './token'
import { refreshSession } from './auth'

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
  let timer: ReturnType<typeof setTimeout> | null = null

  const clear = () => {
    if (timer) { clearTimeout(timer); timer = null }
  }

  const schedule = () => {
    clear()
    if (stopped) return
    const token = getAccessToken()
    if (!token) return // guest (room token only) or signed out — nothing to keep alive
    const expMs = jwtExpiryMs(token)
    if (expMs === null) return
    const delay = Math.max(0, expMs - Date.now() - REFRESH_LEAD_MS)
    timer = setTimeout(() => {
      void (async () => {
        const resp = await refreshSession()
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
