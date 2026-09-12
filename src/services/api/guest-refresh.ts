import { authServerUri } from './config'
import { getRoomToken, setRoomToken } from './token'

const FETCH_TIMEOUT_MS = 5_000
const MAX_ATTEMPTS = 3

export async function refreshGuestSession(): Promise<boolean> {
  const token = getRoomToken()
  if (!token) return false
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const base = 500 * 2 ** (attempt - 1)
      await new Promise((resolve) => setTimeout(resolve, base * (0.5 + Math.random() * 0.5)))
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const response = await fetch(`${authServerUri}/auth/guest/refresh`, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.status === 401 || response.status === 403) {
        if (getRoomToken() === token) setRoomToken(null)
        return false
      }
      if (!response.ok) throw new Error(`guest refresh ${response.status}`)
      const body = await response.json() as { sfuToken: string }
      if (!body.sfuToken) throw new Error('guest refresh returned no token')
      if (getRoomToken() === token) setRoomToken(body.sfuToken)
      return true
    } catch (error) {
      lastError = error
    } finally {
      clearTimeout(timeout)
    }
  }
  throw lastError
}
