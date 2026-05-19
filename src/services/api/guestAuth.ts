import { httpServerUri } from './config'
import { setAccessToken } from './token'

export async function exchangeGuestToken(meetCode: string, guestToken: string): Promise<boolean> {
    try {
        const res = await fetch(`${httpServerUri}/auth/guest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ meetCode, token: guestToken }),
            signal: AbortSignal.timeout(5_000),
        })
        if (!res.ok) return false
        const body = await res.json() as { sfuToken?: string }
        if (!body.sfuToken) return false
        setAccessToken(body.sfuToken)
        return true
    } catch {
        return false
    }
}
