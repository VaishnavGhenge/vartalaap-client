import { httpServerUri } from './config'

export interface IceServer {
  urls: string[]
  username?: string
  credential?: string
}

const FETCH_TIMEOUT_MS = 5_000
const MAX_ATTEMPTS = 3
export const ICE_REFRESH_AFTER_MS = 45 * 60_000

export async function fetchIceServers(roomId: string): Promise<IceServer[]> {
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
      const res = await fetch(`${httpServerUri}/ice-servers`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      })
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

export function startIceServerKeepalive(
  roomId: string,
  onRefresh: (servers: IceServer[]) => void,
  onError?: (error: unknown) => void,
  refreshAfterMs = ICE_REFRESH_AFTER_MS,
): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const schedule = () => {
    if (stopped) return
    timer = setTimeout(() => {
      void fetchIceServers(roomId).then((servers) => {
        if (stopped) return
        onRefresh(servers)
        schedule()
      }).catch((error) => {
        if (stopped) return
        onError?.(error)
        // fetchIceServers already used bounded retries. Retry the lifecycle
        // sooner than the normal refresh interval while the old credentials
        // still have some useful life left.
        timer = setTimeout(schedule, Math.min(60_000, refreshAfterMs))
      })
    }, refreshAfterMs)
  }

  schedule()
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}
