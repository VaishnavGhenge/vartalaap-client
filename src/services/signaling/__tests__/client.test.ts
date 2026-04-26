import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SignalingClient } from '../client'

// ─── Mock WebSocket ───────────────────────────────────────────────────────────

class MockWebSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  onopen: ((e: Event) => void) | null = null
  onclose: ((e: CloseEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  sent: string[] = []
  url: string

  constructor(url: string) { this.url = url; instances.push(this) }

  send(data: string) { this.sent.push(data) }
  close() { this.readyState = MockWebSocket.CLOSED; this.onclose?.(new CloseEvent('close', { code: 1000 })) }

  // Test helpers
  open() { this.readyState = MockWebSocket.OPEN; this.onopen?.(new Event('open')) }
  receive(env: object) { this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(env) })) }
  drop() { this.readyState = MockWebSocket.CLOSED; this.onclose?.(new CloseEvent('close', { code: 1006 })) }
  welcome(peerId = 'peer-abc') { this.receive({ type: 'welcome', from: peerId }) }
}

let instances: MockWebSocket[]

beforeEach(() => {
  instances = []
  vi.stubGlobal('WebSocket', MockWebSocket)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// Helper to get the latest WS instance
const ws = () => instances[instances.length - 1]

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SignalingClient — initial connection', () => {
  it('fires onStateChange("connected", 0) after welcome', () => {
    const client = new SignalingClient('ws://test')
    const onChange = vi.fn()
    client.onStateChange = onChange

    client.connect()
    ws().open()
    ws().welcome()

    expect(onChange).toHaveBeenCalledWith('connected', 0)
  })

  it('does NOT fire onReconnected on first connect', () => {
    const client = new SignalingClient('ws://test')
    const onReconnected = vi.fn()
    client.onReconnected = onReconnected

    client.connect()
    ws().open()
    ws().welcome()

    expect(onReconnected).not.toHaveBeenCalled()
  })

  it('closes the socket immediately if welcome has no from (peerId)', () => {
    const client = new SignalingClient('ws://test')
    client.connect()
    ws().open()
    ws().receive({ type: 'welcome' }) // no `from`

    expect(ws().readyState).toBe(MockWebSocket.CLOSED)
  })

  it('dispatches registered message handlers', () => {
    const client = new SignalingClient('ws://test')
    const handler = vi.fn()
    client.on('joined', handler)

    client.connect()
    ws().open()
    ws().welcome()
    ws().receive({ type: 'joined', data: { peers: [] } })

    expect(handler).toHaveBeenCalledOnce()
  })
})

describe('SignalingClient — reconnection', () => {
  it('fires onStateChange("reconnecting", 1) after connection drops post-welcome', () => {
    const client = new SignalingClient('ws://test')
    const onChange = vi.fn()
    client.onStateChange = onChange

    client.connect()
    ws().open()
    ws().welcome()

    onChange.mockClear()
    ws().drop()

    // Grace period must pass before reconnecting state fires
    vi.advanceTimersByTime(2000)

    expect(onChange).toHaveBeenCalledWith('reconnecting', 1)
  })

  it('fires onStateChange("reconnecting") immediately (no grace) if never reached welcome', () => {
    const client = new SignalingClient('ws://test')
    const onChange = vi.fn()
    client.onStateChange = onChange

    client.connect()
    ws().open()
    ws().drop() // never sent welcome

    // No grace period — reconnecting should fire right away
    expect(onChange).toHaveBeenCalledWith('reconnecting', 1)
  })

  it('fires onStateChange("connected") AND onReconnected after reconnect succeeds', () => {
    const client = new SignalingClient('ws://test')
    const onChange = vi.fn()
    const onReconnected = vi.fn()
    client.onStateChange = onChange
    client.onReconnected = onReconnected

    // First connection
    client.connect(); ws().open(); ws().welcome()

    // Drop and wait out grace
    ws().drop()
    vi.advanceTimersByTime(2000) // grace period

    // Reconnect attempt fires — advance past backoff (1000ms for attempt 1)
    vi.advanceTimersByTime(1000)

    // New WS should have been created
    expect(instances.length).toBe(2)
    ws().open()
    ws().welcome()

    expect(onChange).toHaveBeenCalledWith('connected', 0)
    expect(onReconnected).toHaveBeenCalledOnce()
  })

  it('fires onStateChange("failed") after MAX_ATTEMPTS (5) consecutive failures', () => {
    const client = new SignalingClient('ws://test')
    const onChange = vi.fn()
    client.onStateChange = onChange

    client.connect()

    // Each drop triggers scheduleReconnect. "failed" fires when attempt >= MAX_ATTEMPTS
    // at the START of scheduleReconnect. Since attempt starts at 0 and increments inside,
    // we need 6 drops: drops 1-5 each schedule a reconnect, drop 6 hits attempt=5 >= 5.
    for (let i = 0; i < 6; i++) {
      ws().open()
      ws().drop()
      vi.advanceTimersByTime(16_000) // advance past longest backoff (16s)
    }

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]
    expect(lastCall[0]).toBe('failed')
  })

  it('does not reconnect after dispose()', () => {
    const client = new SignalingClient('ws://test')
    const onChange = vi.fn()
    client.onStateChange = onChange

    client.connect()
    ws().open()
    ws().welcome()

    client.dispose()
    const countBefore = instances.length

    ws().drop()
    vi.advanceTimersByTime(10_000)

    expect(instances.length).toBe(countBefore) // no new WS created
    expect(onChange).not.toHaveBeenCalledWith('reconnecting', expect.any(Number))
  })
})

describe('SignalingClient — grace period', () => {
  it('does not show reconnecting during the 2s grace window after an established drop', () => {
    const client = new SignalingClient('ws://test')
    const onChange = vi.fn()
    client.onStateChange = onChange

    client.connect(); ws().open(); ws().welcome()
    onChange.mockClear()

    ws().drop()
    vi.advanceTimersByTime(1999) // just under grace

    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows reconnecting after the grace window expires', () => {
    const client = new SignalingClient('ws://test')
    const onChange = vi.fn()
    client.onStateChange = onChange

    client.connect(); ws().open(); ws().welcome()
    onChange.mockClear()

    ws().drop()
    vi.advanceTimersByTime(2000)

    expect(onChange).toHaveBeenCalledWith('reconnecting', 1)
  })
})

describe('SignalingClient — heartbeat', () => {
  it('sends a ping every 15 seconds while connected', () => {
    const client = new SignalingClient('ws://test')
    client.connect(); ws().open(); ws().welcome()

    vi.advanceTimersByTime(15_000)
    const pings = ws().sent.filter(m => JSON.parse(m).type === 'ping')
    expect(pings.length).toBe(1)

    vi.advanceTimersByTime(15_000)
    const pings2 = ws().sent.filter(m => JSON.parse(m).type === 'ping')
    expect(pings2.length).toBe(2)
  })

  it('closes the connection after 2 missed pongs', () => {
    const client = new SignalingClient('ws://test')
    client.connect(); ws().open(); ws().welcome()

    // The close fires on the 3rd tick: ticks 1+2 accumulate misses,
    // tick 3 sees missedPongs >= MAX_MISSED_PONGS and calls ws.close().
    vi.advanceTimersByTime(15_000) // tick 1: missedPongs 0→1
    vi.advanceTimersByTime(15_000) // tick 2: missedPongs 1→2
    vi.advanceTimersByTime(15_000) // tick 3: 2 >= 2 → close

    expect(ws().readyState).toBe(MockWebSocket.CLOSED)
  })

  it('resets missed pong count when a pong arrives', () => {
    const client = new SignalingClient('ws://test')
    client.connect(); ws().open(); ws().welcome()

    vi.advanceTimersByTime(15_000) // tick 1: missedPongs 0→1
    ws().receive({ type: 'pong' }) // reset to 0

    vi.advanceTimersByTime(15_000) // tick 2: missedPongs 0→1 (reset worked)
    vi.advanceTimersByTime(15_000) // tick 3: missedPongs 1→2
    vi.advanceTimersByTime(15_000) // tick 4: 2 >= 2 → close

    expect(ws().readyState).toBe(MockWebSocket.CLOSED)
  })
})

describe('SignalingClient — send', () => {
  it('sends a JSON envelope when connected', () => {
    const client = new SignalingClient('ws://test')
    client.connect(); ws().open(); ws().welcome()

    client.send('join', { name: 'Alice' }, { room: 'room-1' })

    const msg = JSON.parse(ws().sent[ws().sent.length - 1])
    expect(msg).toMatchObject({ type: 'join', room: 'room-1', data: { name: 'Alice' } })
  })

  it('is a no-op when the socket is not open', () => {
    const client = new SignalingClient('ws://test')
    client.connect() // CONNECTING, not OPEN

    client.send('join', { name: 'Alice' })

    expect(ws().sent).toHaveLength(0)
  })
})

describe('SignalingClient — dispose', () => {
  it('closes the websocket immediately', () => {
    const client = new SignalingClient('ws://test')
    client.connect(); ws().open()

    client.dispose()

    expect(ws().readyState).toBe(MockWebSocket.CLOSED)
  })

  it('prevents connect() from doing anything after dispose', () => {
    const client = new SignalingClient('ws://test')
    client.connect(); ws().open(); ws().welcome()
    client.dispose()

    client.connect() // should be a no-op

    expect(instances.length).toBe(1) // no second WebSocket
  })
})
