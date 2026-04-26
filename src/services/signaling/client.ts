import type { Envelope, MsgType } from './protocol'

export type ConnState = 'connecting' | 'connected' | 'reconnecting' | 'failed'

type Handler = (env: Envelope) => void

const MAX_ATTEMPTS = 5
const GRACE_MS = 2000      // grace period before showing reconnect UI
const PING_MS = 15_000     // heartbeat interval
const MAX_MISSED_PONGS = 2 // missed pongs before treating connection as dead

export class SignalingClient {
  private ws: WebSocket | null = null
  private handlers = new Map<MsgType, Set<Handler>>()
  private url: string
  private peerId: string | null = null

  private disposed = false
  private attempt = 0
  private graceTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private missedPongs = 0

  onStateChange?: (state: ConnState, attempt: number) => void
  onReconnected?: () => void

  constructor(url: string) { this.url = url }

  connect(): void {
    if (this.disposed) return
    const ws = new WebSocket(this.url)
    this.ws = ws
    let established = false

    const onWelcome = (env: Envelope) => {
      this.off('welcome', onWelcome)
      this.peerId = env.from ?? null
      if (!this.peerId) { ws.close(); return }
      established = true
      const wasReconnecting = this.attempt > 0
      this.attempt = 0
      this.onStateChange?.('connected', 0)
      if (wasReconnecting) this.onReconnected?.()
    }
    this.on('welcome', onWelcome)

    ws.onmessage = (ev) => {
      try {
        const env = JSON.parse(ev.data) as Envelope
        if (env.type === 'pong') { this.missedPongs = 0; return }
        this.handlers.get(env.type)?.forEach(h => h(env))
      } catch (err) {
        console.error('signaling: bad message', err)
      }
    }

    ws.onopen = () => this.startHeartbeat()

    // onerror always fires before onclose — onclose is the single handler
    ws.onerror = () => {}

    ws.onclose = () => {
      this.off('welcome', onWelcome)
      this.stopHeartbeat()
      this.ws = null
      this.peerId = null
      if (this.disposed) return
      if (established) {
        // Was connected — grace period keeps brief blips invisible
        this.graceTimer = setTimeout(() => this.scheduleReconnect(), GRACE_MS)
      } else {
        // Never reached welcome — retry immediately via backoff
        this.scheduleReconnect()
      }
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    this.missedPongs = 0
    this.pingTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
      if (this.missedPongs >= MAX_MISSED_PONGS) { this.ws.close(); return }
      this.missedPongs++
      this.send('ping')
    }, PING_MS)
  }

  private stopHeartbeat() {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null }
    this.missedPongs = 0
  }

  private scheduleReconnect() {
    if (this.disposed) return
    if (this.attempt >= MAX_ATTEMPTS) {
      this.onStateChange?.('failed', this.attempt)
      return
    }
    const delay = Math.min(1000 * Math.pow(2, this.attempt), 16_000)
    this.attempt++
    this.onStateChange?.('reconnecting', this.attempt)
    setTimeout(() => { if (!this.disposed) this.connect() }, delay)
  }

  dispose() {
    this.disposed = true
    if (this.graceTimer) { clearTimeout(this.graceTimer); this.graceTimer = null }
    this.stopHeartbeat()
    this.ws?.close()
    this.ws = null
  }

  send<T>(type: MsgType, data?: T, extra?: Partial<Envelope>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    const env: Envelope = { type, ...extra, data: data as unknown }
    this.ws.send(JSON.stringify(env))
  }

  on(type: MsgType, handler: Handler) {
    let set = this.handlers.get(type)
    if (!set) { set = new Set(); this.handlers.set(type, set) }
    set.add(handler)
  }

  off(type: MsgType, handler: Handler) {
    this.handlers.get(type)?.delete(handler)
  }

  getPeerId() { return this.peerId }
}
