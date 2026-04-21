import type { Envelope, MsgType } from './protocol'

type Handler = (env: Envelope) => void

export class SignalingClient {
  private ws: WebSocket | null = null
  private handlers = new Map<MsgType, Set<Handler>>()
  private url: string
  private peerId: string | null = null

  constructor(url: string) { this.url = url }

  async connect(): Promise<string> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url)
      this.ws = ws

      const onWelcome = (env: Envelope) => {
        this.peerId = env.from ?? null
        this.off('welcome', onWelcome)
        if (this.peerId) resolve(this.peerId)
        else reject(new Error('welcome missing peer id'))
      }
      this.on('welcome', onWelcome)

      ws.onmessage = (ev) => {
        try {
          const env = JSON.parse(ev.data) as Envelope
          this.handlers.get(env.type)?.forEach(h => h(env))
        } catch (err) {
          console.error('signaling: bad message', err)
        }
      }
      ws.onerror = () => reject(new Error('ws error'))
      ws.onclose = () => {
        this.ws = null
        this.peerId = null
      }
    })
  }

  disconnect() { this.ws?.close() }

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
