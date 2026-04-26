import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { ConnectionBanner } from '../ConnectionBanner'

beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('ConnectionBanner — connected', () => {
  it('renders nothing when connection is established', () => {
    const { container } = render(
      <ConnectionBanner connState="connected" reconnectAttempt={0} onLeave={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ConnectionBanner — reconnecting', () => {
  it('shows the amber reconnecting banner', () => {
    render(
      <ConnectionBanner connState="reconnecting" reconnectAttempt={2} onLeave={vi.fn()} />
    )
    expect(screen.getByText(/reconnecting/i)).toBeInTheDocument()
  })

  it('displays the current attempt and max attempts', () => {
    render(
      <ConnectionBanner connState="reconnecting" reconnectAttempt={3} onLeave={vi.fn()} />
    )
    expect(screen.getByText(/3/)).toBeInTheDocument()
    expect(screen.getByText(/5/)).toBeInTheDocument()
  })
})

describe('ConnectionBanner — failed', () => {
  it('shows the connection-lost overlay', () => {
    render(
      <ConnectionBanner connState="failed" reconnectAttempt={5} onLeave={vi.fn()} />
    )
    expect(screen.getByText(/connection lost/i)).toBeInTheDocument()
  })

  it('shows a 5s countdown', () => {
    render(
      <ConnectionBanner connState="failed" reconnectAttempt={5} onLeave={vi.fn()} />
    )
    expect(screen.getByText(/5s/)).toBeInTheDocument()
  })

  it('decrements the countdown every second', () => {
    render(
      <ConnectionBanner connState="failed" reconnectAttempt={5} onLeave={vi.fn()} />
    )

    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByText(/4s/)).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByText(/3s/)).toBeInTheDocument()
  })

  it('calls onLeave automatically when countdown reaches 0', () => {
    const onLeave = vi.fn()
    render(
      <ConnectionBanner connState="failed" reconnectAttempt={5} onLeave={onLeave} />
    )

    act(() => vi.advanceTimersByTime(5000))

    expect(onLeave).toHaveBeenCalledOnce()
  })

  it('calls onLeave immediately when the Leave now button is clicked', () => {
    const onLeave = vi.fn()
    render(
      <ConnectionBanner connState="failed" reconnectAttempt={5} onLeave={onLeave} />
    )

    fireEvent.click(screen.getByRole('button', { name: /leave now/i }))

    expect(onLeave).toHaveBeenCalledOnce()
  })

  it('resets countdown to 5 if connection recovers and then fails again', () => {
    const { rerender } = render(
      <ConnectionBanner connState="failed" reconnectAttempt={5} onLeave={vi.fn()} />
    )

    act(() => vi.advanceTimersByTime(3000)) // countdown at 2
    expect(screen.getByText(/2s/)).toBeInTheDocument()

    rerender(
      <ConnectionBanner connState="reconnecting" reconnectAttempt={1} onLeave={vi.fn()} />
    )
    rerender(
      <ConnectionBanner connState="failed" reconnectAttempt={5} onLeave={vi.fn()} />
    )

    expect(screen.getByText(/5s/)).toBeInTheDocument()
  })
})
