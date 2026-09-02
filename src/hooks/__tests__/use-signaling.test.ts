import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSignaling } from '../use-signaling'

vi.mock('@/src/services/api/config', () => ({ wsServerUri: 'ws://test' }))

class MockWebSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  onopen: ((e: Event) => void) | null = null
  onclose: ((e: CloseEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  sent: string[] = []

  constructor(public url: string) { instances.push(this) }

  send(data: string) { this.sent.push(data) }
  close() { this.readyState = MockWebSocket.CLOSED; this.onclose?.(new CloseEvent('close', { code: 1000 })) }

  open() { this.readyState = MockWebSocket.OPEN; this.onopen?.(new Event('open')) }
  receive(env: object) { this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(env) })) }
  drop() { this.readyState = MockWebSocket.CLOSED; this.onclose?.(new CloseEvent('close', { code: 1006 })) }
  welcome(peerId = 'peer-abc') { this.receive({ type: 'welcome', from: peerId }) }
}

let instances: MockWebSocket[]
const ws = () => instances[instances.length - 1]

beforeEach(() => {
  instances = []
  vi.stubGlobal('WebSocket', MockWebSocket)
  vi.useFakeTimers()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('useSignaling', () => {
  it('exposes the client once the socket is up', () => {
    const { result } = renderHook(() => useSignaling(true))
    expect(result.current.client).toBeNull()

    act(() => { ws().open(); ws().welcome() })

    expect(result.current.client).not.toBeNull()
    expect(result.current.connState).toBe('connected')
  })

  // The whole call hangs off this identity. useCall's effect keys on `client`,
  // so nulling it mid-blip tore the call down: local media stopped, the room
  // token cleared (a guest had to be re-admitted) and the reconnect handler was
  // deregistered before it could run.
  it('keeps the same client across a reconnect', () => {
    const { result } = renderHook(() => useSignaling(true))
    act(() => { ws().open(); ws().welcome() })
    const first = result.current.client
    expect(first).not.toBeNull()

    act(() => { ws().drop() })
    act(() => { vi.advanceTimersByTime(2_000) })

    expect(result.current.connState).toBe('reconnecting')
    expect(result.current.client).toBe(first)

    act(() => { vi.advanceTimersByTime(2_000) })
    act(() => { ws().open(); ws().welcome() })

    expect(result.current.client).toBe(first)
    expect(result.current.connState).toBe('connected')
  })

  it('reports the attempt count while it retries', () => {
    const { result } = renderHook(() => useSignaling(true))
    act(() => { ws().open(); ws().welcome() })

    act(() => { ws().drop() })
    act(() => { vi.advanceTimersByTime(2_000) })

    expect(result.current.reconnectAttempt).toBeGreaterThan(0)
  })

  it('drops the client when disabled', () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useSignaling(enabled),
      { initialProps: { enabled: true } },
    )
    act(() => { ws().open(); ws().welcome() })
    expect(result.current.client).not.toBeNull()

    rerender({ enabled: false })

    expect(result.current.client).toBeNull()
  })
})
