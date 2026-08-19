import { httpServerUri } from '@/src/services/api/config'
import { apiFetch } from '@/src/services/api/fetch'

// Mirrors calendarStatusResponse in
// vartalaap-server/internal/httpx/calendar_handler.go. Kept collocated with the
// API call so the wire contract has one owner, matching availability.ts.
export interface CalendarStatus {
    provider: 'google'
    // True only while the grant is live. A revoked grant reports
    // connected=false WITH needsReconnect=true — the two are different states
    // and the UI has to say different things.
    connected: boolean
    needsReconnect: boolean
    accountEmail?: string
    calendarId?: string
    lastSyncedAt?: string
    lastError?: string
    // False when the server has no Google credentials configured, so the UI
    // can hide the section instead of offering a button that cannot work.
    available: boolean
}

interface ConnectResponse {
    authUrl: string
}

export async function getCalendarStatus(): Promise<CalendarStatus> {
    return apiFetch<CalendarStatus>('GET', `${httpServerUri}/me/calendar/status`)
}

/**
 * Returns the Google consent URL. The caller navigates to it.
 *
 * Deliberately two steps rather than a server 302: this request carries the
 * Bearer token, and following a redirect chain through Google with an
 * Authorization header attached is how access tokens end up in someone else's
 * logs. The server identifies the user on the way back through a signed state
 * parameter instead.
 */
export type CalendarReturnTo = 'dashboard' | 'onboarding'

export async function startCalendarConnect(returnTo: CalendarReturnTo = 'dashboard'): Promise<string> {
    // `return` tells the server's OAuth callback where to send the browser
    // afterwards. It is mapped through a closed allowlist server-side, so this
    // cannot become an open redirect. Without it a host who connects during
    // onboarding lands on the dashboard and skips the rest of the wizard.
    const body = await apiFetch<ConnectResponse>(
        'GET',
        `${httpServerUri}/me/calendar/connect/google?return=${returnTo}`,
    )
    return body.authUrl
}

export async function disconnectCalendar(): Promise<void> {
    await apiFetch<void>('DELETE', `${httpServerUri}/me/calendar/disconnect`)
}

// Outcome codes the OAuth callback appends as ?calendar=… when it bounces the
// browser back to the dashboard. The set is closed on the server side so no
// third-party text ever reaches the URL.
export type CalendarCallbackResult =
    | 'connected'
    | 'denied'
    | 'invalid_callback'
    | 'connect_failed'

const CALLBACK_MESSAGES: Record<CalendarCallbackResult, { tone: 'info' | 'warning'; text: string }> = {
    connected: { tone: 'info', text: 'Google Calendar connected. Busy times are now blocked from your booking page.' },
    denied: { tone: 'warning', text: 'Connection cancelled. Sessionly cannot see your calendar.' },
    invalid_callback: { tone: 'warning', text: 'That connection link was incomplete. Try connecting again.' },
    connect_failed: { tone: 'warning', text: 'Connection failed, most likely because the link expired. Try again.' },
}

export function calendarCallbackMessage(
    raw: string | null,
): { tone: 'info' | 'warning'; text: string } | null {
    if (!raw) return null
    return CALLBACK_MESSAGES[raw as CalendarCallbackResult] ?? null
}
