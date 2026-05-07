import { httpServerUri } from './config'

export interface IceServer {
  urls: string[]
  username?: string
  credential?: string
}

const FETCH_TIMEOUT_MS = 5_000
const MAX_ATTEMPTS = 3

export async function fetchIceServers(): Promise<IceServer[]> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const base = 500 * Math.pow(2, attempt - 1)
      const delay = base * (0.5 + Math.random() * 0.5)
      await new Promise(r => setTimeout(r, delay))
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(`${httpServerUri}/ice-servers`, { method: 'POST', signal: controller.signal })
      if (!res.ok) throw new Error(`ice-servers ${res.status}`)
      const body = (await res.json()) as { iceServers: IceServer[] }
      return body.iceServers
    } catch (e) {
      lastError = e
      console.warn(`[ice] fetch attempt ${attempt + 1}/${MAX_ATTEMPTS} failed`, e)
    } finally {
      clearTimeout(timeout)
    }
  }
  throw lastError
}
